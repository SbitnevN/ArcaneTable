import { ShopEditor, ShopStage } from './shop';
import { publicShop } from './shop-view';
import { SceneTools, MasterNotes, DisplayCue, Soundboard, SoundEngine } from './project-tools';
import { ReferenceLibrary } from './references';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { newId, characters, defaultGames, validGame, type Command, type Game, type PublicView, type Workspace, type Character, type Icons } from './contracts';

import { StageCanvas } from './stage';
import { Locations } from './locations';
import { MusicEngine, MusicEditor } from './music';
import { CharacterLibrary } from './character-library';
import { Connections } from './connections';
import { CombatEditor, CombatStage } from './combat';
import { publicCombat } from './combat-view';
import { Player } from './player';

declare global {
  interface Window {
    desktop?: { openSpotify(url: string): Promise<void>; monitors(): Promise<{ id: number; label: string }[]>; settings(): Promise<{ monitorId: number; fullscreen: boolean }>; openDisplay(id: number): Promise<void>; fullscreen(enabled: boolean): Promise<void> };
  }
}
let displayToken: string | null = (new URLSearchParams(location.search).get('display') || new URLSearchParams(location.search).get('join'));
class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (displayToken) headers.set('Authorization', `Bearer ${displayToken}`);
  const response = await fetch(path, { ...options, headers });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error || 'Не удалось выполнить запрос', response.status);
  return data;
}
function useRealtime(ready: boolean, onMessage: () => void) {
  const callback = useRef(onMessage); callback.current = onMessage;
  useEffect(() => {
    if (!ready) return;
    let disposed = false; let timer: ReturnType<typeof setTimeout>; let socket: WebSocket;
    function connect() {
      if (disposed) return;
      socket = new WebSocket(`ws://${location.host}/realtime${displayToken ? `?access=${displayToken}` : ''}`);
      socket.onmessage = () => callback.current();
      socket.onopen = () => callback.current();
      socket.onerror = () => socket.close();
      socket.onclose = () => { if (!disposed) timer = setTimeout(connect, 1500); };
    }
    connect();
    return () => { disposed = true; clearTimeout(timer); socket?.close(); };
  }, [ready]);
}
function Display() {
  const [view, setView] = useState<PublicView | null>(null);
  const [error, setError] = useState('');
  const refresh = useCallback(() => {
    void api<PublicView | null>('/api/display').then(value => { setView(value); setError(''); }).catch(err => setError(err.message));
  }, []);
  useEffect(refresh, [refresh]);
  useRealtime(true, refresh);
  const character = view?.character || characters.find(item => item.id === view?.characterId);
  return <div className="presentation">
    {view && (character || view.combat?.running || view.shop) ? <><div className="live-project">{view.projectName}</div>{view.shop ? <ShopStage shop={view.shop} view={view}/> : view.combat?.running ? <CombatStage view={view}/> : <StageCanvas view={view}/>}</> : <div className="waiting"><span>✦</span><h1>Arcane Table</h1><p>Мастер готовит следующую сцену</p></div>}
    <DisplayCue cue={view?.cue}/><button className="display-fullscreen" onClick={() => void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => setError('Полный экран недоступен в этом браузере'))}>⛶</button>
    {error && <div className="connection-error">{error}</div>}
  </div>;
}
export function WorkspaceShell({ children }: { children: (props: { icons:Icons; onSettings:() => void; characterId: string; character: Character; roster: Character[]; game: Game; onGame: React.Dispatch<React.SetStateAction<Game>>; onSelect: (id: string) => void; section: 'character' | 'notes' }) => React.ReactNode }) {
  const [state, setState] = useState<Workspace | null>(null);
  const [role, setRole] = useState<'master' | 'display' | 'player' | null>(null);
  const [error, setError] = useState('');
  const [audioError, setAudioError] = useState('');
  const [isRoot, setIsRoot] = useState(false);
  const [status, setStatus] = useState('Подключение…');
  const [page, setPage] = useState('preview');
  const [uiScale, setUiScale] = useState(() => { try { const value = Number(localStorage.getItem('arcane-ui-scale') || 100); return [80,90,100,110,125,150].includes(value) ? value : 100; } catch { return 100; } });
  useEffect(() => { try { localStorage.setItem('arcane-ui-scale', String(uiScale)); } catch { /* UI preference storage is optional. */ } }, [uiScale]);
  const [name, setName] = useState('');
  const [rename, setRename] = useState('');
  const [monitors, setMonitors] = useState<{ id: number; label: string }[]>([]);
  const [monitor, setMonitor] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [desktopAvailable, setDesktopAvailable] = useState(false);
  const [pending, setPending] = useState(0);
  const pendingRef = useRef(0);
  const failed = useRef<Command[]>([]);
  const retrying = useRef(false);
  const queue = useRef(Promise.resolve());
  const current = useRef<Workspace | null>(null);
  const initialized = useRef(false);
  const [importing, setImporting] = useState(false);
  const refresh = useCallback(() => {
    if (pendingRef.current || failed.current.length) return;
    void api<Workspace>('/api/state').then(value => {
      if (pendingRef.current || failed.current.length) return;
      current.current = value; setState(value); setStatus('Сохранено в SQLite');
    }).catch(err => { setError(err.message); setStatus('Нет связи с сервером'); });
  }, []);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const params = new URLSearchParams(location.search);
    if (params.has('master')) { displayToken = null; sessionStorage.removeItem('arcane-access-token'); sessionStorage.removeItem('arcane-display-token'); }
    else displayToken = params.get('join') || params.get('display') || sessionStorage.getItem('arcane-access-token') || sessionStorage.getItem('arcane-display-token');
    const token = displayToken || params.get('master');
    const connect = token ? api<{ role: 'master' | 'display' | 'player'; root: boolean }>(`/api/session?token=${encodeURIComponent(token)}`) : api<{ role: 'master' | 'display' | 'player'; root: boolean }>('/api/me');
    void connect.then(async access => {
      history.replaceState(null, '', '/');
      if (displayToken) sessionStorage.setItem('arcane-access-token', displayToken);
      setRole(access.role); setIsRoot(access.root);
      if (access.role === 'master') {
        let value = await api<Workspace>('/api/state');
        const firstProject = value.projects[0];
        const migrationKey = `arcane-migrated-${firstProject.id}`;
        let migrate = false;
        try { migrate = !localStorage.getItem(migrationKey); } catch { /* Browser storage is optional after SQLite migration. */ }
        if (migrate) {
          for (const character of characters) {
            const oldKey = character.id === 'tarkhun' ? 'arcane-table-v1' : `arcane-table-${character.id}-v1`;
            let legacy: unknown;
            try { legacy = JSON.parse(localStorage.getItem(oldKey) || 'null'); } catch { legacy = null; }
            if (validGame(legacy) && JSON.stringify(firstProject.games[character.id]) === JSON.stringify(defaultGames[character.id])) {
              value = await api<Workspace>('/api/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: newId(), type: 'character.update', projectId: firstProject.id, characterId: character.id, game: legacy }) });
            }
          }
          try { localStorage.setItem(migrationKey, '1'); } catch { /* SQLite remains the authoritative storage. */ }
        }
        current.current = value; setState(value); setStatus('Сохранено в SQLite');
        if (window.desktop) {
          setDesktopAvailable(true);
          const items = await window.desktop.monitors();
          const savedSettings = await window.desktop.settings();
          setMonitors(items); setMonitor(items.some(item => item.id === savedSettings.monitorId) ? savedSettings.monitorId : items[0]?.id || 0); setFullscreen(savedSettings.fullscreen);
        } else {
          const desktop = await api<{ available: boolean; monitors: { id:number; label:string }[]; monitorId:number; fullscreen:boolean }>('/api/desktop');
          setDesktopAvailable(desktop.available); setMonitors(desktop.monitors); setMonitor(desktop.monitorId); setFullscreen(desktop.fullscreen);
        }
      }
    }).catch(err => setError(err.message));
  }, []);
  useRealtime(role === 'master', refresh);
  const send = useCallback((command: Omit<Command, 'id'>, optimistic?: (workspace: Workspace) => Workspace) => {
    if (current.current && optimistic) { current.current = optimistic(current.current); setState(current.current); }
    const payload: Command = { ...command, id: newId() };
    if (retrying.current) { failed.current.push(payload); return; }
    pendingRef.current++; setPending(pendingRef.current); setStatus('Сохранение…');
    if (!failed.current.length) setError('');
    queue.current = queue.current.then(async () => {
      try {
        if (failed.current.length) { failed.current.push(payload); setStatus('Изменения ожидают повторного сохранения'); return; }
        const value = await api<Workspace>('/api/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (pendingRef.current === 1) { current.current = value; setState(value); setStatus('Сохранено в SQLite'); }
      } catch (err) {
        if (!(err instanceof ApiError) || err.status >= 500) failed.current.push(payload);
        else if (pendingRef.current === 1) {
          try { const value = await api<Workspace>('/api/state'); current.current = value; setState(value); } catch { /* Keep the visible data if the server is unavailable. */ }
        }
        setError(err instanceof Error ? err.message : 'Ошибка сохранения'); setStatus('Изменения не сохранены');
      }
      finally { pendingRef.current--; setPending(pendingRef.current); }
    });
  }, []);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (pendingRef.current || failed.current.length) event.preventDefault(); };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (role !== 'master' || event.repeat || !event.ctrlKey || !event.shiftKey || (event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable=true]')) return;
      const workspace = current.current; if (!workspace || pendingRef.current || failed.current.length) return;
      const projectId = workspace.activeId;
      if (event.code === 'KeyP') { event.preventDefault(); setPage('preview'); }
      else if (event.code === 'KeyL') { event.preventDefault(); send({ type:'project.live',projectId }); }
      else if (event.code === 'ArrowRight') { event.preventDefault(); if (workspace.projects.find(p => p.id === projectId)?.combat?.running) send({ type:'combat.next',projectId }); }
      else if (event.code === 'KeyZ') { event.preventDefault(); if (workspace.projects.find(p => p.id === projectId)?.combat?.history.length) send({ type:'combat.undo',projectId }); }
    };
    window.addEventListener('keydown',keydown); return () => window.removeEventListener('keydown',keydown);
  },[role,send]);
  if (role === 'display') return <Display/>;
  if (role === 'player') return <Player api={api} subscribe={useRealtime}/>;
  if (!state) return <div className="loading"><h1>Arcane Table</h1><p role="status">{error || status}</p><p>Для запуска панели используйте ссылку «Панель мастера» из терминала npm run dev или npm run desktop.</p></div>;
  const project = state.projects.find(item => item.id === state.activeId)!;
  const activeCharacter = project.selectedCharacter;
  const live = state.projects.find(item => item.id === state.liveId);
  const command = (type: string, extra: Partial<Command> = {}) => send({ type, projectId: project.id, ...extra });
  async function retrySave() {
    if (pendingRef.current) return;
    retrying.current = true;
    setPending(1); pendingRef.current = 1;
    try {
      while (failed.current.length) {
        const payload = failed.current[0];
        const value = await api<Workspace>('/api/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        failed.current.shift();
        if (!failed.current.length) { current.current = value; setState(value); }
      }
      setError(''); setStatus('Сохранено в SQLite');
    } catch (err) { setError(err instanceof Error ? err.message : 'Ошибка сохранения'); }
    finally { setPending(0); pendingRef.current = 0; retrying.current = false; }
  }
  async function openDisplay() {
    try {
      if (window.desktop) await window.desktop.openDisplay(monitor);
      else if (desktopAvailable) await api('/api/desktop/display', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ monitorId: monitor }) });
      else {
        const popup = window.open('about:blank', '_blank');
        if (!popup) throw new Error('Разрешите открытие окна общего экрана');
        try {
          const link = await api<{ path: string }>('/api/display-link');
          popup.opener = null; popup.location.href = link.path;
        } catch (err) { popup.close(); throw err; }
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось открыть экран'); }
  }
  function updateGame(value: React.SetStateAction<Game>) {
    const workspace = current.current!;
    const existing = workspace.projects.find(p => p.id === project.id)!.games[activeCharacter];
    const game = typeof value === 'function' ? value(existing) : value;
    if (!validGame(game)) { setError('Некорректные характеристики или слишком длинный текст'); return; }
    send({ type: 'character.update', projectId: project.id, characterId: activeCharacter, game }, source => ({ ...source,
      projects: source.projects.map(p => p.id === project.id ? { ...p, games: { ...p.games, [activeCharacter]: game } } : p) }));
  }
  async function importFiles(files: File[], folderId: string | null) {
    if (pendingRef.current || importing || failed.current.length) return;
    const projectId = project.id;
    setImporting(true); setError('');
    const errors: string[] = [];
    for (const [index, file] of files.entries()) {
      try {
        const isVideo = /\.(mp4|webm)$/i.test(file.name);
        if (file.size > (isVideo ? 200 : 25) * 1024 * 1024) throw new Error('Файл превышает допустимый размер');
        setStatus(`Импорт ${index + 1}/${files.length}: ${file.name}`);
        const url = URL.createObjectURL(file);
        try {
          if (isVideo) await new Promise<void>((resolve, reject) => {
            const video = document.createElement('video'); video.muted = true; video.preload = 'auto';
            const timeout = setTimeout(() => done(new Error('Не удалось прочитать видео за 15 секунд')), 15000);
            function done(error?: Error) { clearTimeout(timeout); video.onloadeddata = null; video.onerror = null; video.removeAttribute('src'); video.load(); if (error) reject(error); else resolve(); }
            video.onloadeddata = () => done(); video.onerror = () => done(new Error('Кодек видео не поддерживается или файл повреждён')); video.src = url;
          });
          else { const image = new Image(); image.src = url; await image.decode(); }
        } finally { URL.revokeObjectURL(url); }
        const value = await api<Workspace>(`/api/import?projectId=${projectId}&folderId=${folderId || ''}&name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
        if (current.current?.activeId === projectId) { current.current = value; setState(value); }
      } catch (err) { errors.push(`${file.name}: ${err instanceof Error ? err.message : 'Ошибка импорта'}`); }
    }
    setImporting(false); setStatus(errors.length ? 'Импорт завершён с ошибками' : 'Сохранено в SQLite'); setError(errors.join('; ')); refresh();
  }
  async function importAudio(files: File[]) {
    if (pendingRef.current || importing || failed.current.length) return;
    setImporting(true); setError('');
    const projectId = project.id; const errors: string[] = [];
    for (const [index, file] of files.entries()) {
      try {
        if (file.size > 100 * 1024 * 1024) throw new Error('Максимальный размер — 100 МБ');
        setStatus(`Импорт аудио ${index + 1}/${files.length}`);
        const url = URL.createObjectURL(file);
        try {
          await new Promise<void>((resolve, reject) => {
            const audio = new Audio(); audio.preload = 'auto';
            const timer = setTimeout(() => done(new Error('Не удалось прочитать аудиофайл')), 15000);
            function done(error?: Error) { clearTimeout(timer); audio.onloadeddata = null; audio.onerror = null; audio.removeAttribute('src'); audio.load(); if (error) reject(error); else resolve(); }
            audio.onloadeddata = () => done(); audio.onerror = () => done(new Error('Файл повреждён или кодек не поддерживается')); audio.src = url;
          });
        } finally { URL.revokeObjectURL(url); }
        const value = await api<Workspace>(`/api/audio?projectId=${projectId}&name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
        if (current.current?.activeId === projectId) { current.current = value; setState(value); }
      } catch (err) { errors.push(`${file.name}: ${err instanceof Error ? err.message : 'Ошибка импорта'}`); }
    }
    setImporting(false); setError(errors.join('; ')); setStatus(errors.length ? 'Импорт завершён с ошибками' : 'Все изменения сохранены'); refresh();
  }
  async function importPortrait(file: File) {
    if (busyRefPortrait()) return;
    setImporting(true); setError('');
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('Карта должна быть не больше 25 МБ');
      const url = URL.createObjectURL(file);
      try { const image = new Image(); image.src = url; await image.decode(); } finally { URL.revokeObjectURL(url); }
      const value = await api<Workspace>(`/api/portrait?projectId=${project.id}&characterId=${activeCharacter}`, { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
      current.current = value; setState(value); setStatus('Все изменения сохранены');
    } catch (err) { setError(err instanceof Error ? err.message : 'Ошибка загрузки карты'); }
    finally { setImporting(false); }
  }
  async function importIcon(kind: string, file: File) {
    if (busyRefPortrait()) return; setImporting(true); setError('');
    try {
      if (file.size > 2*1024*1024) throw new Error('Значок должен быть не больше 2 МБ');
      const value = await api<Workspace>(`/api/icon?projectId=${project.id}&kind=${kind}`, { method:'POST',headers:{ 'Content-Type':file.type },body:file });
      current.current = value; setState(value); setStatus('Значки сохранены в проекте');
    } catch (err) { setError(err instanceof Error ? err.message : 'Ошибка загрузки значка'); } finally { setImporting(false); }
  }
  async function importShopArtwork(shopId: string, itemId: string | undefined, file: File) {
    if (busyRefPortrait()) return; setImporting(true); setError('');
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('Изображение должно быть не больше 25 МБ');
      const value = await api<Workspace>(`/api/shop-artwork?projectId=${project.id}&shopId=${shopId}${itemId ? `&itemId=${itemId}` : ''}`, { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
      current.current = value; setState(value); setStatus('Изображение магазина сохранено');
    } catch (err) { setError(err instanceof Error ? err.message : 'Ошибка загрузки'); } finally { setImporting(false); }
  }
  async function importMonsterPortrait(monsterId: string, file: File) {
    if (busyRefPortrait()) return; setImporting(true); setError('');
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('Карта должна быть не больше 25 МБ');
      const value = await api<Workspace>(`/api/monster-portrait?projectId=${project.id}&monsterId=${monsterId}`, { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
      current.current = value; setState(value); setStatus('Карта монстра сохранена');
    } catch (err) { setError(err instanceof Error ? err.message : 'Ошибка загрузки'); } finally { setImporting(false); }
  }
  async function importCharacter(file: File) {
    if (busyRefPortrait()) return;
    setImporting(true); setError('');
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('JSON должен быть не больше 5 МБ');
      const result = await api<{ state: Workspace; warnings: string[] }>(`/api/lss/import?projectId=${project.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: file });
      current.current = result.state; setState(result.state); setStatus('Персонаж импортирован');
      if (result.warnings.length) setError(result.warnings.join(' '));
    } catch (err) { setError(err instanceof Error ? err.message : 'Ошибка импорта персонажа'); }
    finally { setImporting(false); }
  }
  async function exportCharacter() {
    if (busyRefPortrait()) return;
    try {
      const result = await api<unknown>(`/api/lss/export?projectId=${project.id}&characterId=${activeCharacter}`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `character-${activeCharacter}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('Файл персонажа подготовлен');
    } catch (err) { setError(err instanceof Error ? err.message : 'Ошибка экспорта'); }
  }
  async function exportProject() {
    if (busyRefPortrait()) return;
    setImporting(true); setError(''); setStatus('Упаковка проекта и медиа…');
    try {
      const response = await fetch(`/api/project/export?projectId=${project.id}`, { headers: displayToken ? { Authorization: `Bearer ${displayToken}` } : {} });
      if (!response.ok) throw new Error((await response.json()).error || 'Ошибка экспорта');
      const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `arcane-${project.id}.zip`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setStatus('Архив проекта готов');
    } catch (err) { setError(err instanceof Error ? err.message : 'Ошибка экспорта'); setStatus('Экспорт не завершён'); }
    finally { setImporting(false); }
  }
  async function importProject(file: File) {
    if (busyRefPortrait()) return;
    setImporting(true); setError(''); setStatus('Проверка и восстановление архива…');
    try {
      if (file.size > 1024 ** 3) throw new Error('Архив должен быть не больше 1 ГБ');
      const value = await api<Workspace>('/api/project/import', { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: file });
      current.current = value; setState(value); setStatus('Проект восстановлен отдельной копией');
    } catch (err) { setError(err instanceof Error ? err.message : 'Ошибка импорта'); setStatus('Восстановление не завершено'); }
    finally { setImporting(false); }
  }
  function busyRefPortrait() { return pendingRef.current > 0 || importing || failed.current.length > 0; }
  const pages = [
    { id: 'preview', title: 'Предпросмотр', icon: '◈', description: 'Сцена и композиция' },
    { id: 'shops', title: 'Магазины', icon: '♧', description: 'Товары и торговцы' },
    { id: 'projects', title: 'Проекты', icon: '▦', description: 'Кампании и ваншоты' },
    { id: 'locations', title: 'Локации', icon: '▧', description: 'Папки, фото и видео' },
    { id: 'combat', title: 'Бой', icon: '⚔', description: 'Ходы и действия' },
    { id: 'bestiary', title: 'Бестиарий', icon: '♜', description: 'SRD и мои монстры' },
    { id: 'spells', title: 'Заклинания', icon: '✧', description: 'Справочник SRD' },
    { id: 'music', title: 'Музыка', icon: '♫', description: 'Треки и атмосфера' },
    { id: 'character', title: 'Персонажи', icon: '♙', description: 'Показатели и облик' },
    { id: 'notes', title: 'Заметки', icon: '≡', description: 'Тексты и способности' },
    ...(isRoot ? [{ id: 'connections', title: 'Подключения', icon: '⌁', description: 'Телефоны и экраны' }] : []),
    { id: 'settings', title: 'Настройки', icon: '⚙', description: 'Интерфейс и экраны' }
  ];
  const currentPage = pages.find(item => item.id === page)!;
  const busy = pending > 0 || importing;
  return <div className="studio" style={{ '--ui-scale': uiScale / 100, zoom: uiScale / 100 } as React.CSSProperties}>
    <header className="studio-header"><div className="studio-brand">✦ <span>ARCANE TABLE<small>МАСТЕРСКАЯ ВАШИХ ИСТОРИЙ</small></span></div><button className="project-context" onClick={() => setPage('projects')}><span>Текущий проект</span><strong>{project.name}</strong><span>Сменить ›</span></button><div className="studio-status"><span className={live ? 'live-pill' : 'idle-pill'}>{live ? `В эфире: ${live.name}` : 'Эфир не запущен'}</span><small role="status">{status === 'Сохранено в SQLite' ? 'Все изменения сохранены' : status}</small></div></header>
    <div className="studio-body"><main className="studio-content" id="editor-panel" role="tabpanel" aria-labelledby={`nav-${page}`}>
      <SoundEngine enabled={isRoot} workspace={state} send={send}/><MusicEngine enabled={isRoot} workspace={state} send={send} onStatus={setAudioError}/>
      <div className="page-heading"><div><span className="page-kicker">{project.name}</span><h1>{currentPage.title}</h1></div>{page === 'preview' && <div className="action-row"><button className="primary" disabled={busy} onClick={() => command('project.live')}>{state.liveId === project.id ? 'Обновить эфир' : 'Вывести в эфир'}</button><button onClick={() => void openDisplay()}>Открыть общий экран ↗</button></div>}</div>
      {error && <div className="error-banner" role="alert">{error}{failed.current.length ? <button disabled={pending > 0} onClick={() => void retrySave()}>Повторить сохранение</button> : <button onClick={() => { setError(''); refresh(); }}>Закрыть сообщение</button>}</div>}
      {page === 'preview' && <>
        <div className="preview-context"><label>Сцена<select value={project.sceneId || ''} onChange={e => command('scene.select', { sceneId: e.target.value })}><option value="" disabled>Выберите сцену в локациях</option>{project.scenes.map(scene => <option key={scene.id} value={scene.id}>{scene.name}</option>)}</select></label><label>Персонаж<select value={activeCharacter} onChange={e => command('character.select', { characterId: e.target.value })}>{project.characters.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label><p>{state.liveId === project.id ? 'Изменения этого проекта видны на общем экране.' : 'Вы готовите проект. Нажмите «Вывести в эфир», когда будете готовы.'}</p></div>
        {project.activeShopId && publicShop(project) ? <><div className="shop-preview"><ShopStage shop={publicShop(project)!} view={{ scene: project.scenes.find(s => s.id === project.sceneId) || null, background: project.background }}/></div><p>Подготовлен магазин. «Вывести в эфир» вернёт сцену; управление магазином — в разделе «Магазины».</p></> : project.combat?.running ? <div className="combat-preview"><CombatStage view={{ icons: project.icons, character: project.characters.find(c => c.id === activeCharacter), combat: publicCombat(project), projectName: project.name, scene: project.scenes.find(scene => scene.id === project.sceneId) || null, characterId: activeCharacter, hp: project.games[activeCharacter].hp, maxHp: project.games[activeCharacter].maxHp, ac: project.games[activeCharacter].ac, layout: project.layout, background: project.background }}/></div> : <StageCanvas key={`stage-${project.id}`} edit view={{ icons: project.icons, character: project.characters.find(c => c.id === activeCharacter), projectName: project.name, scene: project.scenes.find(scene => scene.id === project.sceneId) || null, characterId: activeCharacter, hp: project.games[activeCharacter].hp, maxHp: project.games[activeCharacter].maxHp, ac: project.games[activeCharacter].ac, layout: project.layout, background: project.background }} onLayout={(layout, target) => send({ type: 'layout.update', projectId: project.id, layout, target }, source => ({ ...source, projects: source.projects.map(p => p.id === project.id ? { ...p, [target === 'card' ? 'layout' : 'background']: layout } : p) }))}/>}

        <SceneTools project={project} command={command} busy={busy}/><p className="editor-help">Перетащите карту в кадре или настройте её справа. Размер интерфейса меняется в нижней части меню.</p>
      </>}
      {page === 'projects' && <div className="projects-layout"><section className="editor-card"><div className="section-heading"><h2>Открытые проекты</h2><span>Перетащите, чтобы изменить порядок</span></div><div className="project-list">{state.openIds.map((id, index) => {
        const item = state.projects.find(p => p.id === id)!;
        return <div className={id === project.id ? 'project-row selected' : 'project-row'} key={id} draggable={!busy} onDragStart={e => { e.dataTransfer.setData('application/arcane-project', id); e.dataTransfer.effectAllowed = 'move'; }} onDragOver={e => { if (e.dataTransfer.types.includes('application/arcane-project')) e.preventDefault(); }} onDrop={e => { e.preventDefault(); const source = e.dataTransfer.getData('application/arcane-project'); if (source && source !== id && !busy) command('project.move', { projectId: source, targetIndex: index }); }}><span className="drag-grip">⠿</span><button className="project-select" aria-pressed={id === project.id} onClick={() => { setRename(''); command('project.activate', { projectId: id }); }}><strong>{item.name}</strong><small>{id === project.id ? 'Редактируется' : 'Открыть для редактирования'}{id === state.liveId ? ' · В эфире' : ''}</small></button><button disabled={busy || index === 0} aria-label={`Переместить ${item.name} выше`} onClick={() => command('project.move', { projectId: id, targetIndex: index - 1 })}>↑</button><button disabled={busy || state.openIds.length === 1} aria-label={`Закрыть вкладку ${item.name}`} onClick={() => command('project.close', { projectId: id })}>×</button></div>;
      })}</div>{state.projects.some(p => !state.openIds.includes(p.id)) && <><h2>Сохранённые проекты</h2>{state.projects.filter(p => !state.openIds.includes(p.id)).map(item => <button className="saved-project" key={item.id} onClick={() => command('project.activate', { projectId: item.id })}>{item.name}<span>Открыть →</span></button>)}</>}</section><div className="project-forms"><section className="editor-card"><h2>Создать проект</h2><p>Новая кампания или отдельный ваншот.</p><form onSubmit={e => { e.preventDefault(); if (name.trim()) { command('project.create', { name }); setName(''); } }}><label>Название<input aria-label="Название нового проекта" placeholder="Например, Зимняя тюрьма" required maxLength={100} value={name} onChange={e => setName(e.target.value)}/></label><button className="primary" disabled={busy || !name.trim()}>Создать проект</button></form></section><section className="editor-card"><h2>Редактировать проект</h2><p>{project.name}</p><form onSubmit={e => { e.preventDefault(); if (rename.trim()) { command('project.rename', { name: rename }); setRename(''); } }}><label>Новое название<input aria-label="Новое название проекта" placeholder={project.name} required maxLength={100} value={rename} onChange={e => setRename(e.target.value)}/></label><button disabled={busy || !rename.trim()}>Сохранить название</button></form><button disabled={busy} onClick={() => command('project.duplicate')}>Создать копию проекта</button></section></div></div>}
      {page === 'projects' && <section className="editor-card project-transfer"><h2>Резервная копия и перенос</h2><p>Архив содержит текущий проект, карты, сцены, видео и локальную музыку. Восстановление создаёт отдельный проект; запущенный эфир остаётся прежним.</p><div className="action-row"><button disabled={busy} onClick={() => void exportProject()}>Скачать архив проекта</button><label className="upload-label">Восстановить из ZIP<input disabled={busy} type="file" accept=".zip,application/zip" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void importProject(file); }}/></label></div><p className="editor-help">Архив до 1 ГБ. Ссылки подключения не переносятся. Восстановленный бой открывается на паузе.</p></section>}
      {page === 'shops' && <ShopEditor key={project.id} project={project} liveId={state.liveId} command={command} busy={busy} upload={importShopArtwork}/>}
      {page === 'locations' && <Locations key={`locations-${project.id}`} project={project} command={command} upload={importFiles} busy={busy}/>}
      {page === 'character' && <CharacterLibrary key={`library-${project.id}-${activeCharacter}`} project={project} command={command} busy={busy} portrait={importPortrait} importCharacter={importCharacter} exportCharacter={exportCharacter}/>}
      {page === 'notes' && <MasterNotes project={project} command={command} busy={busy}/>}
      {(page === 'character' || page === 'notes') && children({ icons: project.icons, onSettings: () => setPage('settings'), characterId: activeCharacter, character: project.characters.find(c => c.id === activeCharacter)!, roster: project.characters, game: project.games[activeCharacter], onGame: updateGame, onSelect: characterId => command('character.select', { characterId }), section: page })}
      {page === 'combat' && <CombatEditor key={project.id} project={project} command={command} busy={busy}/>}
      {(page === 'bestiary' || page === 'spells') && <ReferenceLibrary key={`${project.id}-${page}`} kind={page === 'spells' ? 'spells' : 'monsters'} project={project} command={command} busy={busy} portrait={importMonsterPortrait}/>}
      {page === 'connections' && isRoot && <Connections workspace={state} api={api}/>}
      {page === 'music' && <><Soundboard project={project} command={command} busy={busy}/><MusicEditor key={project.id} project={project} music={state.music} command={command} upload={importAudio} busy={busy} error={audioError}/></>}
      {page === 'settings' && <div className="settings-grid"><section className="editor-card icon-editor"><h2>Сердце и щит</h2><p>Значки сохраняются в проекте, переносятся в архиве и видны на всех карточках. PNG или WebP до 2 МБ, не более 2048 × 2048.</p>{(['heart','shield'] as const).map(kind => <div key={kind}><img src={project.icons[kind]} alt={kind === 'heart' ? 'Сердце' : 'Щит'}/><label className="upload-label">{kind === 'heart' ? 'Заменить сердце' : 'Заменить щит'}<input type="file" disabled={busy} accept="image/png,image/webp" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void importIcon(kind,file); }}/></label><button disabled={busy} onClick={() => command('icon.reset',{ kind })}>Вернуть стандартный</button></div>)}</section><section className="editor-card"><h2>Горячие клавиши</h2><p>Ctrl + Shift + P — предпросмотр.<br/>Ctrl + Shift + L — вывести текущий проект в эфир.<br/>Ctrl + Shift + → — следующий ход.<br/>Ctrl + Shift + Z — отменить последнее изменение ХП.</p><p>Не срабатывают при наборе текста.</p></section><section className="editor-card"><h2>Размер интерфейса</h2><p>Увеличивает текст, кнопки и панели. Общий экран игроков сохраняет свой масштаб.</p><label>Масштаб интерфейса<select aria-label="Масштаб интерфейса в настройках" value={uiScale} onChange={e => setUiScale(Number(e.target.value))}>{[80,90,100,110,125,150].map(value => <option key={value} value={value}>{value}%</option>)}</select></label><button onClick={() => setUiScale(100)}>Вернуть 100%</button></section><section className="editor-card"><h2>Общий экран</h2><p>Показывайте готовую сцену в отдельном окне.</p>{desktopAvailable ? <><label>Монитор<select value={monitor} onChange={e => setMonitor(Number(e.target.value))}>{monitors.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><button onClick={() => void openDisplay()}>Открыть на выбранном мониторе</button><button onClick={() => { const next = !fullscreen; void (window.desktop ? window.desktop.fullscreen(next) : api('/api/desktop/display', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ monitorId: monitor, fullscreen: next }) })).then(() => setFullscreen(next)).catch(err => setError(err.message)); }}>{fullscreen ? 'Вернуть оконный режим' : 'Включить полный экран'}</button></> : <button onClick={() => void openDisplay()}>Открыть общий экран в браузере ↗</button>}{live && <button disabled={busy} onClick={() => command('project.stop')}>Завершить эфир «{live.name}»</button>}</section></div>}
    </main><aside className="studio-navigation"><nav role="tablist" aria-label="Разделы мастерской" aria-orientation="vertical">{pages.map(item => <button role="tab" id={`nav-${item.id}`} aria-selected={page === item.id} aria-controls="editor-panel" key={item.id} onClick={() => setPage(item.id)} onKeyDown={e => { const index = pages.findIndex(p => p.id === item.id); const next = e.key === 'ArrowDown' ? (index + 1) % pages.length : e.key === 'ArrowUp' ? (index + pages.length - 1) % pages.length : -1; if (next >= 0) { e.preventDefault(); setPage(pages[next].id); document.getElementById(`nav-${pages[next].id}`)?.focus(); } }}><span className="nav-icon">{item.icon}</span><span><strong>{item.title}</strong><small>{item.description}</small></span></button>)}</nav><div className="rail-scale"><label>Размер интерфейса<select aria-label="Масштаб интерфейса" value={uiScale} onChange={e => setUiScale(Number(e.target.value))}>{[80,90,100,110,125,150].map(value => <option key={value} value={value}>{value}%</option>)}</select></label><small>Сохраняется на этом устройстве</small></div></aside></div>
  </div>;
}
