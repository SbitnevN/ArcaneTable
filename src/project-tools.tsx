import React, { useEffect, useRef, useState } from 'react';
import type { Command, Cue, Project, Workspace } from './contracts';

type EditorProps = { project:Project; command:(type:string,extra?:Partial<Command>) => void; busy:boolean };
export function SceneTools({ project,command,busy }: EditorProps) {
  const [name,setName] = useState(''); const [title,setTitle] = useState('');
  return <div className="settings-grid scene-extras"><section className="editor-card"><h2>Шаблоны композиции</h2><p>Сохраняет сцену, карту и их положение.</p><form onSubmit={e => { e.preventDefault(); if (name.trim()) { command('preset.save',{ name }); setName(''); } }}><label>Название шаблона<input value={name} maxLength={100} onChange={e => setName(e.target.value)}/></label><button disabled={busy || !name.trim()}>Сохранить композицию</button></form>{project.presets.map(p => <div className="preset-row" key={p.id}><strong>{p.name}</strong><button disabled={busy} onClick={() => command('preset.apply',{ presetId:p.id })}>Применить</button><button disabled={busy} aria-label={`Убрать шаблон ${p.name}`} onClick={() => command('preset.delete',{ presetId:p.id })}>×</button></div>)}</section><section className="editor-card"><h2>Сообщение на общем экране</h2><p>Появится на шесть секунд, когда этот проект в эфире.</p><form onSubmit={e => { e.preventDefault(); if (title.trim()) command('cue.show',{ name:title }); }}><label>Текст события<input value={title} maxLength={100} onChange={e => setTitle(e.target.value)} placeholder="Ночь опускается на древний храм…"/></label><div className="action-row"><button disabled={busy || !title.trim()}>Показать событие</button><button type="button" disabled={busy || !project.cue} onClick={() => command('cue.hide')}>Скрыть</button></div></form></section></div>;
}
export function MasterNotes({ project,command,busy }: EditorProps) {
  return <section className="editor-card master-notes"><h2>Заметки мастера</h2><p>Эти записи доступны мастерам. Игроки и общий экран их не получают.</p><form key={`${project.id}-${project.dmNotes}`} onSubmit={e => { e.preventDefault(); command('project.notes',{ text:String(new FormData(e.currentTarget).get('notes')) }); }}><label>Сценарий, тайны и подготовка<textarea name="notes" rows={12} maxLength={100000} defaultValue={project.dmNotes}/></label><button disabled={busy}>Сохранить заметки мастера</button></form></section>;
}
export function DisplayCue({ cue }: { cue?:Cue | null }) {
  const [visible,setVisible] = useState(false);
  useEffect(() => { setVisible(Boolean(cue && cue.expiresAt > Date.now())); if (!cue) return; const timer = setTimeout(() => setVisible(false),Math.max(0,cue.expiresAt-Date.now())); return () => clearTimeout(timer); },[cue?.id]);
  return visible && cue ? <div className="display-cue" key={cue.id}><span>✦</span><strong>{cue.label}</strong><span>✦</span></div> : null;
}
export function Soundboard({ project,command,busy }: EditorProps) {
  const [query,setQuery] = useState(''); const [volume,setVolume] = useState(80);
  return <section className="editor-card soundboard"><h2>Звуки одним нажатием</h2><p>Использует локальные треки из библиотеки выше. Звук играет на основном компьютере поверх фоновой музыки.</p><div className="reference-filters"><label>Поиск звука<input value={query} onChange={e => setQuery(e.target.value)}/></label><label>Громкость: {volume}%<input type="range" min="0" max="100" value={volume} onChange={e => setVolume(Number(e.target.value))}/></label></div><div className="soundboard-buttons">{project.tracks.filter(t => t.name.toLowerCase().includes(query.toLowerCase())).map(track => <button disabled={busy} key={track.id} onClick={() => command('sound.play',{ trackId:track.id,volume:volume/100 })}>▶ {track.name}</button>)}</div>{!project.tracks.length && <p>Загрузите звуки через «Добавить аудио».</p>}<button disabled={busy} onClick={() => command('sound.stop')}>Остановить звук</button></section>;
}
export function SoundEngine({ workspace,enabled,send }: { workspace:Workspace; enabled:boolean; send:(command:Omit<Command,'id'>) => void }) {
  const [owner,setOwner] = useState(false); const [error,setError] = useState(''); const audio = useRef<HTMLAudioElement | null>(null);
  const sound = workspace.sound; const track = workspace.projects.find(p => p.id === sound?.projectId)?.tracks.find(t => t.id === sound?.trackId);
  const latest = useRef(send); latest.current = send;
  useEffect(() => {
    if (!enabled) return;
    let disposed = false; let release:(() => void) | undefined; const abort = new AbortController();
    if (!navigator.locks) { setOwner(true); return () => { setOwner(false); }; }
    void navigator.locks.request('arcane-soundboard-output',{ signal:abort.signal },async () => { if (disposed) return; setOwner(true); await new Promise<void>(resolve => { release = resolve; }); }).catch(() => {});
    return () => { disposed = true; abort.abort(); release?.(); audio.current?.pause(); };
  },[enabled]);
  useEffect(() => {
    if (!owner || !sound || !track) { audio.current?.pause(); return; }
    // A saved one-shot is not a request to replay it on a later launch/reconnect.
    if (Date.now() - sound.startedAt > 3000) return;
    const player = new Audio(track.url); audio.current?.pause(); audio.current = player; player.volume = sound.volume; setError('');
    player.onloadedmetadata = () => { const elapsed = Math.max(0,(Date.now()-sound.startedAt)/1000); if (Number.isFinite(player.duration) && elapsed < player.duration) player.currentTime = elapsed; };
    player.onended = () => latest.current({ type:'sound.stop',projectId:sound.projectId,requestId:sound.id });
    player.onerror = () => setError('Не удалось прочитать звук. Проверьте файл и кодек.');
    void player.play().catch(() => setError('Нажмите здесь, чтобы разрешить звук на основном компьютере'));
    return () => { player.pause(); player.onended = null; player.onerror = null; player.onloadedmetadata = null; player.removeAttribute('src'); player.load(); };
  },[owner,sound?.id,track?.url]);
  return error ? <button className="audio-notice" onClick={() => void audio.current?.play().then(() => setError('')).catch(() => setError('Не удалось включить звук'))}>{error}</button> : null;
}
