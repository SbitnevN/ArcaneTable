import React, { useState } from 'react';
import { newId, type Command, type EncounterPlan, type PlanEnemy, type Project } from './contracts';
import { BestiaryPicker } from './bestiary';
import { planDifficulty } from './difficulty';
import { LootEditor } from './loot';
import { Field, Modal, Section, confirmAction } from './ui';
import { Icon } from './icons';

type Run = (type: string, extra?: Partial<Command>) => void;
const onTable = (project: Project) => project.characters.filter(item => !item.offstage).map(item => item.id);
const enemyPortrait = (project: Project, enemy: PlanEnemy) => project.monsters.find(item => item.id === enemy.monsterId)?.portrait?.image;
const enemyCount = (plan: EncounterPlan) => plan.enemies.reduce((sum, enemy) => sum + enemy.count, 0);

function DifficultyPill({ project, plan, heroes }: { project: Project; plan: EncounterPlan; heroes: string[] }) {
  const value = planDifficulty(project, plan, heroes);
  if (!value) return null;
  return <span className={`difficulty-pill level-${value.level}`} title={`Опыт врагов ${value.xp}, с поправкой на число ${value.adjusted}; героев ${value.heroes}${value.unknown ? `; без опасности: ${value.unknown}` : ''}`}>{value.label}</span>;
}

// Enemy list editor shared by the prep form: bestiary picks, a quick enemy without a statblock, count and loot per row.
function EnemyRows({ project, command, busy, enemies, onChange }: { project: Project; command: Run; busy: boolean; enemies: PlanEnemy[]; onChange: (enemies: PlanEnemy[]) => void }) {
  const [picker, setPicker] = useState(false);
  const [quick, setQuick] = useState({ name: '', hp: 10, ac: 12 });
  const set = (id: string, patch: Partial<PlanEnemy>) => onChange(enemies.map(row => row.id === id ? { ...row, ...patch } : row));
  return <Section title="Противники" aside={<button type="button" className="ui-button small primary" onClick={() => setPicker(true)}>＋ Из бестиария</button>}>
    {enemies.length === 0 ? <p className="ui-empty">Добавьте противников из классического или мастерского бестиария.</p> :
      <div className="wizard-enemies">{enemies.map(row => { const portrait = enemyPortrait(project, row); return <div key={row.id} className="wizard-enemy">
        <div className="wizard-enemy-head">
          {portrait ? <img src={portrait} alt=""/> : <span className="monster-initial">{row.name.slice(0, 1)}</span>}
          <span className="wizard-enemy-name"><strong>{row.name}</strong><small><Icon name="heart" size={11}/>{row.hp} <Icon name="shield" size={11}/>{row.ac}{row.cr ? ` · CR ${row.cr}` : ''}{row.source ? ' · SRD' : row.monsterId ? ' · мастерский' : ''}</small></span>
          <label className="count-field">×<input type="number" min={1} max={10} value={row.count} onChange={e => set(row.id, { count: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })}/></label>
          <button type="button" className="ui-icon-button" aria-label={`Убрать ${row.name}`} onClick={() => onChange(enemies.filter(item => item.id !== row.id))}><Icon name="trash" size={15}/></button>
        </div>
        <div className="wizard-enemy-loot"><span className="ui-label">Лут {row.count > 1 ? '(у каждого)' : ''}</span><LootEditor project={project} value={row.loot} busy={busy} onChange={loot => set(row.id, { loot })}/></div>
      </div>; })}</div>}
    <form className="wizard-quick" onSubmit={e => { e.preventDefault(); if (quick.name.trim()) { onChange([...enemies, { id: newId(), name: quick.name.trim().slice(0, 100), hp: Math.max(1, quick.hp), ac: Math.max(0, quick.ac), count: 1, loot: [] }]); setQuick({ ...quick, name: '' }); } }}>
      <span className="ui-label">Быстро, без статблока</span>
      <input aria-label="Имя противника" placeholder="Имя" value={quick.name} maxLength={100} onChange={e => setQuick({ ...quick, name: e.target.value })}/>
      <input aria-label="ХП противника" type="number" min={1} max={1000000} value={quick.hp} onChange={e => setQuick({ ...quick, hp: Number(e.target.value) })}/>
      <input aria-label="КД противника" type="number" min={0} max={1000} value={quick.ac} onChange={e => setQuick({ ...quick, ac: Number(e.target.value) })}/>
      <button type="submit" className="ui-button small" disabled={!quick.name.trim()}>＋</button>
    </form>
    {picker && <BestiaryPicker project={project} command={command} busy={busy} onClose={() => setPicker(false)} onPick={choice => onChange([...enemies, { id: newId(), name: choice.name, hp: choice.hp, ac: choice.ac, count: choice.count, loot: choice.loot, ...(choice.monsterId ? { monsterId: choice.monsterId } : {}), ...(choice.source ? { source: choice.source } : {}), ...(choice.cr ? { cr: choice.cr } : {}) }])}/>}
  </Section>;
}

function PlanEditor({ project, command, busy, plan, onClose }: { project: Project; command: Run; busy: boolean; plan: EncounterPlan; onClose: () => void }) {
  const [draft, setDraft] = useState(plan);
  const [error, setError] = useState('');
  const total = enemyCount(draft);
  function save() {
    if (!draft.name.trim()) { setError('Введите название'); return; }
    if (total > 30) { setError('Противников может быть не больше 30'); return; }
    command('plan.save', { plan: { ...draft, name: draft.name.trim() } }); onClose();
  }
  return <Modal wide title={project.plans?.some(item => item.id === plan.id) ? 'Заготовка столкновения' : 'Новая заготовка'} subtitle={`Противников: ${total}`} onClose={onClose}
    footer={<><DifficultyPill project={project} plan={draft} heroes={onTable(project)}/><span className="spacer"/>{error && <span className="ui-error" role="alert">{error}</span>}<button type="button" onClick={onClose}>Отмена</button><button type="button" className="primary" disabled={busy} onClick={save}>Сохранить</button></>}>
    <div className="plan-fields">
      <Field label="Название"><input autoFocus aria-label="Название заготовки" value={draft.name} maxLength={100} placeholder="Например, Драка в бараке" onChange={e => { setDraft({ ...draft, name: e.target.value }); setError(''); }}/></Field>
      <Field label="Фон стола"><select aria-label="Фон заготовки" value={draft.sceneId || ''} onChange={e => setDraft({ ...draft, sceneId: e.target.value || null })}><option value="">Не менять</option>{project.scenes.map(scene => <option key={scene.id} value={scene.id}>{scene.name}</option>)}</select></Field>
      <Field label="Заметка" wide><textarea aria-label="Заметка к заготовке" rows={2} maxLength={5000} value={draft.note} placeholder="Где, почему дерутся, тактика врагов" onChange={e => setDraft({ ...draft, note: e.target.value })}/></Field>
    </div>
    <EnemyRows project={project} command={command} busy={busy} enemies={draft.enemies} onChange={enemies => setDraft({ ...draft, enemies })}/>
  </Modal>;
}

// «Начать»: the only question left at the table is who takes part.
function PlanStart({ project, command, busy, plan, onClose }: { project: Project; command: Run; busy: boolean; plan: EncounterPlan; onClose: () => void }) {
  const [heroes, setHeroes] = useState(onTable(project));
  const total = heroes.length + enemyCount(plan);
  const replaces = project.combat && !project.combat.running ? project.combat.name : '';
  return <Modal wide title={`Начать «${plan.name}»`} subtitle={`Участников: ${total} из 30`} onClose={onClose}
    footer={<><DifficultyPill project={project} plan={plan} heroes={heroes}/><span className="spacer"/>{replaces && <span className="ui-note small">«{replaces}» уйдёт в отложенные</span>}<button type="button" onClick={onClose}>Отмена</button><button type="button" className="primary" disabled={busy || total > 30 || project.combat?.running} onClick={() => { command('plan.start', { planId: plan.id, heroes }); onClose(); }}>Начать</button></>}>
    <Section title="Герои" aside={<button type="button" className="ui-button small" onClick={() => setHeroes(heroes.length === project.characters.length ? [] : project.characters.map(item => item.id))}>{heroes.length === project.characters.length ? 'Снять всех' : 'Выбрать всех'}</button>}>
      <div className="wizard-heroes">{project.characters.map(hero => { const on = heroes.includes(hero.id); const game = project.games[hero.id]; return <button type="button" key={hero.id} aria-pressed={on} className={on ? 'wizard-hero active' : 'wizard-hero'} onClick={() => setHeroes(on ? heroes.filter(id => id !== hero.id) : [...heroes, hero.id])}>
        <img src={hero.image} alt=""/><span><strong>{hero.name}</strong><small>{game?.level ? `${game.level} ур. · ` : ''}<Icon name="heart" size={11}/>{game?.hp}/{game?.maxHp} <Icon name="shield" size={11}/>{game?.ac}</small></span><i className="wizard-check" aria-hidden="true">{on ? '✓' : ''}</i>
      </button>; })}</div>
    </Section>
    {plan.note && <p className="plan-note">{plan.note}</p>}
  </Modal>;
}

export function EncounterPlans({ project, command, busy }: { project: Project; command: Run; busy: boolean }) {
  const [editing, setEditing] = useState<EncounterPlan | null>(null);
  const [starting, setStarting] = useState<EncounterPlan | null>(null);
  const plans = project.plans || [];
  const running = Boolean(project.combat?.running);
  const blank = (): EncounterPlan => ({ id: newId(), name: '', note: '', sceneId: null, enemies: [] });
  return <section className="editor-card encounter-plans">
    <div className="section-heading"><h2>Заготовки столкновений</h2><button type="button" className="primary" disabled={busy} onClick={() => setEditing(blank())}>＋ Новая заготовка</button></div>
    {plans.length === 0 ? <p className="ui-empty">Соберите врагов заранее: название, противники, лут и фон. Героев выберете, когда начнёте бой.</p> :
      <div className="plan-grid">{plans.map(plan => { const scene = project.scenes.find(item => item.id === plan.sceneId); return <article key={plan.id} className="plan-card">
        <div className="plan-head"><h3>{plan.name}</h3><DifficultyPill project={project} plan={plan} heroes={onTable(project)}/></div>
        {(scene || plan.note) && <p className="plan-meta">{scene ? `Фон: ${scene.name}` : ''}{scene && plan.note ? ' · ' : ''}{plan.note}</p>}
        <div className="plan-enemies">{plan.enemies.length ? plan.enemies.map(enemy => { const portrait = enemyPortrait(project, enemy); return <span key={enemy.id} className="plan-enemy" title={`${enemy.name}: ХП ${enemy.hp}, КД ${enemy.ac}`}>
          {portrait ? <img src={portrait} alt=""/> : <span className="monster-initial" aria-hidden="true">{enemy.name.slice(0, 1)}</span>}<small>{enemy.name}{enemy.count > 1 ? ` ×${enemy.count}` : ''}</small>
        </span>; }) : <span className="ui-note small">Противников пока нет</span>}</div>
        <div className="plan-foot">
          <button type="button" className="primary" disabled={busy || running || !plan.enemies.length} title={running ? 'Сначала завершите текущий бой' : ''} onClick={() => setStarting(plan)}><Icon name="play" size={13}/> Начать</button>
          <span className="spacer"/>
          <button type="button" className="ui-icon-button" aria-label={`Изменить «${plan.name}»`} title="Изменить" onClick={() => setEditing(plan)}><Icon name="edit" size={15}/></button>
          <button type="button" className="ui-icon-button" aria-label={`Копия «${plan.name}»`} title="Копия" disabled={busy} onClick={() => command('plan.save', { plan: { ...structuredClone(plan), id: newId(), name: `${plan.name.slice(0, 90)} — копия` } })}><Icon name="copy" size={15}/></button>
          <button type="button" className="ui-icon-button" aria-label={`Удалить «${plan.name}»`} title="Удалить" disabled={busy} onClick={() => { if (confirmAction(`Удалить заготовку «${plan.name}»?`)) command('plan.delete', { planId: plan.id }); }}><Icon name="trash" size={15}/></button>
        </div>
      </article>; })}</div>}
    {editing && <PlanEditor project={project} command={command} busy={busy} plan={editing} onClose={() => setEditing(null)}/>}
    {starting && <PlanStart project={project} command={command} busy={busy} plan={starting} onClose={() => setStarting(null)}/>}
  </section>;
}
