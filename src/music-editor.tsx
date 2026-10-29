import React, { useEffect, useState } from 'react';
import { newId, resolvePlaylist, type Command, type Music, type Playlist, type Project, type SpotifyPlayback, type SpotifyStatus } from './contracts';
import { Modal, copyText } from './ui';
import { Icon } from './icons';
import { MusicPicker, musicDraft, spotifyValid, type MusicDraft } from './music-picker';

type Api = <T>(path: string, options?: RequestInit) => Promise<T>;
type Props = { project: Project; music: Music | null; spotify: SpotifyPlayback | null; command: (type: string, extra?: Partial<Command>) => void; upload: (files: File[]) => Promise<void>; busy: boolean; error: string; api: Api; root: boolean };

export function MusicEditor({ project, music, spotify, command, upload, busy, error, api, root }: Props) {
  const [editing, setEditing] = useState<Playlist | 'new' | null>(null);
  const [volume, setVolume] = useState(music?.volume ?? 0.5);
  const [spotifyVolume, setSpotifyVolume] = useState(spotify?.volume ?? 0.5);
  useEffect(() => setVolume(music?.volume ?? 0.5), [music?.volume]);
  useEffect(() => setSpotifyVolume(spotify?.volume ?? 0.5), [spotify?.volume]);
  const playingHere = music?.projectId === project.id;
  const spotifyHere = spotify?.projectId === project.id;
  const current = project.playlists.find(p => p.id === (spotifyHere ? spotify!.playlistId : playingHere ? music!.playlistId : resolvePlaylist(project)));
  const scene = project.scenes.find(item => item.id === project.sceneId);
  const usage = (id: string) => project.scenes.filter(item => item.playlistId === id).length + project.folders.filter(item => item.playlistId === id).length + (project.playlistId === id ? 1 : 0);
  return <div className="music-editor">
    <section className="editor-card now-playing">
      <div className={spotifyHere ? 'now-playing-art spotify' : 'now-playing-art'} aria-hidden="true">{spotifyHere ? <Icon name="spotify" size={34}/> : <Icon name="music" size={32}/>}</div>
      <div className="now-playing-info">
        <span className="page-kicker">{spotifyHere ? 'Spotify' : playingHere ? 'Свои треки' : 'Сейчас тихо'}</span>
        <h2>{spotifyHere || playingHere ? current?.name : current ? `Готов: ${current.name}` : 'Тишина'}</h2>
        <p>{playingHere ? project.tracks.find(t => t.id === music!.trackId)?.name : spotifyHere ? (spotify!.playing ? 'Играет в приложении Spotify на этом компьютере' : 'Пауза') : scene ? `Локация «${scene.name}»` : 'Выберите локацию'}</p>
      </div>
      <div className="now-playing-controls">
        {spotifyHere ? <>
          <button type="button" className="primary" disabled={busy} onClick={() => command('spotify.transport', { playing: !spotify!.playing })}>{spotify!.playing ? <><Icon name="pause"/>Пауза</> : <><Icon name="play"/>Играть</>}</button>
          <button type="button" disabled={busy} onClick={() => command('music.play', { playlistId: spotify!.playlistId })}><Icon name="restart"/>С начала</button>
          <label className="ui-range">Громкость {Math.round(spotifyVolume * 100)}%<input type="range" min="0" max="1" step="0.01" value={spotifyVolume} onChange={e => setSpotifyVolume(Number(e.target.value))} onPointerUp={() => command('spotify.transport', { volume: spotifyVolume })} onKeyUp={() => command('spotify.transport', { volume: spotifyVolume })}/></label>
        </> : playingHere ? <>
          <button type="button" className="primary" disabled={busy} onClick={() => command('music.transport', { playing: !music!.playing })}>{music!.playing ? <><Icon name="pause"/>Пауза</> : <><Icon name="play"/>Играть</>}</button>
          <button type="button" disabled={busy} onClick={() => command('music.next')}><Icon name="next"/>Следующий</button>
          <button type="button" disabled={busy} onClick={() => command('music.transport', { playing: false, position: 0 })}><Icon name="stop"/>Стоп</button>
          <label className="ui-range">Громкость {Math.round(volume * 100)}%<input type="range" min="0" max="1" step="0.01" value={volume} onChange={e => setVolume(Number(e.target.value))} onPointerUp={() => command('music.transport', { volume })} onKeyUp={() => command('music.transport', { volume })}/></label>
        </> : <button type="button" className="primary" disabled={busy || !current || (!current.spotifyUrl && !current.trackIds.length)} onClick={() => command('music.play', { playlistId: current!.id })}><Icon name="play"/>Включить музыку локации</button>}
      </div>
      {error && <p className="ui-error" role="alert">{error}</p>}
    </section>
    {root && <SpotifyConnection api={api} revision={spotify ? `${spotify.uri}${spotify.playing}${spotify.startedAt}${spotify.volume}` : ''}/>}
    <section className="editor-card">
      <div className="section-heading"><h2>Плейлисты</h2><button type="button" className="primary" disabled={busy} onClick={() => setEditing('new')}>＋ Новый плейлист</button></div>
      {project.playlists.length === 0 ? <p className="ui-empty">Плейлистов пока нет. Соберите плейлист из своих треков или вставьте ссылку Spotify, а потом назначьте его папке или локации.</p> :
        <div className="playlist-cards">{project.playlists.map(item => { const active = (spotifyHere && spotify!.playlistId === item.id) || (playingHere && music!.playlistId === item.id); return <article key={item.id} className={active ? 'playlist-card active' : 'playlist-card'}>
          <div className={item.spotifyUrl ? 'playlist-cover spotify' : 'playlist-cover'} aria-hidden="true">{item.spotifyUrl ? <Icon name="spotify" size={22}/> : <Icon name="music" size={20}/>}</div>
          <div className="playlist-card-info"><strong>{item.name}</strong><small>{item.spotifyUrl ? 'Spotify' : `${item.trackIds.length} треков`} · {usage(item.id) ? `назначен: ${usage(item.id)}` : 'не назначен'}</small></div>
          <div className="playlist-card-actions"><button type="button" className="ui-icon-button" aria-label={`Включить ${item.name}`} disabled={busy || (!item.spotifyUrl && !item.trackIds.length)} onClick={() => command('music.play', { playlistId: item.id })}><Icon name="play" size={14}/></button><button type="button" className="ui-icon-button" aria-label={`Изменить ${item.name}`} onClick={() => setEditing(item)}><Icon name="edit" size={15}/></button></div>
        </article>; })}</div>}
    </section>
    <section className="editor-card">
      <div className="section-heading"><h2>Библиотека треков</h2><label className="ui-button">＋ Загрузить аудио<input hidden disabled={busy} type="file" multiple accept="audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg" onChange={e => { void upload(Array.from(e.target.files || [])); e.target.value = ''; }}/></label></div>
      <p className="ui-note">MP3, WAV и OGG до 100 МБ. Файлы хранятся в проекте и переносятся в архиве.</p>
      {project.tracks.length === 0 ? <p className="ui-empty">Треков пока нет.</p> : <ul className="track-library">{project.tracks.map(track => <li key={track.id} className={playingHere && music!.trackId === track.id ? 'active' : ''}><span aria-hidden="true">♪</span><span>{track.name}</span><small>{project.playlists.filter(p => p.trackIds.includes(track.id)).map(p => p.name).join(', ') || 'нет в плейлистах'}</small><button type="button" className="ui-icon-button" aria-label={`Удалить ${track.name}`} disabled={busy} onClick={() => { if (confirm(`Убрать трек «${track.name}» из проекта?`)) command('track.delete', { trackId: track.id }); }}>×</button></li>)}</ul>}
    </section>
    {editing && <PlaylistDialog project={project} playlist={editing === 'new' ? null : editing} command={command} upload={upload} busy={busy} onClose={() => setEditing(null)}/>}
  </div>;
}

function PlaylistDialog({ project, playlist, command, upload, busy, onClose }: { project: Project; playlist: Playlist | null; command: Props['command']; upload: Props['upload']; busy: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState<MusicDraft>(() => playlist ? musicDraft(project, playlist.id) : { mode: 'local', spotifyUrl: '', playlistId: 'new', trackIds: [], name: '' });
  const [error, setError] = useState('');
  function save() {
    if (!draft.name.trim()) { setError('Введите название плейлиста'); return; }
    if (draft.mode === 'spotify' && !spotifyValid(draft.spotifyUrl)) { setError('Вставьте ссылку Spotify на плейлист, альбом или трек'); return; }
    const spotifyUrl = draft.mode === 'spotify' ? draft.spotifyUrl.trim().split('?')[0].replace(/\/intl-[a-z-]+(?=\/)/i, '') : undefined;
    command('playlist.save', { playlist: { id: playlist?.id || newId(), name: draft.name.trim(), trackIds: draft.mode === 'local' ? draft.trackIds : [], ...(spotifyUrl ? { spotifyUrl } : {}) } });
    onClose();
  }
  return <Modal wide title={playlist ? 'Плейлист' : 'Новый плейлист'} subtitle="Назначить его папке или локации можно в разделе «Локации»" onClose={onClose}
    footer={<>{playlist && <button type="button" className="danger" disabled={busy} onClick={() => { if (confirm(`Удалить плейлист «${playlist.name}»? Локации с ним перейдут на музыку папки.`)) { command('playlist.delete', { playlistId: playlist.id }); onClose(); } }}>Удалить</button>}<span className="spacer"/>{error && <span className="ui-error" role="alert">{error}</span>}<button type="button" onClick={onClose}>Отмена</button><button type="button" className="primary" disabled={busy} onClick={save}>Сохранить</button></>}>
    <MusicPicker root sourceOnly project={project} draft={{ ...draft, playlistId: playlist?.id || 'new' }} onChange={next => setDraft(next.mode === 'none' ? draft : next)} upload={upload} busy={busy}/>
  </Modal>;
}

function SpotifyConnection({ api, revision }: { api: Api; revision: string }) {
  const [status, setStatus] = useState<SpotifyStatus | null>(null);
  const [clientId, setClientId] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const load = () => api<SpotifyStatus>('/api/spotify').then(value => { setStatus(value); setError(''); }).catch(err => setError(err.message));
  useEffect(() => { void load(); }, [revision]);
  useEffect(() => { const timer = setInterval(() => void load(), status?.connected ? 15000 : 3000); return () => clearInterval(timer); }, [status?.connected]);
  async function post(path: string, body: unknown = {}) {
    setWorking(true); setError('');
    try {
      const value = await api<SpotifyStatus & { link?: string }>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setStatus(value);
      if (value.link && !window.desktop) window.open(value.link, '_blank', 'noopener,noreferrer');
    } catch (err) { setError(err instanceof Error ? err.message : 'Ошибка Spotify'); } finally { setWorking(false); }
  }
  if (!status) return null;
  const problem = status.error || error;
  return <section className="editor-card spotify-connect">
    <div className="section-heading"><h2><span className="spotify-dot"><Icon name="spotify" size={20}/></span> Spotify</h2>{status.connected && <span className="live-pill">Подключён: {status.user}</span>}</div>
    {status.connected ? <>
      <p>При смене локации Arcane Table сам включает её плейлист в приложении Spotify на этом компьютере.{status.device ? ` Устройство: ${status.device}.` : ''}</p>
      {problem && <p className="ui-error" role="alert">{problem}</p>}
      <div className="action-row"><button type="button" disabled={working} onClick={() => void post('/api/spotify/logout')}>Отключить аккаунт</button></div>
    </> : <>
      <ol className="spotify-steps">
        <li><strong>Создайте приложение</strong> на <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">developer.spotify.com/dashboard</a>: Create app, отметьте «Web API».</li>
        <li><strong>Redirect URI</strong>: вставьте ровно этот адрес и сохраните.<div className="copy-field"><code>{status.redirectUri}</code><button type="button" className="ui-button small" onClick={() => { void copyText(status.redirectUri).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>{copied ? '✓ Скопировано' : 'Копировать'}</button></div></li>
        <li><strong>Client ID</strong> из настроек приложения:<form className="inline-form" onSubmit={e => { e.preventDefault(); void post('/api/spotify/client', { clientId }); setClientId(''); }}><input aria-label="Spotify Client ID" placeholder={status.clientId ? `Сохранён: ${status.clientId.slice(0, 6)}…` : '32 символа'} value={clientId} maxLength={40} onChange={e => setClientId(e.target.value)}/><button type="submit" disabled={working || !clientId.trim()}>Сохранить</button></form></li>
        <li><strong>Войдите в Spotify</strong>, откроется браузер.<div className="action-row"><button type="button" className="primary" disabled={working || !status.configured} onClick={() => void post('/api/spotify/login')}>Подключить Spotify</button></div></li>
      </ol>
      {problem && <p className="ui-error" role="alert">{problem}</p>}
      <p className="ui-note small">Нужен Spotify Premium и запущенное приложение Spotify. Ключ входа хранится только на этом компьютере и не попадает в архив проекта.</p>
    </>}
  </section>;
}
