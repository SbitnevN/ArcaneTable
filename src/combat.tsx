import React, { useState, useRef } from 'react';
import { type Command, type Participant, type Project, type PublicParticipant, type PublicView } from './contracts';
import { participantStats, publicCombat } from './combat-view';
import { LocationReveal, SceneMedia } from './stage';
import { TableCard } from './table-card';
import { CombatEffects } from './combat-effects';
import { MasterCombat } from './master-combat';
import { BestiaryPicker, StatBlockButton } from './bestiary';
import { EncounterPlans } from './encounter';
import { LootEditor, MasterLoot } from './loot';
import { Modal } from './ui';
import { ItemIcon } from './item-icons';
import { Icon } from './icons';

export function CombatStage({ view }: { view: PublicView }) {
  const surface = useRef<HTMLDivElement>(null);
  const combat = view.combat;
  if (!combat) return null;
  const active = combat.participants.find(item => item.id === combat.activeId);
  const render = (item: PublicParticipant) => <TableCard key={item.id} item={item} active={item.id === active?.id}/>;
  return <div className="combat-stage card-table" ref={surface} style={{ '--hand-scale': Math.min(1.25, Math.max(0.6, view.layout.scale)) } as React.CSSProperties}><SceneMedia scene={view.scene} layout={view.background}/><div className="table-vignette"/>
    <div className="combat-heading"><span>{combat.name}</span><strong>Раунд {combat.round}</strong></div>
    <section className="table-side table-master"><span className="table-side-label">РУКА МАСТЕРА</span><div className="combat-enemies table-hand" aria-label="Противники мастера">{combat.participants.filter(item => item.side === 'enemy').map(render)}</div></section>
    <div className="combat-active table-center"/><LocationReveal scene={view.scene}/>
    <section className="table-side table-players"><div className="combat-allies table-hand" aria-label="Герои игроков">{combat.participants.filter(item => item.side === 'ally').map(render)}</div><span className="table-side-label">РУКА ИГРОКОВ</span></section>
    <CombatEffects surface={surface} combat={combat}/>
  </div>;
}
// Hand size for the shared table; the same project.layout.scale also sizes the hand outside combat.
export function CardScale({ project, command, busy }: { project: Project; command: (type: string, extra?: Partial<Command>) => void; busy: boolean }) {
  const [scale, setScale] = useState(project.layout.scale);
  React.useEffect(() => setScale(project.layout.scale), [project.layout.scale]);
  const commit = () => { if (scale !== project.layout.scale) command('layout.update', { target: 'card', layout: { ...project.layout, scale } }); };
  return <div className="card-scale"><label>Размер карт · {Math.round(scale * 100)}%<input type="range" min={0.6} max={1.25} step={0.05} disabled={busy} value={Math.min(1.25, Math.max(0.6, scale))} onChange={e => setScale(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit}/></label></div>;
}
function LootButton({ project, participant, command, busy }: { project: Project; participant: Participant; command: (type: string, extra?: Partial<Command>) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(participant.loot || []);
  return <><button type="button" className="ui-icon-button loot-button" aria-label={`Лут: ${participant.name}`} title="Лут" onClick={() => { setDraft(participant.loot || []); setOpen(true); }}><ItemIcon name="chest"/>{participant.loot?.length ? <b>{participant.loot.length}</b> : null}</button>{open && <Modal title={`Лут: ${participant.name}`} subtitle="Достанется героям при дележе добычи" onClose={() => setOpen(false)} footer={<><span className="spacer"/><button type="button" onClick={() => setOpen(false)}>Отмена</button><button type="button" className="primary" disabled={busy} onClick={() => { command('combat.loot.set', { participantId: participant.id, loot: draft }); setOpen(false); }}>Сохранить</button></>}><LootEditor project={project} value={draft} onChange={setDraft} busy={busy}/></Modal>}</>;
}
// Shared-screen preview, hand size and table background, out of the way in a modal.
function ScreenButton({ project, command, busy, onBackground }: { project: Project; command: (type: string, extra?: Partial<Command>) => void; busy: boolean; onBackground: () => void }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className="ui-icon-button" aria-label="Экран и фон" title="Экран и фон" onClick={() => setOpen(true)}><Icon name="tv" size={16}/></button>
    {open && <Modal wide title="Общий экран и фон" onClose={() => setOpen(false)} footer={<><button type="button" disabled={busy} onClick={() => { setOpen(false); onBackground(); }}>Загрузить фон ↗</button><span className="spacer"/><button type="button" onClick={() => setOpen(false)}>Готово</button></>}>
      <div className="combat-screen-settings"><CardScale project={project} command={command} busy={busy}/><label>Фон стола<select aria-label="Фон стола" disabled={busy} value={project.sceneId || ''} onChange={e => command('scene.select', { sceneId: e.target.value })}><option value="" disabled>Выберите фон в локациях</option>{project.scenes.map(scene => <option key={scene.id} value={scene.id}>{scene.name}</option>)}</select></label></div>
      <div className="combat-preview"><CombatStage view={{ icons: project.icons, combat: publicCombat(project), projectName: project.name, scene: project.scenes.find(scene => scene.id === project.sceneId) || null, characterId: '', layout: project.layout, background: project.background }}/></div>
      <p className="editor-help">Противники сверху, герои снизу. Активная карта выдвигается из руки.</p>
    </Modal>}</>;
}
// Turn order with everything the master tweaks during a fight on one row: initiative, turn, statuses and what players may see.
function InitiativeTable({ project, command, busy }: { project: Project; command: (type: string, extra?: Partial<Command>) => void; busy: boolean }) {
  const [picker, setPicker] = useState(false);
  const [quick, setQuick] = useState({ name: '', hp: 10, ac: 12 });
  const combat = project.combat!;
  const free = project.characters.filter(item => !combat.participants.some(p => p.characterId === item.id));
  // d20 + the statblock's initiative for every enemy still at 0; heroes roll at the table and the master types their result.
  const unrolled = combat.participants.filter(item => item.side === 'enemy' && item.initiative === 0);
  const rollEnemies = () => { for (const item of unrolled) { const own = project.monsters.find(m => m.id === item.source); const bonus = own ? own.initiative ?? Math.floor(((own.abilities.dex ?? 10) - 10) / 2) : 0; command('combat.update', { participantId: item.id, participant: { initiative: 1 + Math.floor(Math.random() * 20) + bonus } }); } };
  const toggle = (item: Participant, key: 'visible' | 'hideHp' | 'hideAc') => command('combat.update', { participantId: item.id, participant: { [key]: !item[key] } });
  return <section className="editor-card initiative-table">
    <div className="section-heading"><h2>Очерёдность</h2><div className="initiative-add">
      <select aria-label="Добавить героя" disabled={busy || !free.length} value="" onChange={e => e.target.value && command('combat.add', { characterId: e.target.value })}><option value="">＋ Герой</option>{free.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <button type="button" disabled={busy || !unrolled.length} title="d20 + бонус инициативы из статблока для врагов с инициативой 0" onClick={rollEnemies}>d20 врагам</button>
      <button type="button" disabled={busy} onClick={() => setPicker(true)}>＋ Враг</button>
    </div></div>
    {!combat.participants.length && <p className="ui-empty">Добавьте героев и противников.</p>}
    <div className="initiative-rows">{[...combat.participants].sort((a, b) => b.initiative - a.initiative || a.id.localeCompare(b.id)).map(item => { const stats = participantStats(project, item); const portrait = item.characterId ? project.characters.find(c => c.id === item.characterId)?.image : item.portrait?.image; return <div key={item.id} className={['initiative-row', item.side, item.id === combat.activeId ? 'active' : '', item.visible ? '' : 'hidden', stats.hp === 0 ? 'down' : ''].filter(Boolean).join(' ')}>
      <input className="initiative-value" aria-label={`Инициатива: ${item.name}`} type="number" min="-1000" max="1000" disabled={busy} key={`${item.id}-${item.initiative}`} defaultValue={item.initiative} onFocus={e => e.target.select()} onBlur={e => { const initiative = Number(e.target.value); if (e.target.value !== '' && Number.isSafeInteger(initiative) && initiative !== item.initiative) command('combat.update', { participantId: item.id, participant: { initiative } }); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}/>
      <button type="button" className="initiative-name" disabled={busy} title="Передать ход" onClick={() => command('combat.active', { participantId: item.id })}>
        {portrait ? <img src={portrait} alt=""/> : <span className="monster-initial" aria-hidden="true">{item.name.slice(0, 1)}</span>}
        <span><strong>{item.name}</strong><small><Icon name="heart" size={11}/>{stats.hp}/{stats.maxHp} <Icon name="shield" size={11}/>{stats.ac}</small></span>
      </button>
      <input className="initiative-statuses" aria-label={`Состояния: ${item.name}`} disabled={busy} key={`${item.id}-${item.statuses.join(',')}`} defaultValue={item.statuses.join(', ')} placeholder="Состояния" onBlur={e => { const statuses = e.target.value.split(',').map(v => v.trim()).filter(Boolean); if (JSON.stringify(statuses) !== JSON.stringify(item.statuses)) command('combat.update', { participantId: item.id, participant: { statuses } }); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}/>
      <div className="initiative-tools">
        <button type="button" className="ui-icon-button" aria-pressed={item.visible} aria-label={`${item.visible ? 'Скрыть' : 'Показать'} карту: ${item.name}`} title={item.visible ? 'Карта на столе — скрыть' : 'Карта скрыта — показать'} disabled={busy} onClick={() => toggle(item, 'visible')}><Icon name={item.visible ? 'eye' : 'eyeOff'} size={15}/></button>
        <button type="button" className={item.hideHp ? 'ui-icon-button muted' : 'ui-icon-button'} aria-pressed={!item.hideHp} aria-label={`${item.hideHp ? 'Показать' : 'Скрыть'} ХП: ${item.name}`} title={item.hideHp ? 'ХП скрыты от игроков' : 'ХП видны игрокам'} disabled={busy} onClick={() => toggle(item, 'hideHp')}><Icon name="heart" size={14}/></button>
        <button type="button" className={item.hideAc ? 'ui-icon-button muted' : 'ui-icon-button'} aria-pressed={!item.hideAc} aria-label={`${item.hideAc ? 'Показать' : 'Скрыть'} КД: ${item.name}`} title={item.hideAc ? 'КД скрыт от игроков' : 'КД виден игрокам'} disabled={busy} onClick={() => toggle(item, 'hideAc')}><Icon name="shield" size={14}/></button>
        <StatBlockButton project={project} source={item.source}/>
        {item.side === 'enemy' && <LootButton project={project} participant={item} command={command} busy={busy}/>}
        <button type="button" className="ui-icon-button" aria-label={`Убрать ${item.name}`} title={combat.running ? 'Завершите бой, чтобы убирать участников' : 'Убрать'} disabled={busy || combat.running} onClick={() => command('combat.remove', { participantId: item.id })}><Icon name="trash" size={14}/></button>
      </div>
    </div>; })}</div>
    <form className="initiative-quick" onSubmit={e => { e.preventDefault(); if (quick.name.trim()) { command('combat.add', { participant: { name: quick.name.trim(), maxHp: Math.max(1, quick.hp), ac: Math.max(0, quick.ac) } }); setQuick({ ...quick, name: '' }); } }}>
      <input aria-label="Имя противника" placeholder="Быстрый враг без статблока" value={quick.name} maxLength={100} onChange={e => setQuick({ ...quick, name: e.target.value })}/>
      <input aria-label="ХП противника" title="ХП" type="number" min={1} max={1000000} value={quick.hp} onChange={e => setQuick({ ...quick, hp: Number(e.target.value) })}/>
      <input aria-label="КД противника" title="КД" type="number" min={0} max={1000} value={quick.ac} onChange={e => setQuick({ ...quick, ac: Number(e.target.value) })}/>
      <button type="submit" disabled={busy || !quick.name.trim()}>＋</button>
    </form>
    {picker && <BestiaryPicker project={project} command={command} busy={busy} onClose={() => setPicker(false)}/>}
  </section>;
}
export function CombatEditor({ project, liveId, command, busy, onBackground }: { project: Project; liveId: string | null; command: (type: string, extra?: Partial<Command>) => void; busy: boolean; onBackground: () => void }) {
  const combat = project.combat;
  const active = combat?.participants.find(item => item.id === combat.activeId);
  return <div className="combat-editor">
    {combat && <section className="editor-card combat-bar">
      <div className="combat-bar-title"><h2>{combat.name}</h2><span>{combat.running ? `Раунд ${combat.round} · ход: ${active?.name || '—'}${liveId === project.id ? '' : ' · эфир на другом проекте'}` : combat.events.some(event => event.label === 'Бой завершён') ? 'Бой завершён' : 'Расставьте инициативу и начните бой'}</span></div>
      <div className="combat-bar-actions">
        <label className="check-label combat-approval" title="Урон и лечение от игроков ждут вашего подтверждения"><input type="checkbox" checked={combat.approval} disabled={busy} onChange={e => command('combat.mode', { approval: e.target.checked })}/>Подтверждать действия игроков</label>
        <button type="button" className="ui-icon-button" aria-label="Отменить последнее изменение ХП" title="Отменить последнее изменение ХП" disabled={busy || !combat.history.length} onClick={() => command('combat.undo')}><Icon name="undo" size={16}/></button>
        <ScreenButton project={project} command={command} busy={busy} onBackground={onBackground}/>
        {combat.running && <button type="button" disabled={busy} onClick={() => command('combat.stop')}>Завершить бой</button>}
        {combat.running ? <button type="button" className="primary" disabled={busy} onClick={() => command('combat.next')}>Следующий ход →</button> : <button type="button" className="primary" disabled={busy || !combat.participants.length} onClick={() => command('combat.start')}>Начать бой</button>}
      </div>
    </section>}
    {combat && combat.pending.length > 0 && <section className="editor-card"><h2>Ожидают подтверждения</h2>{combat.pending.map(request => <div className="pending-action" key={request.id}><p>{combat.participants.find(p => p.id === request.sourceId)?.name} → {combat.participants.find(p => p.id === request.targetId)?.name}: {request.kind === 'damage' ? 'урон' : 'лечение'} {request.amount}</p><div className="action-row"><button disabled={busy} onClick={() => command('combat.approve', { requestId: request.id })}>Подтвердить</button><button disabled={busy} onClick={() => command('combat.reject', { requestId: request.id })}>Отклонить</button></div></div>)}</section>}
    {combat && <div className="combat-board">
      <InitiativeTable project={project} command={command} busy={busy}/>
      <div className="combat-side">
        <MasterCombat project={project} busy={busy} command={command}/>
        <MasterLoot project={project} command={command} busy={busy}/>
        <section className="editor-card combat-journal"><h2>Журнал боя</h2>{combat.events.length === 0 ? <p className="ui-note small">Действий ещё нет.</p> : <ol className="combat-log">{combat.events.slice(-30).reverse().map(event => <li key={event.id}>{event.label}</li>)}</ol>}</section>
      </div>
    </div>}
    <EncounterPlans project={project} command={command} busy={busy}/>
    {project.encounters.length > 0 && <section className="editor-card"><h2>Отложенные бои</h2><p className="ui-note small">Сюда уходит текущий бой, когда вы начинаете другой.</p>{project.encounters.map(item => <div className="pending-action" key={item.id}><p>{item.name} · раунд {item.round} · {item.participants.length} участников</p><div className="action-row"><button disabled={busy || combat?.running} onClick={() => command('combat.load', { encounterId: item.id })}>Вернуться к бою</button><button disabled={busy} onClick={() => command('combat.archive.delete', { encounterId: item.id })}>Удалить</button></div></div>)}</section>}
  </div>;
}
