import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { Store } from '../build-desktop/backend/store.js';
import { createService } from '../build-desktop/backend/service.js';
import { publicShop } from '../build-desktop/src/shop-view.js';
import { writeProjectArchive, readProjectArchive } from '../build-desktop/backend/archive.js';

async function fixture(fn) { const directory = mkdtempSync(join(tmpdir(),'arcane-shop-')); const store = await Store.open(directory); try { await fn(store,directory); } finally { store.close(); rmSync(directory,{ recursive:true,force:true,maxRetries:5,retryDelay:100 }); } }
function setup(store) {
  const projectId = store.state().activeId; const shopId = store.state().projects[0].shops[0].id;
  const run = (type,extra={}) => store.execute({ id:randomUUID(),type,projectId,shopId,...extra });
  const project = () => store.state().projects.find(p => p.id === projectId); return { projectId,shopId,run,project,shop:() => project().shops.find(s => s.id === shopId) };
}
const item = (extra={}) => ({ id:randomUUID(),name:'Товар',description:'Описание',notes:'',category:'Снаряжение',price:1,currency:'gp',stock:3,visible:true,version:0,...extra });

test('Shop publication is explicit, hides all private fields and restores the scene', async () => fixture(async (store,directory) => {
  const { projectId,shopId,run,shop } = setup(store);
  run('shop.update',{ shop:{ name:'Алхимик',notes:'ТАЙНА_ТОРГОВЦА',merchant:'Ирвин' } });
  const hidden = item({ name:'ЗАПРЕТНЫЙ_ТОВАР',notes:'ТАЙНА_ТОВАРА',visible:false }); run('shop.item.save',{ item:hidden });
  const visible = item({ name:'Открытый товар',notes:'СЕКРЕТНАЯ_СЕБЕСТОИМОСТЬ' }); run('shop.item.save',{ item:visible });
  assert.equal(store.publicView(),null); run('shop.show'); assert.equal(store.state().liveId,projectId);
  const view = store.publicView(); assert.equal(view.shop.name,'Алхимик'); assert.equal(view.characterId,''); assert.ok(!Object.hasOwn(view,'hp'));
  const serialized = JSON.stringify(view); for (const secret of ['ТАЙНА_ТОРГОВЦА','ЗАПРЕТНЫЙ_ТОВАР','ТАЙНА_ТОВАРА','СЕКРЕТНАЯ_СЕБЕСТОИМОСТЬ','"notes"','"visible"','"version"']) assert.ok(!serialized.includes(secret),secret);
  const restored = await Store.open(directory); try { assert.deepEqual(restored.publicView(),view); assert.equal(restored.state().projects[0].shops[0].notes,'ТАЙНА_ТОРГОВЦА'); } finally { restored.close(); }
  run('shop.hide'); assert.equal(store.publicView().shop,null); assert.equal(store.publicView().characterId,'aristocrat');
  run('shop.show'); run('project.live'); assert.equal(store.publicView().shop,null);
  run('project.duplicate'); const clone = store.state().projects.at(-1);
  store.execute({ id:randomUUID(),type:'shop.update',projectId:clone.id,shopId,shop:{ name:'Другая лавка' } }); assert.equal(shop().name,'Алхимик');
}));

test('Public shop pagination respects visibility, categories, sold-out filtering and clamps stale pages', async () => fixture(store => {
  const { run,project,shop } = setup(store);
  for (let i=0;i<10;i++) run('shop.item.save',{ item:item({ name:`Зелье ${i}`,category:'Зелья',stock:i === 9 ? 0 : 1 }) });
  run('shop.update',{ shop:{ displayCategory:'Зелья',hideSoldOut:true } });
  let view = publicShop(project(),shop().id); assert.equal(view.total,10); assert.equal(view.pages,2);
  run('shop.page',{ targetIndex:1 }); view = publicShop(project(),shop().id); assert.equal(view.page,1); assert.equal(view.items.length,4);
  for (const entry of shop().items.filter(i => i.category === 'Зелья' && i.stock !== 0).slice(0,7)) run('shop.item.visible',{ itemId:entry.id,visible:false });
  view = publicShop(project(),shop().id); assert.equal(view.page,0); assert.equal(view.total,3); assert.equal(view.pages,1);
  assert.throws(() => run('shop.page',{ targetIndex:9 }));
}));

test('Stock changes are deduplicated and stale item editors cannot overwrite sales', async () => fixture(store => {
  const { projectId,shopId,run,shop } = setup(store); const original = shop().items[0];
  const sale = { id:randomUUID(),type:'shop.stock',projectId,shopId,itemId:original.id,amount:-1 };
  store.execute(sale); store.execute(sale); assert.equal(shop().items[0].stock,original.stock-1);
  assert.throws(() => run('shop.item.save',{ item:{ ...original,price:100 } }));
  const before = store.state(); assert.throws(() => run('shop.stock',{ itemId:original.id,amount:-999 })); assert.deepEqual(store.state(),before);
  assert.throws(() => run('shop.item.save',{ item:item({ price:1.234 }) }));
  run('shop.duplicate'); const copied = store.state().projects[0].shops.at(-1); assert.notEqual(copied.id,shopId); assert.notEqual(copied.items[0].id,original.id);
}));

test('Shop artwork and stock travel in the portable project archive', async () => fixture(async (store,directory) => {
  const target = mkdtempSync(join(tmpdir(),'arcane-shop-import-'));
  try {
    const { projectId,shopId,run,shop,project } = setup(store); const itemId = shop().items[0].id;
    const bytes = readFileSync('public/assets/aristocrat.png'); const name = `${randomUUID()}.png`; mkdirSync(join(directory,'media'),{ recursive:true }); writeFileSync(join(directory,'media',name),bytes);
    store.execute({ id:randomUUID(),type:'shop.artwork',projectId,shopId,itemId },undefined,undefined,{ image:`/media/${name}`,width:1024,height:1536 });
    run('shop.show'); const filename = join(target,'shop.zip'); await writeProjectArchive(project(),directory,resolve('public'),filename);
    const imported = await readProjectArchive(filename,target); const artwork = imported.project.shops[0].items[0].artwork;
    assert.notEqual(artwork.image,`/media/${name}`); assert.deepEqual(readFileSync(join(target,artwork.image)),bytes); assert.equal(imported.project.shops[0].items[0].stock,3);
  } finally { rmSync(target,{ recursive:true,force:true,maxRetries:5,retryDelay:100 }); }
}));

test('Shop HTTP/WS enforces roles and never exposes hidden item names or image URLs', async () => {
  const directory = mkdtempSync(join(tmpdir(),'arcane-shop-http-')); const service = await createService(directory); const server = createServer((req,res) => { void service.handle(req,res,() => { res.writeHead(404); res.end(); }); }); service.attach(server);
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization:`Bearer ${service.master}`,Origin:origin,'Content-Type':'application/json' }; const project = service.store.state().projects[0]; const shopId = project.shops[0].id; const itemId = project.shops[0].items[0].id;
  let ws;
  const post = async extra => fetch(origin+'/api/command',{ method:'POST',headers,body:JSON.stringify({ id:randomUUID(),projectId:project.id,shopId,...extra }) });
  try {
    const upload = await fetch(`${origin}/api/shop-artwork?projectId=${project.id}&shopId=${shopId}&itemId=${itemId}`,{ method:'POST',headers:{ ...headers,'Content-Type':'image/png' },body:readFileSync('public/assets/aristocrat.png') }); assert.equal(upload.status,200);
    const artwork = (await upload.json()).projects[0].shops[0].items[0].artwork.image;
    await post({ type:'shop.item.visible',itemId,visible:false }); await post({ type:'shop.show' });
    assert.equal((await fetch(origin+artwork,{ headers:{ Authorization:`Bearer ${service.display}` } })).status,404);
    ws = new WebSocket(origin.replace('http:','ws:')+'/realtime?display='+service.display,{ origin });
    const initial = await new Promise((resolve,reject) => { ws.once('message',b => resolve(JSON.parse(String(b)))); ws.once('error',reject); });
    assert.equal(initial.type,'display'); assert.ok(!JSON.stringify(initial).includes(artwork)); assert.ok(!initial.view.shop.items.some(i => i.id === itemId));
    const update = new Promise(resolve => ws.once('message',b => resolve(JSON.parse(String(b))))); await post({ type:'shop.item.visible',itemId,visible:true }); const current = await update;
    assert.ok(current.view.shop.items.some(i => i.id === itemId)); const imageResponse = await fetch(origin+artwork,{ headers:{ Authorization:`Bearer ${service.display}` } }); assert.equal(imageResponse.status,200); await imageResponse.arrayBuffer();
    const grant = service.access.create('player','Игрок',1,project.id); service.access.claim(grant.id,'paladin','Игрок');
    const playerHeaders = { ...headers,Authorization:`Bearer ${grant.token}` };
    const player = await (await fetch(origin+'/api/player',{ headers:playerHeaders })).json(); assert.equal(player.shop.id,shopId); assert.ok(!Object.hasOwn(player.shop,'notes'));
    assert.equal((await fetch(origin+'/api/command',{ method:'POST',headers:playerHeaders,body:JSON.stringify({ id:randomUUID(),type:'shop.stock',projectId:project.id,shopId,itemId,amount:-1 }) })).status,403);
  } finally { ws?.terminate(); service.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); rmSync(directory,{ recursive:true,force:true,maxRetries:5,retryDelay:100 }); }
});
