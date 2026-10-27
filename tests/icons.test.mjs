import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createService } from '../build-desktop/backend/service.js';
import { writeProjectArchive, readProjectArchive } from '../build-desktop/backend/archive.js';

test('Card icons persist, reach Display, travel in archives and reset without affecting HP', async () => {
  const directory = mkdtempSync(join(tmpdir(),'arcane-icons-')); const target = mkdtempSync(join(tmpdir(),'arcane-icons-copy-'));
  const service = await createService(directory); const server = createServer((req,res) => { void service.handle(req,res,() => { res.writeHead(404); res.end(); }); }); service.attach(server);
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization:`Bearer ${service.master}`,Origin:origin,'Content-Type':'image/png' }; const projectId = service.store.state().activeId;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV3sAAAAASUVORK5CYII=','base64');
  try {
    const uploaded = await fetch(`${origin}/api/icon?projectId=${projectId}&kind=heart`,{ method:'POST',headers,body:png }); assert.equal(uploaded.status,200);
    const project = (await uploaded.json()).projects[0]; assert.match(project.icons.heart,/^\/media\//); const hp = project.games.aristocrat.hp;
    service.store.execute({ id:randomUUID(),type:'project.live',projectId }); assert.equal(service.store.publicView().icons.heart,project.icons.heart);
    const displayIcon = await fetch(origin+project.icons.heart,{ headers:{ Authorization:`Bearer ${service.display}` } }); assert.equal(displayIcon.status,200); assert.deepEqual(Buffer.from(await displayIcon.arrayBuffer()),png);
    const file = join(target,'icons.zip'); await writeProjectArchive(project,directory,resolve('public'),file); const restored = await readProjectArchive(file,target); assert.deepEqual(readFileSync(join(target,restored.project.icons.heart)),png);
    const bad = await fetch(`${origin}/api/icon?projectId=${projectId}&kind=heart`,{ method:'POST',headers,body:readFileSync('public/assets/heart.svg') }); assert.equal(bad.status,400);
    assert.throws(() => service.store.execute({ id:randomUUID(),type:'icon.import',projectId,kind:'heart' }));
    service.store.execute({ id:randomUUID(),type:'icon.reset',projectId,kind:'heart' }); assert.equal(service.store.state().projects[0].icons.heart,'/assets/heart.svg'); assert.equal(service.store.state().projects[0].games.aristocrat.hp,hp);
  } finally { service.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); for (const dir of [directory,target]) rmSync(dir,{ recursive:true,force:true,maxRetries:5,retryDelay:100 }); }
});
