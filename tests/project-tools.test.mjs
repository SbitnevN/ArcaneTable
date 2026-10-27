import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { Store } from '../build-desktop/backend/store.js';
import { createService } from '../build-desktop/backend/service.js';

test('Scene presets restore geometry; master notes stay private and cues expire', async () => {
  const directory = mkdtempSync(join(tmpdir(),'arcane-project-tools-')); const store = await Store.open(directory);
  try {
    const projectId = store.state().activeId; const run = (type,extra={}) => store.execute({ id:randomUUID(),type,projectId,...extra });
    run('project.notes',{ text:'ПРИВАТНОЕ: секрет мастера' }); run('project.live'); run('preset.save',{ name:'Исходная сцена' });
    const presetId = store.state().projects[0].presets[0].id;
    run('layout.update',{ target:'card',layout:{ scale:1.5,x:30,y:70 } }); run('character.select',{ characterId:'paladin' });
    run('preset.apply',{ presetId }); assert.deepEqual(store.state().projects[0].layout,{ scale:1,x:50,y:50 }); assert.equal(store.state().projects[0].selectedCharacter,'aristocrat');
    run('cue.show',{ name:'Начало новой главы' }); assert.equal(store.publicView().cue.label,'Начало новой главы'); assert.ok(!JSON.stringify(store.publicView()).includes('ПРИВАТНОЕ'));
    const now = Date.now; try { Date.now = () => now()+7000; assert.equal(store.publicView().cue,null); } finally { Date.now = now; }
    const restored = await Store.open(directory); try { assert.equal(restored.state().projects[0].dmNotes,'ПРИВАТНОЕ: секрет мастера'); } finally { restored.close(); }
  } finally { store.close(); rmSync(directory,{ recursive:true,force:true,maxRetries:5,retryDelay:100 }); }
});

test('Soundboard deduplicates requests, leaves background music intact and does not replay on restart', async () => {
  const directory = mkdtempSync(join(tmpdir(),'arcane-soundboard-')); const store = await Store.open(directory);
  try {
    const projectId = store.state().activeId;
    store.execute({ id:randomUUID(),type:'track.import',projectId },undefined,{ id:'test',name:'Звук',url:'/media/00000000-0000-0000-0000-000000000001.wav' });
    const command = { id:randomUUID(),type:'sound.play',projectId,trackId:'test',volume:.7 }; store.execute(command); const sound = store.state().sound; store.execute(command); assert.deepEqual(store.state().sound,sound);
    assert.equal(store.state().music,null); assert.throws(() => store.execute({ ...command,id:randomUUID(),volume:2 }));
    store.execute({ id:randomUUID(),type:'sound.stop',projectId,requestId:'older-sound' }); assert.equal(store.state().sound.id,sound.id);
    const restored = await Store.open(directory); try { assert.equal(restored.state().sound,null); } finally { restored.close(); }
  } finally { store.close(); rmSync(directory,{ recursive:true,force:true,maxRetries:5,retryDelay:100 }); }
});

test('Remote screen control validates monitor IDs and rejects Player and Display roles', async () => {
  const directory = mkdtempSync(join(tmpdir(),'arcane-desktop-api-')); const calls = [];
  const service = await createService(directory,{ desktop:{ state:() => ({ monitors:[{ id:42,label:'TV' }],monitorId:42,fullscreen:false }),open:async (...args) => { calls.push(args); } } });
  const server = createServer((req,res) => { void service.handle(req,res,() => { res.writeHead(404); res.end(); }); }); service.attach(server); await new Promise(resolve => server.listen(0,'127.0.0.1',resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization:`Bearer ${service.master}`,Origin:origin,'Content-Type':'application/json' };
  try {
    assert.equal((await fetch(origin+'/api/desktop',{ headers })).status,200);
    assert.equal((await fetch(origin+'/api/desktop/display',{ method:'POST',headers,body:JSON.stringify({ monitorId:42,fullscreen:true }) })).status,200); assert.deepEqual(calls,[[42,true]]);
    assert.equal((await fetch(origin+'/api/desktop/display',{ method:'POST',headers,body:JSON.stringify({ monitorId:7 }) })).status,400); assert.equal(calls.length,1);
    assert.equal((await fetch(origin+'/api/desktop/display',{ method:'POST',headers:{ ...headers,Authorization:`Bearer ${service.display}` },body:JSON.stringify({ monitorId:42 }) })).status,403);
    const grant = service.access.create('player','Test',1,service.store.state().activeId);
    assert.equal((await fetch(origin+'/api/desktop/display',{ method:'POST',headers:{ ...headers,Authorization:`Bearer ${grant.token}` },body:JSON.stringify({ monitorId:42 }) })).status,403);
  } finally { service.close(); await new Promise(resolve => server.close(resolve)); rmSync(directory,{ recursive:true,force:true,maxRetries:5,retryDelay:100 }); }
});
