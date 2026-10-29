import React, { useState } from 'react';
import type { Command, Project, Workspace } from './contracts';
import { Modal, Field, Section, Segmented, confirmAction } from './ui';
import { Icon } from './icons';

type Props = { state: Workspace; project: Project; command: (type: string, extra?: Partial<Command>) => void; busy: boolean; exportProject: () => Promise<void>; importProject: (file: File) => Promise<void> };

function cover(item: Project) {
  const scene = item.scenes.find(s => s.id === item.sceneId) || item.scenes[0];
  return scene;
}

export function ProjectsPage({ state, project, command, busy, exportProject, importProject }: Props) {
  const [dialog, setDialog] = useState<{ kind: 'create' } | { kind: 'edit'; id: string } | null>(null);
  const open = state.openIds.map(id => state.projects.find(p => p.id === id)!).filter(Boolean);
  const saved = state.projects.filter(p => !state.openIds.includes(p.id));
  const card = (item: Project, index: number | null) => {
    const scene = cover(item);
    const current = item.id === project.id;
    return <article key={item.id} className={current ? 'project-card current' : 'project-card'} draggable={index !== null && !busy}
      onDragStart={e => { e.dataTransfer.setData('application/arcane-project', item.id); e.dataTransfer.effectAllowed = 'move'; }}
      onDragOver={e => { if (index !== null && e.dataTransfer.types.includes('application/arcane-project')) e.preventDefault(); }}
      onDrop={e => { e.preventDefault(); const source = e.dataTransfer.getData('application/arcane-project'); if (index !== null && source && source !== item.id && !busy) command('project.move', { projectId: source, targetIndex: index }); }}>
      <button type="button" className="project-card-cover" disabled={busy} onClick={() => command('project.activate', { projectId: item.id })} aria-label={current ? `${item.name} — редактируется` : `Открыть ${item.name}`}>
        {scene?.type === 'image' ? <img src={scene.url} alt="" draggable={false}/> : scene ? <video src={`${scene.url}#t=1`} muted preload="metadata"/> : <Icon name="image" size={34}/>}
        <span className="project-card-badges">{current && <span className="badge gold">Редактируется</span>}{item.id === state.liveId && <span className="badge live">В эфире</span>}</span>
      </button>
      <div className="project-card-body">
        <div><strong>{item.name}</strong><small>D&D {item.edition || '2024'} · {item.scenes.length} локаций · {item.characters.length} героев · {item.monsters.length} монстров</small></div>
        <button type="button" className="ui-icon-button" aria-label={`Настроить ${item.name}`} onClick={() => setDialog({ kind: 'edit', id: item.id })}><Icon name="edit" size={15}/></button>
      </div>
      {!current && <button type="button" className="project-card-open" disabled={busy} onClick={() => command('project.activate', { projectId: item.id })}>Открыть →</button>}
    </article>;
  };
  const editing = dialog?.kind === 'edit' ? state.projects.find(p => p.id === dialog.id) : undefined;
  return <div className="projects-page">
    <div className="section-heading"><div><h2>Открытые проекты</h2><span className="ui-note small">Перетащите карточку, чтобы изменить порядок вкладок</span></div><button type="button" className="primary" disabled={busy} onClick={() => setDialog({ kind: 'create' })}>＋ Новый проект</button></div>
    <div className="project-grid">{open.map((item, index) => card(item, index))}<button type="button" className="project-card add" disabled={busy} onClick={() => setDialog({ kind: 'create' })}><span aria-hidden="true">＋</span>Новый проект<small>Кампания или ваншот</small></button></div>
    {saved.length > 0 && <><h2 className="projects-subtitle">Сохранённые проекты</h2><div className="project-grid">{saved.map(item => card(item, null))}</div></>}
    <section className="editor-card project-transfer"><h2>Резервная копия и перенос</h2><p>Архив содержит текущий проект «{project.name}»: героев, локации, видео и локальную музыку. Восстановление создаёт отдельный проект, эфир не меняется.</p><div className="action-row"><button type="button" disabled={busy} onClick={() => void exportProject()}><Icon name="download"/>Скачать архив проекта</button><label className="ui-button"><Icon name="upload"/>Восстановить из ZIP<input hidden disabled={busy} type="file" accept=".zip,application/zip" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void importProject(file); }}/></label></div><p className="ui-note small">Архив до 1 ГБ. Ссылки подключения не переносятся. Восстановленный бой открывается на паузе.</p></section>
    {dialog?.kind === 'create' && <CreateProject busy={busy} onClose={() => setDialog(null)} onCreate={name => { command('project.create', { name }); setDialog(null); }}/>}
    {editing && <EditProject key={editing.id} item={editing} state={state} busy={busy} command={command} onClose={() => setDialog(null)}/>}
  </div>;
}

function CreateProject({ busy, onClose, onCreate }: { busy: boolean; onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState('');
  return <Modal title="Новый проект" subtitle="Отдельная кампания со своими героями, локациями и музыкой" onClose={onClose}
    footer={<><span className="spacer"/><button type="button" onClick={onClose}>Отмена</button><button type="button" className="primary" disabled={busy || !name.trim()} onClick={() => onCreate(name.trim())}>Создать проект</button></>}>
    <form onSubmit={e => { e.preventDefault(); if (name.trim()) onCreate(name.trim()); }}><Field label="Название"><input autoFocus aria-label="Название нового проекта" value={name} maxLength={100} placeholder="Например, Зимняя тюрьма" onChange={e => setName(e.target.value)}/></Field></form>
  </Modal>;
}

function EditProject({ item, state, busy, command, onClose }: { item: Project; state: Workspace; busy: boolean; command: Props['command']; onClose: () => void }) {
  const [name, setName] = useState(item.name);
  const isOpen = state.openIds.includes(item.id);
  const run = (type: string, extra: Partial<Command> = {}) => command(type, { projectId: item.id, ...extra });
  return <Modal title="Настройки проекта" subtitle={item.name} onClose={onClose}
    footer={<><span className="spacer"/><button type="button" onClick={onClose}>Отмена</button><button type="button" className="primary" disabled={busy || !name.trim()} onClick={() => { if (name.trim() !== item.name) run('project.rename', { name: name.trim() }); onClose(); }}>Сохранить</button></>}>
    <Section title="Основное"><Field label="Название"><input autoFocus value={name} maxLength={100} onChange={e => setName(e.target.value)}/></Field></Section>
    <Section title="Правила D&D">
      <Segmented label="Редакция правил" value={item.edition || '2024'} onChange={edition => run('project.edition', { name: edition })} options={[{ value: '2024', label: 'D&D 2024 (SRD 5.2.1)' }, { value: '2014', label: 'D&D 2014 (SRD 5.1)' }]}/>
      <p className="ui-note small">Применяется сразу: листы героев, новые монстры и заклинания, справочники SRD по умолчанию.</p>
    </Section>
    <Section title="Действия">
      <div className="action-list">
        {item.id !== state.activeId && <button type="button" disabled={busy} onClick={() => { run('project.activate'); onClose(); }}><strong>Открыть для редактирования</strong><small>Эфир не переключится</small></button>}
        <button type="button" disabled={busy} onClick={() => { run('project.duplicate'); onClose(); }}><strong>Создать копию</strong><small>Удобно для ваншота на основе кампании</small></button>
        {isOpen && <button type="button" disabled={busy || state.openIds.length < 2} onClick={() => { if (confirmAction(`Закрыть вкладку «${item.name}»? Проект останется в списке сохранённых.`)) { run('project.close'); onClose(); } }}><strong>Закрыть вкладку</strong><small>{state.openIds.length < 2 ? 'Это единственная открытая вкладка' : 'Проект не удаляется'}</small></button>}
      </div>
    </Section>
  </Modal>;
}
