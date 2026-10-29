import React, { useEffect, useRef, useState } from 'react';
import { newId, type Playlist, type Project } from './contracts';
import { Field, Segmented } from './ui';
import { Icon } from './icons';

export type MusicDraft = { mode: 'inherit' | 'none' | 'spotify' | 'local'; spotifyUrl: string; playlistId: string; trackIds: string[]; name: string };

export function musicDraft(project: Project, playlistId: string | null | undefined, root = false): MusicDraft {
  const playlist = project.playlists.find(item => item.id === playlistId);
  if (playlistId === undefined) return { mode: root ? 'none' : 'inherit', spotifyUrl: '', playlistId: 'new', trackIds: [], name: '' };
  if (!playlist) return { mode: 'none', spotifyUrl: '', playlistId: 'new', trackIds: [], name: '' };
  if (playlist.spotifyUrl) return { mode: 'spotify', spotifyUrl: playlist.spotifyUrl, playlistId: playlist.id, trackIds: [], name: playlist.name };
  return { mode: 'local', spotifyUrl: '', playlistId: playlist.id, trackIds: [...playlist.trackIds], name: playlist.name };
}

export function spotifyValid(value: string) {
  return /^https:\/\/open\.spotify\.com\/(intl-[a-z-]+\/)?(playlist|album|track)\/[A-Za-z0-9]+(\?.*)?$/i.test(value.trim());
}

// Turns the picker draft into the playlist to save (if any) and the value for scene/folder playlistId.
export function resolveMusic(draft: MusicDraft, project: Project, ownerName: string): { playlistId: string | null | undefined; save?: Playlist; error?: string } {
  if (draft.mode === 'inherit') return { playlistId: undefined };
  if (draft.mode === 'none') return { playlistId: null };
  if (draft.mode === 'spotify') {
    if (!spotifyValid(draft.spotifyUrl)) return { playlistId: undefined, error: 'Вставьте ссылку Spotify на плейлист, альбом или трек' };
    const clean = draft.spotifyUrl.trim().split('?')[0].replace(/\/intl-[a-z-]+(?=\/)/i, '');
    const existing = project.playlists.find(item => item.spotifyUrl === clean);
    if (existing) return { playlistId: existing.id };
    const id = newId();
    return { playlistId: id, save: { id, name: (draft.name.trim() || ownerName).slice(0, 100), trackIds: [], spotifyUrl: clean } };
  }
  if (!draft.trackIds.length) return { playlistId: undefined, error: 'Отметьте хотя бы один трек для плейлиста' };
  const existing = project.playlists.find(item => item.id === draft.playlistId && !item.spotifyUrl);
  if (existing) {
    const name = draft.name.trim() || existing.name;
    const changed = name !== existing.name || existing.trackIds.join() !== draft.trackIds.join();
    return { playlistId: existing.id, save: changed ? { id: existing.id, name, trackIds: draft.trackIds } : undefined };
  }
  const id = newId();
  return { playlistId: id, save: { id, name: (draft.name.trim() || `${ownerName} — музыка`).slice(0, 100), trackIds: draft.trackIds } };
}

export function MusicPicker({ project, draft, onChange, inheritLabel, root = false, sourceOnly = false, upload, busy }: { project: Project; draft: MusicDraft; onChange: (draft: MusicDraft) => void; inheritLabel?: string; root?: boolean; sourceOnly?: boolean; upload: (files: File[]) => Promise<void>; busy: boolean }) {
  const [filter, setFilter] = useState('');
  const known = useRef(new Set(project.tracks.map(track => track.id)));
  const adding = useRef(false);
  const latest = useRef(draft); latest.current = draft;
  useEffect(() => {
    const fresh = project.tracks.filter(track => !known.current.has(track.id)).map(track => track.id);
    for (const id of fresh) known.current.add(id);
    if (fresh.length && adding.current) onChange({ ...latest.current, mode: 'local', trackIds: [...latest.current.trackIds, ...fresh] });
  }, [project.tracks]);
  const set = (patch: Partial<MusicDraft>) => onChange({ ...draft, ...patch });
  const local = project.playlists.filter(item => !item.spotifyUrl);
  const spotifyLists = project.playlists.filter(item => item.spotifyUrl);
  const toggle = (id: string) => set({ trackIds: draft.trackIds.includes(id) ? draft.trackIds.filter(item => item !== id) : [...draft.trackIds, id] });
  const tracks = project.tracks.filter(track => !filter || track.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
  return <div className="music-picker">
    <Segmented label="Источник музыки" value={draft.mode} onChange={mode => set({ mode })} options={[...(root ? [] : [{ value: 'inherit' as const, label: 'Как у папки', icon: <Icon name="inherit" size={14}/> }]), { value: 'spotify', label: 'Spotify', icon: <Icon name="spotify" size={14}/> }, { value: 'local', label: 'Свои треки', icon: <Icon name="music" size={14}/> }, ...(sourceOnly ? [] : [{ value: 'none' as const, label: 'Тишина', icon: <Icon name="silence" size={14}/> }])]}/>
    {draft.mode === 'inherit' && <p className="ui-note">Будет играть: <strong>{inheritLabel || 'тишина'}</strong>. Музыку по умолчанию задают в настройках папки.</p>}
    {draft.mode === 'none' && <p className="ui-note">В этой локации музыка остановится.</p>}
    {draft.mode === 'spotify' && <div className="music-picker-pane">
      <Field label="Ссылка на плейлист Spotify" hint="В Spotify: ⋯ → Поделиться → Скопировать ссылку на плейлист"><input type="url" value={draft.spotifyUrl} placeholder="https://open.spotify.com/playlist/…" onChange={event => set({ spotifyUrl: event.target.value })} aria-invalid={Boolean(draft.spotifyUrl) && !spotifyValid(draft.spotifyUrl)}/></Field>
      {!sourceOnly && spotifyLists.length > 0 && <div className="chip-row" aria-label="Уже добавленные плейлисты Spotify">{spotifyLists.map(item => <button type="button" key={item.id} className={draft.spotifyUrl === item.spotifyUrl ? 'chip active' : 'chip'} onClick={() => set({ spotifyUrl: item.spotifyUrl!, name: item.name })}><Icon name="spotify" size={12}/>{item.name}</button>)}</div>}
      <Field label="Название в списке" hint={sourceOnly ? undefined : 'Необязательно'}><input value={draft.name} maxLength={100} placeholder="Например, Таверна" onChange={event => set({ name: event.target.value })}/></Field>
    </div>}
    {draft.mode === 'local' && <div className="music-picker-pane">
      <div className={sourceOnly ? 'ui-grid' : 'ui-grid two'}>
        {!sourceOnly && <Field label="Плейлист"><select value={draft.playlistId} onChange={event => { const playlist = local.find(item => item.id === event.target.value); set(playlist ? { playlistId: playlist.id, trackIds: [...playlist.trackIds], name: playlist.name } : { playlistId: 'new', trackIds: [], name: '' }); }}><option value="new">＋ Собрать новый плейлист</option>{local.map(item => <option key={item.id} value={item.id}>{item.name} · {item.trackIds.length} тр.</option>)}</select></Field>}
        <Field label="Название плейлиста"><input value={draft.name} maxLength={100} placeholder="Например, Лес ночью" onChange={event => set({ name: event.target.value })}/></Field>
      </div>
      <div className="track-picker">
        <div className="track-picker-head"><input aria-label="Поиск трека" placeholder="Поиск по трекам…" value={filter} onChange={event => setFilter(event.target.value)}/><span>Выбрано: {draft.trackIds.length}</span><label className="ui-button small">＋ Загрузить аудио<input hidden disabled={busy} type="file" multiple accept="audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg" onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; adding.current = true; void upload(files).finally(() => { setTimeout(() => { adding.current = false; }, 1500); }); }}/></label></div>
        {project.tracks.length === 0 ? <p className="ui-empty">В проекте ещё нет треков. Загрузите MP3, WAV или OGG.</p> : <ul>{tracks.map(track => <li key={track.id}><label><input type="checkbox" checked={draft.trackIds.includes(track.id)} onChange={() => toggle(track.id)}/><span>{track.name}</span>{draft.trackIds.includes(track.id) && <small>#{draft.trackIds.indexOf(track.id) + 1}</small>}</label></li>)}</ul>}
      </div>
      {!sourceOnly && draft.playlistId !== 'new' && project.scenes.filter(scene => scene.playlistId === draft.playlistId).length + project.folders.filter(folder => folder.playlistId === draft.playlistId).length > 1 && <p className="ui-note">Этот плейлист используется и в других местах — изменения применятся везде.</p>}
    </div>}
  </div>;
}

export function playlistLabel(project: Project, playlistId: string | null | undefined) {
  const playlist = project.playlists.find(item => item.id === playlistId);
  return playlist ? playlist.name : 'тишина';
}
