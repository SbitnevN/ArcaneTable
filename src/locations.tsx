import React, { useMemo, useState } from 'react';
import type { Command, Folder, Project, Scene } from './contracts';
import { Modal, Field, Section, Dropzone, confirmAction } from './ui';
import { Icon } from './icons';
import { MusicPicker, musicDraft, resolveMusic, playlistLabel, type MusicDraft } from './music-picker';

type Upload = (files: File[], folderId: string | null, sceneId?: string) => Promise<string | null>;
type Props = { project: Project; command: (type: string, extra?: Partial<Command>) => void; upload: Upload; uploadAudio: (files: File[]) => Promise<void>; busy: boolean };
const mediaTypes = 'image/png,image/jpeg,image/webp,video/mp4,video/webm';

function inheritedPlaylist(project: Project, folderId: string | null | undefined): string | null {
  const visited = new Set<string>();
  while (folderId && !visited.has(folderId)) {
    visited.add(folderId);
    const folder = project.folders.find(item => item.id === folderId);
    if (!folder) break;
    if (folder.playlistId !== undefined) return folder.playlistId;
    folderId = folder.parentId;
  }
  return project.playlistId;
}
function folderPath(project: Project, folderId: string | null): Folder[] {
  const path: Folder[] = []; const visited = new Set<string>();
  for (let cursor = project.folders.find(item => item.id === folderId); cursor && !visited.has(cursor.id); cursor = project.folders.find(item => item.id === cursor!.parentId)) { visited.add(cursor.id); path.unshift(cursor); }
  return path;
}
function folderOptions(project: Project, exclude?: string) {
  const out: { id: string; label: string }[] = [];
  const walk = (parentId: string | null, depth: number) => { for (const folder of project.folders.filter(item => item.parentId === parentId && item.id !== exclude)) { out.push({ id: folder.id, label: `${' '.repeat(depth)}▸ ${folder.name}` }); walk(folder.id, depth + 1); } };
  walk(null, 0); return out;
}
function musicBadge(project: Project, item: { playlistId?: string | null }, folderId: string | null | undefined) {
  if (item.playlistId === undefined) { const inherited = inheritedPlaylist(project, folderId); return { own: false, text: inherited ? playlistLabel(project, inherited) : 'Без музыки', spotify: Boolean(project.playlists.find(p => p.id === inherited)?.spotifyUrl) }; }
  return { own: true, text: item.playlistId ? playlistLabel(project, item.playlistId) : 'Тишина', spotify: Boolean(project.playlists.find(p => p.id === item.playlistId)?.spotifyUrl) };
}

export function Locations({ project, command, upload, uploadAudio, busy }: Props) {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ kind: 'scene'; scene: Scene | null } | { kind: 'folder'; folder: Folder | null; parentId: string | null } | { kind: 'root' } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const path = folderPath(project, folderId);
  const childFolders = project.folders.filter(item => item.parentId === folderId);
  const scenes = project.scenes.filter(scene => search ? scene.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) : (scene.folderId || null) === folderId);
  const counts = useMemo(() => {
    const result = new Map<string | null, number>();
    for (const scene of project.scenes) result.set(scene.folderId || null, (result.get(scene.folderId || null) || 0) + 1);
    return result;
  }, [project.scenes]);
  function drop(event: React.DragEvent, destination: string | null) {
    event.preventDefault(); event.stopPropagation(); setOver(null);
    if (busy) return;
    if (event.dataTransfer.files.length) { void upload(Array.from(event.dataTransfer.files), destination); return; }
    const sceneId = event.dataTransfer.getData('application/arcane-scene');
    if (sceneId) command('scene.move', { sceneId, folderId: destination });
  }
  const dropProps = (destination: string | null) => ({ onDragOver: (event: React.DragEvent) => { event.preventDefault(); setOver(destination ?? '__root'); }, onDragLeave: () => setOver(null), onDrop: (event: React.DragEvent) => drop(event, destination) });
  function tree(parentId: string | null, depth = 0): React.ReactNode {
    return project.folders.filter(item => item.parentId === parentId).map(folder => <li key={folder.id}>
      <div className={`loc-tree-item${folder.id === folderId ? ' selected' : ''}${over === folder.id ? ' over' : ''}`} style={{ paddingLeft: 10 + depth * 16 }} {...dropProps(folder.id)}>
        <button type="button" className="loc-tree-open" onClick={() => { setFolderId(folder.id); setSearch(''); }}><span aria-hidden="true">{folder.id === folderId ? '▾' : '▸'}</span><span className="loc-tree-name">{folder.name}</span><small>{counts.get(folder.id) || 0}</small>{folder.playlistId && <span className="loc-tree-music" title={playlistLabel(project, folder.playlistId)}><Icon name="music" size={13}/></span>}</button>
        <button type="button" className="ui-icon-button" aria-label={`Настроить папку ${folder.name}`} onClick={() => setEditing({ kind: 'folder', folder, parentId: folder.parentId })}><Icon name="edit" size={15}/></button>
      </div>
      <ul>{tree(folder.id, depth + 1)}</ul>
    </li>);
  }
  return <div className="loc-layout">
    <aside className="loc-sidebar editor-card">
      <div className="loc-sidebar-head"><h2>Папки</h2><button type="button" className="ui-button small" onClick={() => setEditing({ kind: 'folder', folder: null, parentId: folderId })}>＋ Папка</button></div>
      <ul className="loc-tree">
        <li><div className={`loc-tree-item${!folderId ? ' selected' : ''}${over === '__root' ? ' over' : ''}`} {...dropProps(null)}><button type="button" className="loc-tree-open" onClick={() => { setFolderId(null); setSearch(''); }}><Icon name="image" size={15}/><span className="loc-tree-name">Все локации</span><small>{project.scenes.length}</small></button><button type="button" className="ui-icon-button" aria-label="Музыка проекта по умолчанию" title="Музыка проекта по умолчанию" onClick={() => setEditing({ kind: 'root' })}><Icon name="music" size={15}/></button></div></li>
        {tree(null)}
      </ul>
      <p className="ui-note small">Перетащите карточку локации на папку, чтобы переместить её.</p>
    </aside>
    <section className="loc-main" {...dropProps(folderId)}>
      <div className="loc-toolbar">
        <nav className="loc-breadcrumbs" aria-label="Путь к папке"><button type="button" onClick={() => setFolderId(null)}>Все локации</button>{path.map(folder => <React.Fragment key={folder.id}><span aria-hidden="true">›</span><button type="button" onClick={() => setFolderId(folder.id)}>{folder.name}</button></React.Fragment>)}</nav>
        <input className="loc-search" type="search" aria-label="Поиск локаций" placeholder="Поиск по всем локациям…" value={search} onChange={event => setSearch(event.target.value)}/>
        <button type="button" className="primary" disabled={busy} onClick={() => setEditing({ kind: 'scene', scene: null })}>＋ Новая локация</button>
      </div>
      {!search && folderId && (() => { const folder = project.folders.find(item => item.id === folderId)!; const badge = musicBadge(project, folder, folder.parentId); return <div className="loc-folder-banner"><div><strong>{folder.name}</strong><span className={badge.spotify ? 'music-badge spotify' : 'music-badge'}>{!badge.own && <Icon name="inherit" size={12}/>}{badge.spotify ? <Icon name="spotify" size={12}/> : badge.text !== 'Без музыки' && badge.text !== 'Тишина' ? <Icon name="music" size={12}/> : <Icon name="silence" size={12}/>}{badge.text}</span></div><button type="button" onClick={() => setEditing({ kind: 'folder', folder, parentId: folder.parentId })}>Настроить папку</button></div>; })()}
      <div className="loc-grid">
        {!search && childFolders.map(folder => <button type="button" key={folder.id} className={over === folder.id ? 'loc-folder-card over' : 'loc-folder-card'} onClick={() => setFolderId(folder.id)} {...dropProps(folder.id)}><span className="loc-folder-icon"><Icon name="folder" size={34}/></span><strong>{folder.name}</strong><small>{counts.get(folder.id) || 0} локаций{project.folders.some(item => item.parentId === folder.id) ? ' · есть вложенные' : ''}</small></button>)}
        {scenes.map(scene => { const badge = musicBadge(project, scene, scene.folderId); const active = scene.id === project.sceneId; return <article key={scene.id} className={active ? 'loc-card active' : 'loc-card'} draggable onDragStart={event => event.dataTransfer.setData('application/arcane-scene', scene.id)}>
          <button type="button" className="loc-card-media" disabled={busy} onClick={() => command('scene.select', { sceneId: scene.id })} aria-label={`Показать «${scene.name}» на столе`}>
            {scene.type === 'image' ? <img src={scene.url} alt="" draggable={false} loading="lazy"/> : <video src={`${scene.url}#t=1`} muted preload="metadata" playsInline/>}
            <span className="loc-card-type">{scene.type === 'video' ? <><Icon name="video" size={12}/>Видео</> : <><Icon name="photo" size={12}/>Фото</>}</span>
            {active && <span className="loc-card-live">На столе</span>}
            <span className="loc-card-hover">{active ? 'Сейчас на столе' : 'Показать на столе'}</span>
          </button>
          <div className="loc-card-info"><div><strong title={scene.name}>{scene.name}</strong><span className={badge.spotify ? 'music-badge spotify' : 'music-badge'}>{!badge.own && <Icon name="inherit" size={12}/>}{badge.spotify ? <Icon name="spotify" size={12}/> : badge.text !== 'Без музыки' && badge.text !== 'Тишина' ? <Icon name="music" size={12}/> : <Icon name="silence" size={12}/>}{badge.text}</span></div><button type="button" className="ui-icon-button" aria-label={`Изменить локацию ${scene.name}`} onClick={() => setEditing({ kind: 'scene', scene })}><Icon name="edit" size={15}/></button></div>
        </article>; })}
        {!search && <button type="button" className="loc-add-card" disabled={busy} onClick={() => setEditing({ kind: 'scene', scene: null })}><span aria-hidden="true">＋</span>Новая локация<small>или перетащите сюда фото и видео</small></button>}
      </div>
      {search && !scenes.length && <p className="ui-empty">Ничего не найдено.</p>}
    </section>
    {editing?.kind === 'scene' && <LocationDialog key={editing.scene?.id || 'new'} project={project} scene={editing.scene} folderId={folderId} command={command} upload={upload} uploadAudio={uploadAudio} busy={busy} onClose={() => setEditing(null)}/>}
    {editing?.kind === 'folder' && <FolderDialog key={editing.folder?.id || 'new'} project={project} folder={editing.folder} parentId={editing.parentId} command={command} uploadAudio={uploadAudio} busy={busy} onClose={() => setEditing(null)} onDeleted={() => { if (editing.folder?.id === folderId) setFolderId(editing.folder?.parentId || null); setEditing(null); }}/>}
    {editing?.kind === 'root' && <RootMusicDialog project={project} command={command} uploadAudio={uploadAudio} busy={busy} onClose={() => setEditing(null)}/>}
  </div>;
}

function LocationDialog({ project, scene, folderId, command, upload, uploadAudio, busy, onClose }: { project: Project; scene: Scene | null; folderId: string | null; command: Props['command']; upload: Upload; uploadAudio: Props['uploadAudio']; busy: boolean; onClose: () => void }) {
  const [name, setName] = useState(scene?.name || '');
  const [folder, setFolder] = useState<string | null>(scene ? scene.folderId || null : folderId);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ url: string; type: 'image' | 'video' } | null>(scene ? { url: scene.url, type: scene.type } : null);
  const [music, setMusic] = useState<MusicDraft>(() => musicDraft(project, scene ? scene.playlistId : undefined));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  function choose(next: File) {
    const video = /\.(mp4|webm)$/i.test(next.name) || next.type.startsWith('video/');
    if (!/\.(png|jpe?g|webp|mp4|webm)$/i.test(next.name)) { setError('Поддерживаются PNG, JPEG, WebP, MP4 и WebM'); return; }
    if (preview?.url.startsWith('blob:')) URL.revokeObjectURL(preview.url);
    setFile(next); setError(''); setPreview({ url: URL.createObjectURL(next), type: video ? 'video' : 'image' });
    if (!name.trim()) setName(next.name.replace(/\.[^.]+$/, '').slice(0, 100));
  }
  async function save() {
    if (!name.trim()) { setError('Введите название локации'); return; }
    if (!scene && !file) { setError('Выберите картинку или видео для фона'); return; }
    const resolved = resolveMusic(music, project, name.trim());
    if (resolved.error) { setError(resolved.error); return; }
    setSaving(true); setError('');
    try {
      let sceneId = scene?.id || null;
      if (file) sceneId = await upload([file], folder, scene?.id);
      if (!sceneId) { setError('Файл не загрузился. Проверьте формат и размер'); return; }
      if (resolved.save) command('playlist.save', { playlist: resolved.save });
      command('scene.update', { sceneId, name: name.trim(), folderId: folder, ...(resolved.playlistId === undefined ? {} : { playlistId: resolved.playlistId }) });
      onClose();
    } finally { setSaving(false); }
  }
  return <Modal wide title={scene ? 'Редактировать локацию' : 'Новая локация'} subtitle={scene ? scene.name : 'Фон стола, папка и музыка'} onClose={onClose}
    footer={<>{scene && <button type="button" className="danger" disabled={busy || saving} onClick={() => { if (confirmAction(`Убрать локацию «${scene.name}» из проекта?`)) { command('scene.delete', { sceneId: scene.id }); onClose(); } }}>Удалить</button>}<span className="spacer"/>{error && <span className="ui-error" role="alert">{error}</span>}<button type="button" onClick={onClose}>Отмена</button><button type="button" className="primary" disabled={busy || saving} onClick={() => void save()}>{saving ? 'Сохранение…' : scene ? 'Сохранить' : 'Создать локацию'}</button></>}>
    <div className="loc-dialog">
      <div className="loc-dialog-media">
        <Dropzone accept={mediaTypes} onFile={choose} disabled={saving}>
          {preview ? <div className="loc-preview">{preview.type === 'image' ? <img src={preview.url} alt=""/> : <video src={preview.url} muted autoPlay loop playsInline/>}<span className="loc-preview-change">{file ? file.name : 'Заменить файл'} · нажмите или перетащите</span></div>
            : <div className="loc-preview empty"><Icon name="upload" size={40}/><strong>Перетащите фото или видео</strong><small>или нажмите, чтобы выбрать файл</small><small>PNG, JPEG, WebP до 25 МБ · MP4, WebM до 200 МБ</small></div>}
        </Dropzone>
      </div>
      <div className="loc-dialog-fields">
        <Section title="Основное">
          <Field label="Название"><input autoFocus value={name} maxLength={100} placeholder="Например, Таверна «Ржавый якорь»" onChange={event => setName(event.target.value)}/></Field>
          <Field label="Папка"><select value={folder || ''} onChange={event => setFolder(event.target.value || null)}><option value="">Без папки</option>{folderOptions(project).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
        </Section>
        <Section title="Музыка">
          <MusicPicker project={project} draft={music} onChange={setMusic} inheritLabel={(() => { const id = inheritedPlaylist(project, folder); return id ? playlistLabel(project, id) : 'тишина'; })()} upload={uploadAudio} busy={busy}/>
        </Section>
      </div>
    </div>
  </Modal>;
}

function FolderDialog({ project, folder, parentId, command, uploadAudio, busy, onClose, onDeleted }: { project: Project; folder: Folder | null; parentId: string | null; command: Props['command']; uploadAudio: Props['uploadAudio']; busy: boolean; onClose: () => void; onDeleted: () => void }) {
  const [name, setName] = useState(folder?.name || '');
  const [parent, setParent] = useState<string | null>(folder ? folder.parentId : parentId);
  const [music, setMusic] = useState<MusicDraft>(() => musicDraft(project, folder ? folder.playlistId : undefined));
  const [error, setError] = useState('');
  const empty = folder && !project.folders.some(item => item.parentId === folder.id) && !project.scenes.some(scene => scene.folderId === folder.id);
  function save() {
    if (!name.trim()) { setError('Введите название папки'); return; }
    const resolved = resolveMusic(music, project, name.trim());
    if (resolved.error) { setError(resolved.error); return; }
    if (resolved.save) command('playlist.save', { playlist: resolved.save });
    if (folder) command('folder.update', { folderId: folder.id, name: name.trim(), parentId: parent, ...(resolved.playlistId === undefined ? {} : { playlistId: resolved.playlistId }) });
    else command('folder.create', { folderId: parent, name: name.trim(), ...(resolved.playlistId === undefined ? {} : { playlistId: resolved.playlistId }) });
    onClose();
  }
  return <Modal title={folder ? 'Настройки папки' : 'Новая папка'} subtitle="Локации внутри папки по умолчанию играют её музыку" onClose={onClose}
    footer={<>{folder && <button type="button" className="danger" disabled={busy || !empty} title={empty ? '' : 'Сначала переместите локации и вложенные папки'} onClick={() => { if (confirmAction(`Удалить пустую папку «${folder.name}»?`)) { command('folder.delete', { folderId: folder.id }); onDeleted(); } }}>Удалить папку</button>}<span className="spacer"/>{error && <span className="ui-error" role="alert">{error}</span>}<button type="button" onClick={onClose}>Отмена</button><button type="button" className="primary" disabled={busy} onClick={save}>{folder ? 'Сохранить' : 'Создать папку'}</button></>}>
    <Section title="Основное">
      <div className="ui-grid two">
        <Field label="Название"><input autoFocus value={name} maxLength={100} placeholder="Например, Подземелье" onChange={event => setName(event.target.value)}/></Field>
        <Field label="Внутри папки"><select value={parent || ''} onChange={event => setParent(event.target.value || null)}><option value="">Корень локаций</option>{folderOptions(project, folder?.id).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
      </div>
    </Section>
    <Section title="Плейлист по умолчанию">
      <MusicPicker project={project} draft={music} onChange={setMusic} inheritLabel={(() => { const id = inheritedPlaylist(project, parent); return id ? playlistLabel(project, id) : 'тишина'; })()} upload={uploadAudio} busy={busy}/>
    </Section>
  </Modal>;
}

function RootMusicDialog({ project, command, uploadAudio, busy, onClose }: { project: Project; command: Props['command']; uploadAudio: Props['uploadAudio']; busy: boolean; onClose: () => void }) {
  const [music, setMusic] = useState<MusicDraft>(() => musicDraft(project, project.playlistId ?? undefined, true));
  const [error, setError] = useState('');
  function save() {
    const resolved = resolveMusic(music, project, project.name);
    if (resolved.error) { setError(resolved.error); return; }
    if (resolved.save) command('playlist.save', { playlist: resolved.save });
    command('music.assign', { target: 'project', playlistId: resolved.playlistId ?? null });
    onClose();
  }
  return <Modal title="Музыка проекта" subtitle="Играет во всех локациях, где не задана своя музыка" onClose={onClose}
    footer={<><span className="spacer"/>{error && <span className="ui-error" role="alert">{error}</span>}<button type="button" onClick={onClose}>Отмена</button><button type="button" className="primary" disabled={busy} onClick={save}>Сохранить</button></>}>
    <MusicPicker root project={project} draft={music} onChange={setMusic} upload={uploadAudio} busy={busy}/>
  </Modal>;
}
