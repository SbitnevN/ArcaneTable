import React, { useEffect, useRef, useState } from 'react';
import { resolvePlaylist, type Command, type Music, type Project, type Workspace } from './contracts';

export function MusicEngine({ workspace, send, onStatus, enabled = true }: { enabled?: boolean; workspace: Workspace; send: (command: Omit<Command, 'id'>) => void; onStatus: (message: string) => void }) {
  const [owner, setOwner] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const retiring = useRef<HTMLAudioElement | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const fading = useRef(false);
  const latest = useRef({ workspace, send, onStatus }); latest.current = { workspace, send, onStatus };
  const music = workspace.music;
  const track = workspace.projects.find(p => p.id === music?.projectId)?.tracks.find(t => t.id === music?.trackId);
  useEffect(() => {
    if (!enabled) { setOwner(false); return; }
    let disposed = false; let release: (() => void) | undefined; let timer: ReturnType<typeof setTimeout>;
    function acquire() {
      if (disposed) return;
      if (!navigator.locks) { setOwner(true); return; }
      void navigator.locks.request('arcane-audio-output', { ifAvailable: true }, lock => {
        if (!lock) { setOwner(false); timer = setTimeout(acquire, 2000); return; }
        if (disposed) return;
        setOwner(true);
        return new Promise<void>(resolve => { release = resolve; });
      });
    }
    acquire();
    return () => { disposed = true; clearTimeout(timer); release?.(); };
  }, [enabled]);
  useEffect(() => {
    if (!owner || !track || !music) {
      audio.current?.pause(); audio.current?.removeAttribute('src'); audio.current = null;
      retiring.current?.pause(); retiring.current?.removeAttribute('src'); retiring.current = null;
      clearInterval(fadeTimer.current); fading.current = false; setBlocked(false); return;
    }
    const previous = audio.current;
    retiring.current?.pause(); retiring.current?.removeAttribute('src');
    clearInterval(fadeTimer.current);
    retiring.current = previous;
    if (previous) { previous.onended = null; previous.onerror = null; previous.onplaying = null; }
    const player = new Audio(track.url); player.preload = 'auto'; player.volume = 0; audio.current = player;
    player.onended = () => {
      const state = latest.current.workspace.music;
      if (audio.current === player && state?.playing) latest.current.send({ type: 'music.next', projectId: state.projectId });
    };
    player.ontimeupdate = () => { if (audio.current === player) setElapsed(player.currentTime); };
    player.onerror = () => { retiring.current?.pause(); retiring.current?.removeAttribute('src'); retiring.current = null; clearInterval(fadeTimer.current); fading.current = false; setBlocked(false); latest.current.onStatus('Не удалось воспроизвести трек. Проверьте файл или выберите другой.'); };
    player.onloadedmetadata = () => {
      const state = latest.current.workspace.music;
      if (!state || state.trackId !== music.trackId) return;
      const position = state.position + (state.playing ? (Date.now() - state.startedAt) / 1000 : 0);
      if (Number.isFinite(player.duration)) player.currentTime = Math.min(position, Math.max(0, player.duration - 0.05));
      if (state.playing) void player.play().then(() => { setBlocked(false); latest.current.onStatus(''); }).catch(() => setBlocked(true));
    };
    fading.current = false;
    let started = false;
    player.onplaying = () => {
      if (started || audio.current !== player) return;
      started = true; fading.current = true;
      const previousVolume = previous?.volume || 0; const start = performance.now();
      fadeTimer.current = setInterval(() => {
        const progress = Math.min(1, (performance.now() - start) / 600);
        player.volume = (latest.current.workspace.music?.volume ?? 0.5) * progress;
        if (previous) previous.volume = previousVolume * (1 - progress);
        if (progress === 1) { clearInterval(fadeTimer.current); fading.current = false; previous?.pause(); previous?.removeAttribute('src'); retiring.current = null; }
      }, 30);
    };
    if (!music.playing) { previous?.pause(); previous?.removeAttribute('src'); retiring.current = null; }

  }, [owner, track?.url, music?.projectId, music?.trackId]);
  useEffect(() => {
    const player = audio.current; if (!player || !music || !owner) return;
    if (!fading.current) player.volume = music.volume;
    if (player.readyState >= 1) {
      const position = music.position + (music.playing ? (Date.now() - music.startedAt) / 1000 : 0);
      if (Math.abs(player.currentTime - position) > 0.25 && Number.isFinite(player.duration)) player.currentTime = Math.min(position, Math.max(0, player.duration - 0.05));
    }
    if (music.playing) void player.play().then(() => { setBlocked(false); latest.current.onStatus(''); }).catch(() => setBlocked(true)); else { player.pause(); retiring.current?.pause(); setBlocked(false); }
  }, [owner, music?.playing, music?.startedAt, music?.position, music?.volume, music?.trackId]);
  useEffect(() => {
    if (!owner) return;
    const timer = setInterval(() => {
      const state = latest.current.workspace.music; const player = audio.current;
      if (state?.playing && player && !player.paused && Number.isFinite(player.currentTime)) latest.current.send({ type: 'music.transport', projectId: state.projectId, position: player.currentTime });
    }, 10000);
    return () => clearInterval(timer);
  }, [owner]);
  useEffect(() => () => { clearInterval(fadeTimer.current); audio.current?.pause(); audio.current?.removeAttribute('src'); retiring.current?.pause(); retiring.current?.removeAttribute('src'); }, []);
  if (!music) return null;
  return <div className="audio-notice" role="status">{!enabled ? 'Звук воспроизводится на компьютере мастера.' : !owner ? 'Музыка управляется другим окном мастерской.' : blocked ? <><span>Браузер ожидает разрешения на звук.</span><button onClick={() => { void audio.current?.play().then(() => { setBlocked(false); onStatus(''); }).catch(() => onStatus('Не удалось запустить звук')); }}>Включить звук</button></> : <span>♫ {track?.name} · {music.playing ? 'Воспроизводится' : 'Пауза'} · <time aria-label="Позиция воспроизведения">{Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, '0')}</time></span>}</div>;
}

type Props = { project: Project; music: Music | null; command: (type: string, extra?: Partial<Command>) => void; upload: (files: File[]) => Promise<void>; busy: boolean; error: string };
export function MusicEditor({ project, music, command, upload, busy, error }: Props) {
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [rename, setRename] = useState('');
  const [spotify, setSpotify] = useState('');
  const [externalError, setExternalError] = useState('');
  const [volume, setVolume] = useState(music?.volume ?? 0.5);
  useEffect(() => setVolume(music?.volume ?? 0.5), [music?.volume]);
  const playlist = project.playlists.find(p => p.id === selected) || project.playlists[0];
  const playingHere = music?.projectId === project.id;
  const inherited = project.playlists.find(p => p.id === resolvePlaylist(project));
  async function openSpotify() {
    if (!playlist?.spotifyUrl) return;
    if (window.desktop) await window.desktop.openSpotify(playlist.spotifyUrl);
    else window.open(playlist.spotifyUrl, '_blank', 'noopener,noreferrer');
  }
  return <div className="music-editor">
    <section className="editor-card music-transport"><div><h2>Проигрыватель</h2><p>{playingHere ? project.tracks.find(t => t.id === music.trackId)?.name : 'Выберите плейлист и нажмите «Воспроизвести»'}</p></div><div className="action-row"><button className="primary" disabled={busy || !playlist?.trackIds.length} onClick={() => command('music.play', { playlistId: playlist?.id })}>Воспроизвести плейлист</button><button disabled={busy || !playingHere} onClick={() => command('music.transport', { playing: !music?.playing })}>{music?.playing && playingHere ? 'Пауза' : 'Продолжить'}</button><button disabled={busy || !playingHere} onClick={() => command('music.next')}>Следующий →</button><button disabled={busy || !playingHere} onClick={() => command('music.transport', { playing: false, position: 0 })}>Стоп</button></div><label>Громкость · {Math.round(volume * 100)}%<input aria-label="Громкость музыки" disabled={!playingHere} type="range" min="0" max="1" step="0.01" value={volume} onChange={e => setVolume(Number(e.target.value))} onPointerUp={() => command('music.transport', { volume })} onKeyUp={() => command('music.transport', { volume })}/></label>{error && <p role="alert">{error}</p>}</section>
    <div className="music-columns"><section className="editor-card"><h2>Плейлисты</h2><form onSubmit={e => { e.preventDefault(); if (name.trim()) { command('playlist.create', { name }); setName(''); } }}><label>Новый плейлист<input aria-label="Название плейлиста" value={name} maxLength={100} placeholder="Например, Таверна" onChange={e => setName(e.target.value)}/></label><button disabled={busy || !name.trim()}>Создать плейлист</button></form><div className="playlist-list">{project.playlists.map(item => <button className={playlist?.id === item.id ? 'selected' : ''} key={item.id} onClick={() => { setSelected(item.id); setRename(''); setSpotify(''); }}><strong>{item.name}</strong><span>{item.trackIds.length} треков</span></button>)}</div>{playlist && <><form onSubmit={e => { e.preventDefault(); if (rename.trim()) { command('playlist.rename', { playlistId: playlist.id, name: rename }); setRename(''); } }}><label>Новое название<input aria-label="Новое название плейлиста" placeholder={playlist.name} maxLength={100} value={rename} onChange={e => setRename(e.target.value)}/></label><button disabled={busy || !rename.trim()}>Сохранить название</button></form><button disabled={busy} onClick={() => command('playlist.delete', { playlistId: playlist.id })}>Удалить плейлист</button></>}</section>
    <section className="editor-card"><h2>{playlist ? `Треки · ${playlist.name}` : 'Библиотека треков'}</h2><p>MP3, WAV и OGG до 100 МБ. Файлы сохраняются в медиатеке проекта.</p><label className="upload-label">Добавить аудиофайлы<input disabled={busy} type="file" multiple accept="audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg" onChange={e => { void upload(Array.from(e.target.files || [])); e.target.value = ''; }}/></label>{project.tracks.length === 0 && <p>Загрузите музыку, затем добавьте треки в плейлист.</p>}{playlist && playlist.trackIds.length > 0 && <div className="playlist-order"><h3>Порядок воспроизведения</h3>{playlist.trackIds.map((id, index) => <div key={id}><span>{index + 1}. {project.tracks.find(track => track.id === id)?.name}</span><button disabled={busy || index === 0} aria-label={`Поднять трек ${index + 1}`} onClick={() => command('playlist.track.move', { playlistId: playlist.id, trackId: id, targetIndex: index - 1 })}>↑</button><button disabled={busy || index === playlist.trackIds.length - 1} aria-label={`Опустить трек ${index + 1}`} onClick={() => command('playlist.track.move', { playlistId: playlist.id, trackId: id, targetIndex: index + 1 })}>↓</button><button disabled={busy} onClick={() => command('music.play', { playlistId: playlist.id, trackId: id })}>▶</button></div>)}</div>}<div className="track-list">{project.tracks.map(track => <div key={track.id}><span>{track.name}</span>{playlist && <button disabled={busy} onClick={() => command(playlist.trackIds.includes(track.id) ? 'playlist.track.remove' : 'playlist.track.add', { playlistId: playlist.id, trackId: track.id })}>{playlist.trackIds.includes(track.id) ? 'Убрать из плейлиста' : 'Добавить в плейлист'}</button>}<button disabled={busy} onClick={() => command('track.delete', { trackId: track.id })}>Убрать из библиотеки</button></div>)}</div>{playlist && <div className="spotify-editor"><h2>Spotify</h2>{externalError && <p role="alert">{externalError}</p>}<p>Ссылка открывается во внешнем Spotify. Встроенного стриминга нет.</p><form onSubmit={e => { e.preventDefault(); command('playlist.spotify', { playlistId: playlist.id, spotifyUrl: spotify }); }}><label>Ссылка на трек, альбом или плейлист<input type="url" aria-label="Ссылка Spotify" placeholder={playlist.spotifyUrl || 'https://open.spotify.com/playlist/…'} value={spotify} onChange={e => setSpotify(e.target.value)}/></label><button disabled={busy}>Сохранить ссылку</button></form>{playlist.spotifyUrl && <><button onClick={() => void openSpotify().catch(() => setExternalError('Не удалось открыть Spotify. Проверьте ссылку или настройки браузера.'))}>Открыть Spotify ↗</button><button disabled={busy} onClick={() => command('playlist.spotify', { playlistId: playlist.id, spotifyUrl: '' })}>Убрать ссылку</button></>}</div>}</section></div>
    <section className="editor-card"><h2>Музыка локаций</h2><p>Сцена наследует музыку ближайшей папки, папка — родительской. Для выбранной сцены: {inherited?.name || 'тишина'}. Один и тот же плейлист продолжается без перезапуска.</p><div className="music-bindings"><Binding label="Весь проект" value={project.playlistId} playlists={project.playlists} disabled={busy} root onChange={playlistId => command('music.assign', { target: 'project', playlistId })}/>{project.folders.map(folder => <Binding key={folder.id} label={`Папка · ${folder.name}`} value={folder.playlistId} playlists={project.playlists} disabled={busy} onChange={playlistId => command('music.assign', { target: 'folder', folderId: folder.id, playlistId })}/>)}{project.scenes.map(scene => <Binding key={scene.id} label={`Сцена · ${scene.name}`} value={scene.playlistId} playlists={project.playlists} disabled={busy} onChange={playlistId => command('music.assign', { target: 'scene', sceneId: scene.id, playlistId })}/>)}</div></section>
  </div>;
}
function Binding({ label, value, playlists, onChange, disabled, root = false }: { label: string; value?: string | null; playlists: Project['playlists']; onChange: (id: string | null | undefined) => void; disabled: boolean; root?: boolean }) {
  return <label>{label}<select aria-label={`Музыка: ${label}`} disabled={disabled} value={value === undefined ? '__inherit' : value === null ? '__silence' : value} onChange={e => onChange(e.target.value === '__inherit' ? undefined : e.target.value === '__silence' ? null : e.target.value)}>{!root && <option value="__inherit">Наследовать</option>}<option value="__silence">Без музыки</option>{playlists.map(playlist => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}</select></label>;
}
