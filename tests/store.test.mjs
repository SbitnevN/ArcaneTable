import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { Store } from '../build-desktop/backend/store.js';
import { createService } from '../build-desktop/backend/service.js';
import { WebSocket } from 'ws';

async function fixture(fn) {
  const directory = mkdtempSync(join(tmpdir(), 'arcane-test-'));
  let store = await Store.open(directory);
  try { await fn(store, directory); } finally { store.close(); rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}
const command = (type, projectId, extra = {}) => ({ id: randomUUID(), type, projectId, ...extra });
test('SQLite restores project, notes, selected scene and live state after reopening', async () => fixture(async (store, directory) => {
  const project = store.state().projects[0];
  const game = { hp: 7, maxHp: 12, ac: 14, blocks: [{ id: 'secret', kind: 'spoiler', title: 'Тайна', text: 'Секретный текст' }] };
  store.execute(command('character.update', project.id, { characterId: 'aristocrat', game }));
  store.execute(command('project.live', project.id));
  const restored = await Store.open(directory);
  try { assert.deepEqual(restored.state(), store.state()); assert.equal(restored.publicView().hp, 7); }
  finally { restored.close(); }
}));
test('Editing or closing a different tab never switches the live project', async () => fixture(store => {
  const first = store.state().projects[0];
  store.execute(command('project.live', first.id));
  const next = store.execute(command('project.create', undefined, { name: 'Вторая кампания' }));
  assert.notEqual(next.activeId, first.id);
  assert.equal(next.liveId, first.id);
  store.execute(command('project.close', first.id));
  assert.equal(store.publicView().projectName, first.name);
  assert.equal(store.state().projects.length, 2);
}));
test('Command IDs prevent duplicate creation, including after restoring the database', async () => fixture(async (store, directory) => {
  const request = command('project.create', undefined, { name: 'Один проект' });
  store.execute(request); store.execute(request);
  const restored = await Store.open(directory);
  try { restored.execute(request); assert.equal(restored.state().projects.length, 2); assert.equal(restored.state().revision, 1); }
  finally { restored.close(); }
}));
test('Invalid values cannot alter durable state', async () => fixture(store => {
  const before = store.state();
  for (const game of [{ hp: -1, maxHp: 10, ac: 12, blocks: [] }, { hp: 11, maxHp: 10, ac: 12, blocks: [] }, { hp: 1, maxHp: 10, ac: 12, blocks: [{ kind: 'html' }] }]) {
    assert.throws(() => store.execute(command('character.update', before.activeId, { characterId: 'tarkhun', game })));
  }
  assert.throws(() => store.execute(command('project.close', before.activeId)));
  assert.deepEqual(store.state(), before);
}));
test('Duplicate projects have independent character data and tab order is durable', async () => fixture(async (store, directory) => {
  const original = store.state().projects[0];
  const next = store.execute(command('project.duplicate', original.id));
  const copy = next.projects[1];
  store.execute(command('character.update', copy.id, { characterId: 'aristocrat', game: { hp: 3, maxHp: 10, ac: 10, blocks: [] } }));
  store.execute(command('project.move', copy.id, { targetIndex: 0 }));
  assert.equal(store.state().projects[0].games.aristocrat.hp, 10);
  const restored = await Store.open(directory);
  try { assert.equal(restored.state().openIds[0], copy.id); assert.equal(restored.state().projects[1].games.aristocrat.hp, 3); }
  finally { restored.close(); }
}));
test('Display serialization excludes notes, inactive projects and hidden data', async () => fixture(store => {
  const project = store.state().projects[0];
  store.execute(command('project.live', project.id));
  store.execute(command('project.create', undefined, { name: 'СЕКРЕТНЫЙ ПРОЕКТ' }));
  const serialized = JSON.stringify(store.publicView());
  assert.ok(!serialized.includes('blocks')); assert.ok(!serialized.includes('СЕКРЕТНЫЙ')); assert.ok(!serialized.includes('посох'));
}));
test('Card and background transforms survive reopening and reject invalid geometry', async () => fixture(async (store, directory) => {
  const id = store.state().activeId;
  store.execute(command('layout.update', id, { target: 'card', layout: { scale: 1.6, x: 32, y: 70 } }));
  store.execute(command('layout.update', id, { target: 'background', layout: { scale: 2, x: 40, y: 55 } }));
  store.execute(command('project.live', id));
  assert.throws(() => store.execute(command('layout.update', id, { target: 'card', layout: { scale: -1, x: 10, y: 50 } })));
  assert.throws(() => store.execute(command('layout.update', id, { target: 'card', layout: { scale: 1, x: 101, y: 50 } })));
  const restored = await Store.open(directory);
  try { assert.deepEqual(restored.publicView().layout, { scale: 1.6, x: 32, y: 70 }); assert.equal(restored.publicView().background.scale, 2); }
  finally { restored.close(); }
}));
test('Nested scene folders support move, rename, search data and safe removal', async () => fixture(store => {
  const id = store.state().activeId;
  store.execute(command('folder.create', id, { name: 'Поезд' }));
  const parent = store.state().projects[0].folders[0].id;
  store.execute(command('folder.create', id, { name: 'Вагоны', folderId: parent }));
  const child = store.state().projects[0].folders[1].id;
  store.execute(command('scene.move', id, { sceneId: 'test-scene', folderId: child }));
  assert.throws(() => store.execute(command('folder.delete', id, { folderId: parent })));
  assert.throws(() => store.execute(command('folder.delete', id, { folderId: child })));
  store.execute(command('scene.rename', id, { sceneId: 'test-scene', name: 'Коридор' }));
  assert.equal(store.state().projects[0].scenes[0].name, 'Коридор');
  store.execute(command('scene.move', id, { sceneId: 'test-scene', folderId: null }));
  store.execute(command('folder.delete', id, { folderId: child }));
  store.execute(command('folder.delete', id, { folderId: parent }));
  store.execute(command('scene.delete', id, { sceneId: 'test-scene' }));
  assert.equal(store.state().projects[0].sceneId, null);
}));
test('HTTP and WebSocket enforce display role and reject cross-origin writes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'arcane-http-test-'));
  const service = await createService(directory);
  const server = createServer((req, res) => { void service.handle(req, res, () => { res.writeHead(404); res.end(); }); });
  service.attach(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${origin}/api/state`)).status, 401);
    const session = await fetch(`${origin}/api/session?token=${service.display}`);
    const displayCookie = session.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(`${origin}/api/state`, { headers: { Cookie: displayCookie } })).status, 403);
    assert.equal((await fetch(`${origin}/api/session`)).status, 403);
    const masterCookie = `arcane=${service.master}`;
    const projectId = service.store.state().activeId;
    const request = command('project.live', projectId);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6XcAAAAASUVORK5CYII=', 'base64');
    const uploadHeaders = { Cookie: masterCookie, Origin: origin, 'Content-Type': 'image/png' };
    assert.equal((await fetch(`${origin}/api/import?projectId=${projectId}`, { method: 'POST', headers: uploadHeaders, body: Buffer.from('not an image') })).status, 400);
    assert.equal((await fetch(`${origin}/api/import?projectId=${projectId}&name=Проверка.png`, { method: 'POST', headers: uploadHeaders, body: png })).status, 200);
    assert.equal((await fetch(`${origin}/api/command`, { method: 'POST', headers: { Cookie: masterCookie, Origin: 'http://evil.invalid', 'Content-Type': 'application/json' }, body: JSON.stringify(request) })).status, 403);
    const socket = new WebSocket(`${origin.replace('http:', 'ws:')}/realtime?display=${service.display}`, { origin });
    const messages = [];
    const first = await new Promise((resolve, reject) => { socket.on('message', bytes => { messages.push(JSON.parse(String(bytes))); resolve(messages[0]); }); socket.on('error', reject); });
    assert.deepEqual(first, { type: 'display', view: null });
    const update = new Promise(resolve => socket.once('message', bytes => resolve(JSON.parse(String(bytes)))));
    const response = await fetch(`${origin}/api/command`, { method: 'POST', headers: { Cookie: masterCookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
    assert.equal(response.status, 200);
    const event = await update;
    assert.equal(event.type, 'display'); assert.equal(event.view.projectName, 'Новая кампания'); assert.ok(!JSON.stringify(event).includes('blocks'));
    const mediaUrl = event.view.scene.url;
    assert.equal((await fetch(`${origin}${mediaUrl}`)).status, 401);
    const media = await fetch(`${origin}${mediaUrl}`, { headers: { Cookie: displayCookie } });
    assert.equal(media.status, 200); assert.deepEqual(Buffer.from(await media.arrayBuffer()), png);
    const restored = await Store.open(directory);
    try { assert.equal(restored.publicView().scene.url, mediaUrl); } finally { restored.close(); }
    // Container signature fixture tests range transport; it is not a playable video.
    const video = Buffer.concat([Buffer.from([0,0,0,24]), Buffer.from('ftypisom'), Buffer.alloc(60)]);
    const imported = await fetch(`${origin}/api/import?projectId=${projectId}&name=range.mp4`, { method: 'POST', headers: uploadHeaders, body: video });
    assert.equal(imported.status, 200);
    const videoState = await imported.json();
    const videoScene = videoState.projects[0].scenes.at(-1);
    assert.equal(videoScene.type, 'video');
    const partial = await fetch(`${origin}${videoScene.url}`, { headers: { Cookie: displayCookie, Range: 'bytes=4-11' } });
    assert.equal(partial.status, 206); assert.equal(partial.headers.get('content-type'), 'video/mp4');
    assert.equal(partial.headers.get('content-range'), `bytes 4-11/${video.length}`);
    assert.deepEqual(Buffer.from(await partial.arrayBuffer()), video.subarray(4, 12));
    assert.equal((await fetch(`${origin}${videoScene.url}`, { headers: { Cookie: displayCookie, Range: 'bytes=999-' } })).status, 416);
    socket.terminate();
  } finally { service.close(); await new Promise(resolve => server.close(resolve)); rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
