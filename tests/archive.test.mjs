import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { ZipFile } from 'yazl';
import { Store } from '../build-desktop/backend/store.js';
import { readProjectArchive, writeProjectArchive, validateProject } from '../build-desktop/backend/archive.js';
import { createService } from '../build-desktop/backend/service.js';

test('Portable ZIP restores cards, images, video and music without original source directory', async () => {
  const source = mkdtempSync(join(tmpdir(),'arcane-export-')); const target = mkdtempSync(join(tmpdir(),'arcane-restore-')); const file = join(target,'project.zip');
  const store = await Store.open(source); let restored;
  try {
    const projectId = store.state().activeId; const run = (type,extra={}) => store.execute({ id:randomUUID(),type,projectId,...extra });
    mkdirSync(join(source,'media'),{ recursive:true });
    const imageName = `${randomUUID()}.png`; const videoName = `${randomUUID()}.webm`; const audioName = `${randomUUID()}.wav`;
    const image = readFileSync('public/assets/paladin.png'); const video = Buffer.from('test video payload'); const audio = Buffer.from('test audio payload');
    for (const [name,bytes] of [[imageName,image],[videoName,video],[audioName,audio]]) writeFileSync(join(source,'media',name),bytes);
    store.execute({ id:randomUUID(),type:'scene.import',projectId },{ id:'imported-image',name:'Изображение',url:`/media/${imageName}`,type:'image' });
    store.execute({ id:randomUUID(),type:'scene.import',projectId },{ id:'imported-video',name:'Видео',url:`/media/${videoName}`,type:'video' });
    store.execute({ id:randomUUID(),type:'track.import',projectId },undefined,{ id:'imported-audio',name:'Трек',url:`/media/${audioName}` });
    run('playlist.create',{ name:'Музыка' }); const playlistId = store.state().projects[0].playlists[0].id;
    run('playlist.track.add',{ playlistId,trackId:'imported-audio' }); run('music.assign',{ target:'project',playlistId });
    run('combat.create',{ name:'Бой' }); run('combat.add',{ characterId:'paladin' }); run('combat.start'); run('combat.damage',{ targetId:store.state().projects[0].combat.participants[0].id,amount:3 });
    run('project.live'); const original = store.state().projects[0];
    await writeProjectArchive(original,source,resolve('public'),file);
    store.close(); rmSync(source,{ recursive:true,force:true,maxRetries:5,retryDelay:100 });
    const result = await readProjectArchive(file,target);
    assert.notEqual(result.project.id,original.id); assert.equal(result.project.combat.running,false); assert.equal(result.project.games.paladin.hp,7);
    assert.ok(result.project.characters.every(c => c.image.startsWith('/media/')));
    const media = url => readFileSync(join(target,url));
    assert.deepEqual(media(result.project.scenes.find(s => s.id === 'imported-image').url),image);
    assert.deepEqual(media(result.project.scenes.find(s => s.id === 'imported-video').url),video);
    assert.deepEqual(media(result.project.tracks[0].url),audio);
    assert.ok(!JSON.stringify(result.project).includes(source));
    restored = await Store.open(target); const oldLive = restored.state().liveId;
    restored.execute({ id:randomUUID(),type:'project.import' },undefined,undefined,undefined,undefined,result.project);
    assert.equal(restored.state().liveId,oldLive); assert.equal(restored.state().activeId,result.project.id);
    await writeProjectArchive(result.project,target,resolve('public'),join(target,'again.zip'));
  } finally { try { store.close(); } catch {} restored?.close(); for (const dir of [source,target]) rmSync(dir,{ recursive:true,force:true,maxRetries:5,retryDelay:100 }); }
});

test('Archive import rejects unexpected paths and invalid graphs without changing stored data', async () => {
  const directory = mkdtempSync(join(tmpdir(),'arcane-bad-zip-')); const store = await Store.open(directory);
  try {
    const project = store.state().projects[0]; project.folders = [{ id:'cycle',name:'Цикл',parentId:'cycle' }]; assert.throws(() => validateProject(project));
    const filename = join(directory,'bad.zip'); const zip = new ZipFile(); const done = pipeline(zip.outputStream,createWriteStream(filename)); zip.addBuffer(Buffer.from('no'),'unexpected.txt'); zip.end(); await done;
    const before = store.state(); await assert.rejects(readProjectArchive(filename,directory)); assert.deepEqual(store.state(),before);
    assert.equal(readdirSync(join(directory,'transfers')).length,0);
  } finally { store.close(); rmSync(directory,{ recursive:true,force:true,maxRetries:5,retryDelay:100 }); }
});

test('HTTP archive and LSS endpoints require master access; portrait data survives import and export', async () => {
  const directory = mkdtempSync(join(tmpdir(),'arcane-transfer-http-')); const service = await createService(directory,{ staticRoot:resolve('public') });
  const server = createServer((req,res) => { void service.handle(req,res,() => { res.writeHead(404); res.end(); }); }); service.attach(server);
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization:`Bearer ${service.master}`,Origin:origin,'Content-Type':'application/json' }; const projectId = service.store.state().activeId;
  try {
    assert.equal((await fetch(`${origin}/api/project/export?projectId=${projectId}`)).status,401);
    assert.equal((await fetch(`${origin}/api/lss/export?projectId=${projectId}&characterId=paladin`,{ headers:{ Authorization:`Bearer ${service.display}` } })).status,403);
    const example = JSON.parse(readFileSync('tests/fixtures/lss-example.json','utf8'));
    const imported = await fetch(`${origin}/api/lss/import?projectId=${projectId}`,{ method:'POST',headers,body:JSON.stringify({ jsonType:'character',edition:'2024',data:JSON.stringify(example) }) }); assert.equal(imported.status,200);
    const result = await imported.json(); const characterId = result.state.projects[0].selectedCharacter;
    const portrait = await fetch(`${origin}/api/portrait?projectId=${projectId}&characterId=${characterId}`,{ method:'POST',headers:{ ...headers,'Content-Type':'image/png' },body:readFileSync('public/assets/aristocrat.png') }); assert.equal(portrait.status,200);
    const exported = await fetch(`${origin}/api/lss/export?projectId=${projectId}&characterId=${characterId}`,{ headers }); assert.equal(exported.status,200); assert.deepEqual(JSON.parse((await exported.json()).data),example);
    const zip = await fetch(`${origin}/api/project/export?projectId=${projectId}`,{ headers }); assert.equal(zip.status,200);
    const bytes = Buffer.from(await zip.arrayBuffer()); assert.equal(bytes.toString('ascii',0,2),'PK');
    const copy = await fetch(`${origin}/api/project/import`,{ method:'POST',headers:{ ...headers,'Content-Type':'application/zip' },body:bytes }); assert.equal(copy.status,200);
    const state = await copy.json(); assert.equal(state.projects.length,2); const card = state.projects[1].characters.find(c => c.id === characterId);
    const image = await fetch(origin+card.image,{ headers }); assert.equal(image.status,200); assert.deepEqual(Buffer.from(await image.arrayBuffer()),readFileSync('public/assets/aristocrat.png'));
  } finally { service.close(); await new Promise(resolve => server.close(resolve)); rmSync(directory,{ recursive:true,force:true,maxRetries:5,retryDelay:100 }); }
});
