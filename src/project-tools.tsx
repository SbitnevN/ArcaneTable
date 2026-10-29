import React, { useEffect, useRef, useState } from 'react';
import type { Command, Cue, Project, Workspace } from './contracts';
import { Field, Modal, Segmented } from './ui';

type EditorProps = { project:Project; command:(type:string,extra?:Partial<Command>) => void; busy:boolean };
export function SceneTools({ project,command,busy }: EditorProps) {
  const [name,setName] = useState('');
  return <div className="settings-grid scene-extras"><section className="editor-card"><h2>Шаблоны композиции</h2><p>Сохраняет сцену, карту и их положение.</p><form onSubmit={e => { e.preventDefault(); if (name.trim()) { command('preset.save',{ name }); setName(''); } }}><label>Название шаблона<input value={name} maxLength={100} onChange={e => setName(e.target.value)}/></label><button disabled={busy || !name.trim()}>Сохранить композицию</button></form>{project.presets.map(p => <div className="preset-row" key={p.id}><strong>{p.name}</strong><button disabled={busy} onClick={() => command('preset.apply',{ presetId:p.id })}>Применить</button><button disabled={busy} aria-label={`Убрать шаблон ${p.name}`} onClick={() => command('preset.delete',{ presetId:p.id })}>×</button></div>)}</section><section className="editor-card"><h2>Сообщение на общем экране</h2><p>Видно, когда этот проект в эфире. Быстрый доступ — кнопка «Сообщение на экран» вверху страницы.</p><CueForm project={project} command={command} busy={busy}/></section></div>;
}
// One tap hides a hero who is not at the table tonight from the shared screen's hand, and brings them back.
export function HeroesOnTable({ project,command,busy }: EditorProps) {
  const shown = project.characters.filter(item => !item.offstage).length;
  return <section className="heroes-on-table" aria-label="Герои на столе">
    <div className="heroes-on-table-head"><strong>Герои на столе</strong><span>{shown} из {project.characters.length} на общем экране</span></div>
    <div className="heroes-on-table-list">{project.characters.map(character => <button type="button" key={character.id} aria-pressed={!character.offstage} className={character.offstage ? 'hero-toggle off' : 'hero-toggle'} disabled={busy} title={character.offstage ? 'Показать на общем экране' : 'Убрать с общего экрана'} onClick={() => command('character.offstage',{ characterId:character.id, visible:Boolean(character.offstage) })}>
      <img src={character.image} alt=""/><span>{character.name}</span><small>{character.offstage ? 'скрыт' : 'на столе'}</small>
    </button>)}</div>
  </section>;
}
export function MasterNotes({ project,command,busy }: EditorProps) {
  return <section className="editor-card master-notes"><h2>Заметки мастера</h2><p>Эти записи доступны мастерам. Игроки и общий экран их не получают.</p><form key={`${project.id}-${project.dmNotes}`} onSubmit={e => { e.preventDefault(); command('project.notes',{ text:String(new FormData(e.currentTarget).get('notes')) }); }}><label>Сценарий, тайны и подготовка<textarea name="notes" rows={12} maxLength={100000} defaultValue={project.dmNotes}/></label><button disabled={busy}>Сохранить заметки мастера</button></form></section>;
}
const cueLive = (cue?: Cue | null) => Boolean(cue && (cue.expiresAt === null || cue.expiresAt > Date.now()));
const cueDurations = [{ value: '6', label: '6 сек' }, { value: '15', label: '15 сек' }, { value: '60', label: 'Минута' }, { value: '0', label: 'Пока не скрою' }];
// Headline, optional text and how long it stays; showing a new message replaces the current one.
function CueForm({ project,command,busy,onDone }: EditorProps & { onDone?: () => void }) {
  const [title,setTitle] = useState(''); const [text,setText] = useState(''); const [seconds,setSeconds] = useState('6');
  const live = cueLive(project.cue);
  return <form className="cue-form" onSubmit={e => { e.preventDefault(); if (!title.trim()) return; command('cue.show',{ name:title, text, count:Number(seconds) }); onDone?.(); }}>
    <Field label="Заголовок"><input value={title} maxLength={100} onChange={e => setTitle(e.target.value)} placeholder="Ночь опускается на древний храм…" autoFocus={Boolean(onDone)}/></Field>
    <Field label="Текст" hint="Необязательно. До 1000 символов, переносы строк сохраняются."><textarea value={text} maxLength={1000} rows={4} onChange={e => setText(e.target.value)} placeholder="Подробности для игроков: что они видят, слышат, чувствуют."/></Field>
    <div className="ui-field"><span className="ui-label">Сколько держать на экране</span><Segmented label="Длительность" value={seconds} options={cueDurations} onChange={setSeconds}/></div>
    {live && project.cue && <p className="cue-now">Сейчас на экране: <b>«{project.cue.label}»</b>{project.cue.expiresAt === null ? ', пока не скроете' : ''}</p>}
    <div className="action-row"><button className="primary" disabled={busy || !title.trim()}>Показать на экране</button><button type="button" disabled={busy || !live} onClick={() => command('cue.hide')}>Скрыть</button></div>
  </form>;
}
// Header button for the preview and combat pages: opens the message form without scrolling down.
export function CueButton({ project,command,busy }: EditorProps) {
  const [open,setOpen] = useState(false);
  const live = cueLive(project.cue);
  return <>
    <button type="button" className={live ? 'cue-button live' : 'cue-button'} onClick={() => setOpen(true)}>{live ? '● Сообщение на экране' : 'Сообщение на экран'}</button>
    {open && <Modal title="Сообщение на общий экран" subtitle={project.name} onClose={() => setOpen(false)}><CueForm project={project} command={command} busy={busy} onDone={() => setOpen(false)}/></Modal>}
  </>;
}
export function DisplayCue({ cue }: { cue?:Cue | null }) {
  const [visible,setVisible] = useState(false);
  useEffect(() => { setVisible(cueLive(cue)); if (!cue || cue.expiresAt === null) return; const timer = setTimeout(() => setVisible(false),Math.max(0,cue.expiresAt-Date.now())); return () => clearTimeout(timer); },[cue?.id]);
  if (!visible || !cue) return null;
  return cue.text
    ? <div className="display-cue message" key={cue.id}><div className="display-cue-card"><strong>{cue.label}</strong><p>{cue.text}</p></div></div>
    : <div className="display-cue" key={cue.id}><span>✦</span><strong>{cue.label}</strong><span>✦</span></div>;
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
