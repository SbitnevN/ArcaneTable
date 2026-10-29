import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../build-desktop/backend/store.js';
import { Spotify } from '../build-desktop/backend/spotify.js';
import { spotifyUri } from '../build-desktop/src/contracts.js';

const command = (type, projectId, extra = {}) => ({ id: randomUUID(), type, projectId, ...extra });
async function fixture(fn) {
  const directory = mkdtempSync(join(tmpdir(), 'arcane-locations-'));
  const store = await Store.open(directory);
  try { await fn(store, directory); } finally { store.close(); rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}
const spotifyLink = 'https://open.spotify.com/playlist/37i9dQZF1DX8NTLI2TtZa6';

test('Location editor updates name, folder and music in one command and replaces media', async () => fixture(store => {
  const projectId = store.state().activeId;
  store.execute(command('folder.create', projectId, { name: 'Город' }));
  const folderId = store.state().projects[0].folders[0].id;
  store.execute(command('playlist.save', projectId, { playlist: { id: 'tavern', name: 'Таверна', trackIds: [], spotifyUrl: spotifyLink } }));
  store.execute(command('scene.update', projectId, { sceneId: 'test-scene', name: '  Ржавый якорь ', folderId, playlistId: 'tavern' }));
  let scene = store.state().projects[0].scenes[0];
  assert.deepEqual([scene.name, scene.folderId, scene.playlistId], ['Ржавый якорь', folderId, 'tavern']);
  store.execute(command('scene.update', projectId, { sceneId: 'test-scene', name: 'Ржавый якорь', folderId: null }));
  scene = store.state().projects[0].scenes[0];
  assert.equal(scene.folderId, null); assert.equal('playlistId' in scene, false, 'missing playlistId means inherit');
  assert.throws(() => store.execute(command('scene.update', projectId, { sceneId: 'test-scene', name: 'x', playlistId: 'missing' })), /Плейлист не найден/);
  store.execute(command('scene.replace', projectId, { sceneId: 'test-scene' }), { id: 'new', name: 'file', url: '/media/new.mp4', type: 'video' });
  scene = store.state().projects[0].scenes[0];
  assert.deepEqual([scene.id, scene.url, scene.type, scene.name], ['test-scene', '/media/new.mp4', 'video', 'Ржавый якорь']);
}));

test('Folders take default music on creation and cannot be nested into themselves', async () => fixture(store => {
  const projectId = store.state().activeId;
  store.execute(command('playlist.save', projectId, { playlist: { id: 'dungeon', name: 'Подземелье', trackIds: [], spotifyUrl: spotifyLink } }));
  store.execute(command('folder.create', projectId, { name: 'Подземелье', playlistId: 'dungeon' }));
  store.execute(command('folder.create', projectId, { name: 'Тихая', playlistId: null }));
  const [outer, quiet] = store.state().projects[0].folders;
  assert.equal(outer.playlistId, 'dungeon'); assert.equal(quiet.playlistId, null);
  store.execute(command('folder.create', projectId, { name: 'Склеп', folderId: outer.id }));
  const inner = store.state().projects[0].folders[2];
  assert.equal('playlistId' in inner, false);
  assert.throws(() => store.execute(command('folder.update', projectId, { folderId: outer.id, name: 'Подземелье', parentId: inner.id })), /саму себя/);
  store.execute(command('folder.update', projectId, { folderId: inner.id, name: 'Крипта', parentId: null, playlistId: 'dungeon' }));
  const updated = store.state().projects[0].folders[2];
  assert.deepEqual([updated.name, updated.parentId, updated.playlistId], ['Крипта', null, 'dungeon']);
}));

test('Playlist save creates and edits local or Spotify playlists with clean links', async () => fixture(store => {
  const projectId = store.state().activeId;
  store.execute(command('track.import', projectId), undefined, { id: 't1', name: 'Лютня', url: '/media/t1.wav' });
  store.execute(command('playlist.save', projectId, { playlist: { id: 'mix', name: 'Микс', trackIds: ['t1', 't1'] } }));
  assert.deepEqual(store.state().projects[0].playlists[0].trackIds, ['t1']);
  store.execute(command('playlist.save', projectId, { playlist: { id: 'mix', name: 'Микс 2', trackIds: [], spotifyUrl: 'https://open.spotify.com/intl-ru/album/4aawyAB9vmqN3uQ7FjRGTy?si=abc' } }));
  const playlist = store.state().projects[0].playlists[0];
  assert.deepEqual([playlist.name, playlist.spotifyUrl, store.state().projects[0].playlists.length], ['Микс 2', 'https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy', 1]);
  assert.throws(() => store.execute(command('playlist.save', projectId, { playlist: { id: 'bad', name: 'x', trackIds: [], spotifyUrl: 'https://evil.example/playlist/1' } })), /Spotify/);
  assert.throws(() => store.execute(command('playlist.save', projectId, { playlist: { id: 'bad', name: 'x', trackIds: ['nope'] } })), /Трек не найден/);
  assert.equal(spotifyUri('https://open.spotify.com/track/abc123'), 'spotify:track:abc123');
  assert.equal(spotifyUri('https://evil.example/track/abc'), null);
}));

test('Live location switches between Spotify and local music and stops on project stop', async () => fixture(store => {
  const projectId = store.state().activeId;
  store.execute(command('track.import', projectId), undefined, { id: 't1', name: 'Лютня', url: '/media/t1.wav' });
  store.execute(command('playlist.save', projectId, { playlist: { id: 'local', name: 'Лес', trackIds: ['t1'] } }));
  store.execute(command('playlist.save', projectId, { playlist: { id: 'remote', name: 'Таверна', trackIds: [], spotifyUrl: spotifyLink } }));
  store.execute(command('scene.import', projectId), { id: 'forest', name: 'Лес', url: '/media/forest.png', type: 'image', folderId: null });
  store.execute(command('project.live', projectId));
  store.execute(command('scene.update', projectId, { sceneId: 'test-scene', name: 'Таверна', folderId: null, playlistId: 'remote' }));
  store.execute(command('scene.update', projectId, { sceneId: 'forest', name: 'Лес', folderId: null, playlistId: 'local' }));
  store.execute(command('scene.select', projectId, { sceneId: 'test-scene' }));
  let state = store.state();
  assert.equal(state.music, null);
  assert.deepEqual([state.spotify.uri, state.spotify.playing], ['spotify:playlist:37i9dQZF1DX8NTLI2TtZa6', true]);
  const startedAt = state.spotify.startedAt;
  store.execute(command('scene.rename', projectId, { sceneId: 'test-scene', name: 'Таверна!' }));
  store.execute(command('spotify.transport', projectId, { playing: false, volume: 0.3 }));
  state = store.state(); assert.deepEqual([state.spotify.playing, state.spotify.volume], [false, 0.3]);
  store.execute(command('scene.select', projectId, { sceneId: 'forest' }));
  state = store.state(); assert.equal(state.spotify, null); assert.equal(state.music.playlistId, 'local');
  store.execute(command('music.play', projectId, { playlistId: 'remote' }));
  state = store.state(); assert.equal(state.music, null); assert.ok(state.spotify.startedAt >= startedAt);
  store.execute(command('playlist.spotify', projectId, { playlistId: 'remote', spotifyUrl: '' }));
  assert.equal(store.state().spotify, null, 'removing the link stops Spotify playback');
  store.execute(command('music.play', projectId, { playlistId: 'local' }));
  store.execute(command('playlist.save', projectId, { playlist: { id: 'remote', name: 'Таверна', trackIds: [], spotifyUrl: spotifyLink } }));
  store.execute(command('scene.select', projectId, { sceneId: 'test-scene' }));
  assert.ok(store.state().spotify);
  store.execute(command('project.stop', projectId));
  state = store.state(); assert.equal(state.spotify, null); assert.equal(state.music, null);
}));

test('Spotify playback is paused after restart and the controller stays idle without an account', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'arcane-spotify-'));
  try {
    let store = await Store.open(directory);
    const projectId = store.state().activeId;
    store.execute(command('playlist.save', projectId, { playlist: { id: 'remote', name: 'Таверна', trackIds: [], spotifyUrl: spotifyLink } }));
    store.execute(command('music.play', projectId, { playlistId: 'remote' }));
    assert.equal(store.state().spotify.playing, true);
    store.close(); store = await Store.open(directory);
    assert.equal(store.state().spotify.playing, false);
    store.close();
    let changes = 0;
    const spotify = new Spotify(directory, () => changes++);
    assert.deepEqual([spotify.status().configured, spotify.status().connected], [false, false]);
    assert.throws(() => spotify.setClientId('short'), /32/);
    spotify.setClientId('0123456789abcdef0123456789ABCDEF');
    assert.equal(new Spotify(directory, () => {}).status().clientId, '0123456789abcdef0123456789abcdef');
    spotify.sync({ projectId, playlistId: 'remote', uri: 'spotify:playlist:x', playing: true, volume: 0.5, startedAt: 1 });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(changes, 0, 'no network calls or changes without a connected account');
  } finally { rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
