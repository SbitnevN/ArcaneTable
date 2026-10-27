import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';
import { Store } from '../build-desktop/backend/store.js';
import { createService } from '../build-desktop/backend/service.js';
import { defaultGames, defaultLayout, resolvePlaylist } from '../build-desktop/src/contracts.js';

const command = (type, projectId, extra = {}) => ({ id: randomUUID(), type, projectId, ...extra });
async function fixture(fn) {
  const directory = mkdtempSync(join(tmpdir(), 'arcane-music-'));
  const store = await Store.open(directory);
  try { await fn(store, directory); } finally { store.close(); rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}
function setup(store) {
  const projectId = store.state().activeId;
  for (const id of ['a', 'b']) store.execute(command('track.import', projectId), undefined, { id, name: `Track ${id}`, url: `/media/${id}.wav` });
  store.execute(command('playlist.create', projectId, { name: 'Таверна' }));
  const playlistId = store.state().projects[0].playlists[0].id;
  store.execute(command('playlist.track.add', projectId, { playlistId, trackId: 'a' }));
  store.execute(command('playlist.track.add', projectId, { playlistId, trackId: 'b' }));
  return { projectId, playlistId };
}
test('Scene music inherits through nested folders, supports explicit silence and project fallback', async () => fixture(store => {
  const { projectId, playlistId } = setup(store);
  store.execute(command('music.assign', projectId, { target: 'project', playlistId }));
  store.execute(command('folder.create', projectId, { name: 'Таверна' }));
  const parent = store.state().projects[0].folders[0].id;
  store.execute(command('folder.create', projectId, { name: 'Подвал', folderId: parent }));
  const child = store.state().projects[0].folders[1].id;
  store.execute(command('scene.move', projectId, { sceneId: 'test-scene', folderId: child }));
  const resolved = () => resolvePlaylist(store.state().projects[0]);
  assert.equal(resolved(), playlistId);
  store.execute(command('music.assign', projectId, { target: 'folder', folderId: parent, playlistId: null }));
  assert.equal(resolved(), null);
  store.execute(command('music.assign', projectId, { target: 'scene', sceneId: 'test-scene', playlistId }));
  assert.equal(resolved(), playlistId);
  store.execute(command('music.assign', projectId, { target: 'scene', sceneId: 'test-scene' }));
  assert.equal(resolved(), null);
  store.execute(command('music.assign', projectId, { target: 'folder', folderId: parent }));
  assert.equal(resolved(), playlistId);
}));
test('Scenes with the same playlist preserve position; editing another project does not change live audio', async () => fixture(store => {
  const { projectId, playlistId } = setup(store);
  store.execute(command('music.assign', projectId, { target: 'project', playlistId }));
  store.execute(command('project.live', projectId));
  store.execute(command('music.transport', projectId, { position: 12 }));
  const before = store.state().music;
  store.execute(command('scene.import', projectId), { id: 's2', name: 'Другой зал', type: 'image', url: '/assets/test-scene.svg' });
  assert.deepEqual(store.state().music, before);
  store.execute(command('project.create', undefined, { name: 'Другой проект' }));
  assert.deepEqual(store.state().music, before);
  store.execute(command('music.assign', projectId, { target: 'scene', sceneId: 's2', playlistId: null }));
  assert.equal(store.state().music, null);
  store.execute(command('scene.select', projectId, { sceneId: 'test-scene' }));
  assert.equal(store.state().music.trackId, 'a');
  assert.equal(store.state().music.position, 0);
  assert.ok(!JSON.stringify(store.publicView()).includes('trackIds'));
}));
test('Playlist order, transport, deletion, command deduplication and persistence remain consistent', async () => fixture(async (store, directory) => {
  const { projectId, playlistId } = setup(store);
  const duplicate = command('playlist.track.add', projectId, { playlistId, trackId: 'a' });
  store.execute(duplicate); store.execute(duplicate);
  assert.equal(store.state().projects[0].playlists[0].trackIds.length, 2);
  store.execute(command('playlist.track.move', projectId, { playlistId, trackId: 'b', targetIndex: 0 }));
  store.execute(command('music.play', projectId, { playlistId }));
  assert.equal(store.state().music.trackId, 'b');
  store.execute(command('music.next', projectId));
  assert.equal(store.state().music.trackId, 'a');
  store.execute(command('music.transport', projectId, { playing: false, position: 4, volume: 0.25 }));
  assert.equal(store.state().music.position, 4);
  assert.throws(() => store.execute(command('music.transport', projectId, { volume: 2 })));
  assert.throws(() => store.execute(command('music.transport', projectId, { position: -1 })));
  const restored = await Store.open(directory);
  try { assert.deepEqual(restored.state().music, store.state().music); assert.deepEqual(restored.state().projects[0].playlists[0].trackIds, ['b', 'a']); } finally { restored.close(); }
  store.execute(command('track.delete', projectId, { trackId: 'a' }));
  assert.equal(store.state().music.trackId, 'b');
  store.execute(command('playlist.delete', projectId, { playlistId }));
  assert.equal(store.state().music, null);
}));
test('Spotify accepts only official HTTPS track/album/playlist links', async () => fixture(store => {
  const { projectId, playlistId } = setup(store);
  store.execute(command('playlist.spotify', projectId, { playlistId, spotifyUrl: 'https://open.spotify.com/playlist/Ab123?si=tracking' }));
  assert.equal(store.state().projects[0].playlists[0].spotifyUrl, 'https://open.spotify.com/playlist/Ab123');
  for (const url of ['javascript:alert(1)', 'https://open.spotify.com.evil.invalid/playlist/Ab123', 'https://user:pass@open.spotify.com/playlist/Ab123', 'file:///C:/secret', 'https://open.spotify.com/../../x']) assert.throws(() => store.execute(command('playlist.spotify', projectId, { playlistId, spotifyUrl: url })));
}));
test('Migration adds paladin and music while preserving existing HP and notes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'arcane-migrate-'));
  const require = createRequire(import.meta.url);
  const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });
  const db = new SQL.Database();
  const games = structuredClone(defaultGames); delete games.paladin;
  games.tarkhun.hp = 5; games.tarkhun.blocks = [{ id: 'keep', kind: 'spoiler', title: 'Сохранить', text: 'Личная заметка пользователя' }];
  const project = { id: 'old', name: 'Старая кампания', games, selectedCharacter: 'tarkhun', folders: [], scenes: [], sceneId: null, layout: defaultLayout, background: defaultLayout };
  db.run('CREATE TABLE migrations(version INTEGER PRIMARY KEY); INSERT INTO migrations VALUES(1),(2); CREATE TABLE workspace(id INTEGER PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE commands(id TEXT PRIMARY KEY, revision INTEGER NOT NULL)');
  db.run('INSERT INTO workspace VALUES(1, ?)', [JSON.stringify({ projects: [project], openIds: ['old'], activeId: 'old', liveId: null, revision: 3 })]);
  writeFileSync(join(directory, 'arcane.sqlite'), db.export()); db.close();
  const store = await Store.open(directory);
  try {
    const restored = store.state().projects[0];
    assert.equal(restored.games.tarkhun.hp, 5); assert.equal(restored.games.tarkhun.blocks[0].text, 'Личная заметка пользователя');
    assert.ok(restored.games.paladin); assert.deepEqual(restored.playlists, []);
    store.execute(command('character.select', 'old', { characterId: 'paladin' }));
    assert.equal(store.state().projects[0].selectedCharacter, 'paladin');
  } finally { store.close(); rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
test('WAV upload and range playback require master access and survive persistence', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'arcane-audio-http-'));
  const service = await createService(directory);
  const server = createServer((req, res) => { void service.handle(req, res, () => { res.writeHead(404); res.end(); }); });
  service.attach(server); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const wav = Buffer.alloc(44 + 16000);
    wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(16000, 40);
    const projectId = service.store.state().activeId;
    const headers = { Cookie: `arcane=${service.master}`, Origin: origin, 'Content-Type': 'audio/wav' };
    const imported = await fetch(`${origin}/api/audio?projectId=${projectId}&name=silence.wav`, { method: 'POST', headers, body: wav });
    assert.equal(imported.status, 200);
    const state = await imported.json(); const url = state.projects[0].tracks[0].url;
    assert.equal((await fetch(`${origin}${url}`, { headers: { Authorization: `Bearer ${service.display}` } })).status, 404);
    assert.equal((await fetch(`${origin}/api/audio?projectId=${projectId}`, { method: 'POST', headers: { ...headers, Cookie: '', Authorization: `Bearer ${service.display}` }, body: wav })).status, 403);
    const partial = await fetch(`${origin}${url}`, { headers: { Cookie: headers.Cookie, Range: 'bytes=0-43' } });
    assert.equal(partial.status, 206); assert.equal(partial.headers.get('content-type'), 'audio/wav'); assert.deepEqual(Buffer.from(await partial.arrayBuffer()), wav.subarray(0, 44));
    assert.equal((await fetch(`${origin}/api/audio?projectId=${projectId}`, { method: 'POST', headers, body: Buffer.from('invalid audio content') })).status, 400);
  } finally { service.close(); await new Promise(resolve => server.close(resolve)); rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
