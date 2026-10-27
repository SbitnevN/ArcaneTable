import React, { useState } from 'react';
import type { Command, Project } from './contracts';

export function Locations({ project, command, upload, busy }: { project: Project; command: (type: string, extra?: Partial<Command>) => void; upload: (files: File[], folderId: string | null) => Promise<void>; busy: boolean }) {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [rename, setRename] = useState('');
  const [folderName, setFolderName] = useState('');
  const activeFolder = project.folders.find(f => f.id === folderId);
  const selected = project.scenes.find(s => s.id === project.sceneId);
  function drop(event: React.DragEvent, destination: string | null) {
    event.preventDefault(); event.stopPropagation();
    if (busy) return;
    if (event.dataTransfer.files.length) { void upload(Array.from(event.dataTransfer.files), destination); return; }
    const sceneId = event.dataTransfer.getData('application/arcane-scene');
    if (sceneId) command('scene.move', { sceneId, folderId: destination });
  }
  function folders(parentId: string | null, depth = 0): React.ReactNode {
    return project.folders.filter(f => f.parentId === parentId).map(folder => <div key={folder.id}><button className={folder.id === folderId ? 'selected' : ''} style={{ paddingLeft: 12 + depth * 16 }} onClick={() => { setFolderId(folder.id); setFolderName(''); }} onDragOver={e => e.preventDefault()} onDrop={e => drop(e, folder.id)}>▸ {folder.name}</button>{folders(folder.id, depth + 1)}</div>);
  }
  return <details className="locations" open><summary>Локации и медиа</summary><div className="locations-body"><nav><button className={!folderId ? 'selected' : ''} onClick={() => setFolderId(null)} onDragOver={e => e.preventDefault()} onDrop={e => drop(e, null)}>Все локации</button>{folders(null)}<form onSubmit={e => { e.preventDefault(); if (name.trim()) { command('folder.create', { folderId, name }); setName(''); } }}><input aria-label="Название папки" placeholder="Новая папка…" value={name} maxLength={100} onChange={e => setName(e.target.value)}/><button disabled={busy || !name.trim()}>Создать папку здесь</button></form></nav><section onDragOver={e => e.preventDefault()} onDrop={e => drop(e, folderId)}><div className="location-actions"><strong>{activeFolder?.name || 'Все локации'}</strong><input aria-label="Поиск сцен" placeholder="Поиск по всем сценам…" value={search} onChange={e => setSearch(e.target.value)}/><label className="upload-label">Импорт файлов<input disabled={busy} type="file" multiple accept="image/png,image/jpeg,image/webp,video/mp4,video/webm" onChange={e => { void upload(Array.from(e.target.files || []), folderId); e.target.value = ''; }}/></label></div>
      <div className="scene-grid">{project.scenes.filter(s => search ? s.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) : (s.folderId || null) === folderId).map(scene => <button key={scene.id} disabled={busy} className={scene.id === project.sceneId ? 'scene-tile selected' : 'scene-tile'} draggable onDragStart={e => e.dataTransfer.setData('application/arcane-scene', scene.id)} onClick={() => { setRename(''); command('scene.select', { sceneId: scene.id }); }}>{scene.type === 'image' ? <img src={scene.url} alt="" draggable={false}/> : <span className="video-icon">▶</span>}<span>{scene.name}</span></button>)}</div><p className="drop-hint">Перетащите сюда файлы, а сцену — на папку слева. MP4/WebM до 200 МБ, изображения до 25 МБ.</p>
      <div className="entity-editor"><h2>Редактор сцены</h2>{selected ? <><p>{selected.name} · {selected.type === 'video' ? 'Видео' : 'Изображение'}</p><form onSubmit={e => { e.preventDefault(); if (rename.trim()) { command('scene.rename', { sceneId: selected.id, name: rename }); setRename(''); } }}><label>Название сцены<input aria-label="Новое название сцены" placeholder={selected.name} value={rename} maxLength={100} onChange={e => setRename(e.target.value)}/></label><button disabled={busy || !rename.trim()}>Сохранить название сцены</button></form><label>Папка сцены<select aria-label="Папка сцены" disabled={busy} value={selected.folderId || ''} onChange={e => command('scene.move', { sceneId: selected.id, folderId: e.target.value || null })}><option value="">Корень локаций</option>{project.folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><button disabled={busy} onClick={() => command('scene.delete', { sceneId: selected.id })}>Убрать сцену из проекта</button></> : <p>Выберите сцену из библиотеки или импортируйте изображение либо видео.</p>}</div>
      {activeFolder && <div className="entity-editor"><h2>Редактор папки</h2><form onSubmit={e => { e.preventDefault(); if (folderName.trim()) { command('folder.rename', { folderId, name: folderName }); setFolderName(''); } }}><label>Название папки<input aria-label="Новое название папки" placeholder={activeFolder.name} value={folderName} maxLength={100} onChange={e => setFolderName(e.target.value)}/></label><button disabled={busy || !folderName.trim()}>Сохранить название папки</button></form><button disabled={busy || project.folders.some(f => f.parentId === folderId) || project.scenes.some(scene => scene.folderId === folderId)} onClick={() => { command('folder.delete', { folderId }); setFolderId(activeFolder.parentId); }}>Удалить пустую папку</button></div>}

    </section></div></details>;
}
