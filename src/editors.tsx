import React, { useEffect, useState } from 'react';
import { newId, type Ability, type Action, type DamagePart, type Feature, type Monster, type Project, type Spell, type Weapon } from './contracts';
import { LootEditor } from './loot';
import { abilities, actionKinds, actionSummary, averageDice, blankAction, conditions, damageText, damageTypes, masteries, modifier, schools, signed, sizes, validDice, weaponProperties, crProficiency } from './library';
import { Dropzone, Field, Modal, Section, Segmented, confirmAction } from './ui';
import { SensesEditor, SkillsEditor, TokenPicker, languages, parseSkills, skillBonus } from './stat-pickers';
import { Icon } from './icons';

const num = (value: string, fallback = 0) => { const parsed = Number.parseInt(value, 10); return Number.isFinite(parsed) ? parsed : fallback; };

export function DamageEditor({ value, onChange, label = 'Урон' }: { value: DamagePart[]; onChange: (value: DamagePart[]) => void; label?: string }) {
  const set = (index: number, patch: Partial<DamagePart>) => onChange(value.map((part, i) => i === index ? { ...part, ...patch } : part));
  return <div className="damage-editor">
    <span className="ui-label">{label}</span>
    {value.map((part, index) => { const average = averageDice(part.dice); return <div className="damage-row" key={index}>
      <input aria-label="Кубы урона" className={part.dice && !validDice(part.dice) ? 'invalid' : ''} value={part.dice} placeholder="2d6+3" maxLength={50} onChange={e => set(index, { dice: e.target.value })}/>
      <input aria-label="Тип урона" list="damage-types" value={part.type} placeholder="тип" maxLength={50} onChange={e => set(index, { type: e.target.value })}/>
      <span className="damage-average" title="Среднее значение">{average !== null ? `≈ ${average}` : part.dice ? 'проверьте' : ''}</span>
      <button type="button" className="ui-icon-button" aria-label="Убрать урон" onClick={() => onChange(value.filter((_, i) => i !== index))}>×</button>
    </div>; })}
    {value.length < 10 && <button type="button" className="ui-button small add-row" onClick={() => onChange([...value, { dice: '', type: value[0]?.type || 'рубящий' }])}>＋ {value.length ? 'Дополнительный урон' : 'Добавить урон'}</button>}
    <datalist id="damage-types">{damageTypes.map(type => <option key={type} value={type}/>)}</datalist>
  </div>;
}

export function ChipPicker({ options, value, onChange, label }: { options: string[]; value: string[]; onChange: (value: string[]) => void; label: string }) {
  return <div className="chip-picker"><span className="ui-label">{label}</span><div className="chip-row">{options.map(option => <button type="button" key={option} aria-pressed={value.includes(option)} className={value.includes(option) ? 'chip active' : 'chip'} onClick={() => onChange(value.includes(option) ? value.filter(item => item !== option) : [...value, option])}>{option}</button>)}</div></div>;
}

export function ActionEditor({ action, onChange }: { action: Action; onChange: (action: Action) => void }) {
  const set = (patch: Partial<Action>) => onChange({ ...action, ...patch });
  const attack = ['melee', 'ranged', 'spell'].includes(action.kind);
  return <div className="action-editor">
    <div className="ui-grid two"><Field label="Название"><input value={action.name} maxLength={200} placeholder="Например, Скимитар" onChange={e => set({ name: e.target.value })}/></Field><Field label="Перезарядка / лимит" hint="Например, 5–6 или 3/день"><input value={action.recharge || ''} maxLength={50} onChange={e => set({ recharge: e.target.value || undefined })}/></Field></div>
    <Segmented label="Тип действия" value={action.kind} options={actionKinds} onChange={kind => set({ kind, ...(kind === 'save' ? { dc: action.dc ?? 13, save: action.save ?? 'dex', onSave: action.onSave ?? 'half' } : {}), ...(['melee', 'ranged', 'spell'].includes(kind) ? { bonus: action.bonus ?? 4 } : {}) })}/>
    <div className="ui-grid auto">
      {attack && <Field label="Бонус атаки"><input type="number" min={-50} max={50} value={action.bonus ?? 0} onChange={e => set({ bonus: num(e.target.value) })}/></Field>}
      {action.kind === 'save' && <><Field label="Спасбросок"><select value={action.save || 'dex'} onChange={e => set({ save: e.target.value as Ability })}>{abilities.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}</select></Field><Field label="Сл"><input type="number" min={0} max={50} value={action.dc ?? 13} onChange={e => set({ dc: num(e.target.value, 13) })}/></Field></>}
      {action.kind !== 'other' && <Field label={action.kind === 'save' ? 'Область' : 'Досягаемость / дистанция'}><input value={action.reach || ''} maxLength={200} placeholder={action.kind === 'ranged' ? 'дистанция 80/320 фт.' : action.kind === 'save' ? 'конус 30 фт.' : 'досягаемость 5 фт.'} onChange={e => set({ reach: e.target.value })}/></Field>}
    </div>
    <DamageEditor value={action.damage} onChange={damage => set({ damage })}/>
    {action.kind === 'save' && action.damage.length > 0 && <Segmented label="При успешном спасброске" value={action.onSave || 'half'} options={[{ value: 'half', label: 'Половина урона' }, { value: 'none', label: 'Без урона' }]} onChange={onSave => set({ onSave })}/>}
    <ChipPicker label="Последствия: состояния цели" options={conditions} value={action.conditions || []} onChange={value => set({ conditions: value })}/>
    <Field label="Описание и последствия" hint="Что происходит при попадании или провале: толчок, захват, длительность эффекта…"><textarea rows={3} value={action.effect} maxLength={20000} onChange={e => set({ effect: e.target.value })}/></Field>
  </div>;
}

export function ActionList({ title, value, onChange, empty, defaultKind = 'melee', extra }: { title: string; value: Action[]; onChange: (value: Action[]) => void; empty: string; defaultKind?: Action['kind']; extra?: React.ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  const move = (index: number, delta: number) => { const next = [...value]; const [item] = next.splice(index, 1); next.splice(index + delta, 0, item); onChange(next); };
  return <Section title={title} aside={<div className="action-row">{extra}<button type="button" className="ui-button small" onClick={() => { const item = blankAction(newId(), defaultKind); onChange([...value, item]); setOpen(item.id); }}>＋ Добавить</button></div>}>
    {value.length === 0 ? <p className="ui-empty">{empty}</p> : <div className="action-cards">{value.map((action, index) => <div key={action.id} className={open === action.id ? 'action-card open' : 'action-card'}>
      <div className="action-card-head">
        <button type="button" className="action-card-toggle" aria-expanded={open === action.id} onClick={() => setOpen(open === action.id ? null : action.id)}><strong>{action.name || 'Без названия'}{action.recharge ? ` (${action.recharge})` : ''}</strong><small>{actionSummary(action) || 'Особое действие'}</small></button>
        <button type="button" className="ui-icon-button" aria-label="Выше" disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
        <button type="button" className="ui-icon-button" aria-label="Ниже" disabled={index === value.length - 1} onClick={() => move(index, 1)}>↓</button>
        <button type="button" className="ui-icon-button" aria-label={`Удалить ${action.name}`} onClick={() => { if (!action.name || confirmAction(`Удалить «${action.name}»?`)) onChange(value.filter(item => item.id !== action.id)); }}>×</button>
      </div>
      {open === action.id && <ActionEditor action={action} onChange={next => onChange(value.map(item => item.id === action.id ? next : item))}/>}
    </div>)}</div>}
  </Section>;
}

export function FeatureList({ title, value, onChange, empty }: { title: string; value: Feature[]; onChange: (value: Feature[]) => void; empty: string }) {
  const set = (id: string, patch: Partial<Feature>) => onChange(value.map(item => item.id === id ? { ...item, ...patch } : item));
  // Long lists stay readable: only the opened features show their text; a new one opens right away.
  const [open, setOpen] = useState<string[]>([]);
  const toggle = (id: string) => setOpen(list => list.includes(id) ? list.filter(item => item !== id) : [...list, id]);
  function add() { const id = newId(); onChange([...value, { id, name: '', text: '' }]); setOpen(list => [...list, id]); }
  return <Section title={title} aside={<button type="button" className="ui-button small" onClick={add}>＋ Добавить</button>}>
    {value.length === 0 ? <p className="ui-empty">{empty}</p> : <div className="feature-list">{value.map(feature => { const expanded = open.includes(feature.id); return <div key={feature.id} className={expanded ? 'feature-row open' : 'feature-row'}>
      <button type="button" className="feature-toggle" aria-expanded={expanded} aria-label={expanded ? 'Свернуть описание' : 'Развернуть описание'} onClick={() => toggle(feature.id)}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5"/></svg></button>
      <input aria-label="Название черты" value={feature.name} maxLength={200} placeholder="Название, например «Тактика стаи»" onChange={e => set(feature.id, { name: e.target.value })}/>
      <button type="button" className="ui-icon-button" aria-label="Удалить черту" onClick={() => { if (!feature.name || confirmAction(`Удалить «${feature.name}»?`)) onChange(value.filter(item => item.id !== feature.id)); }}>×</button>
      {expanded && <textarea aria-label="Описание черты" rows={2} value={feature.text} maxLength={20000} placeholder="Описание" onChange={e => set(feature.id, { text: e.target.value })}/>}
    </div>; })}</div>}
  </Section>;
}

export function AbilityGrid({ value, onChange, saves, onSaves, saveBonus }: { value: Record<string, number>; onChange: (value: Record<string, number>) => void; saves?: Ability[]; onSaves?: (value: Ability[]) => void; saveBonus?: number }) {
  return <div className="ability-grid">{abilities.map(ability => { const score = value[ability.key] ?? 10; const mod = modifier(score); return <div className="ability-box" key={ability.key}>
    <span className="ability-short" title={ability.label}>{ability.short}</span>
    <input aria-label={ability.label} type="number" min={1} max={30} value={score} onChange={e => { const next = num(e.target.value, score); if (next >= 1 && next <= 30) onChange({ ...value, [ability.key]: next }); }}/>
    <span className="ability-mod">{signed(mod)}</span>
    {onSaves && <label className="ability-save" title="Владение спасброском"><input type="checkbox" checked={saves?.includes(ability.key) || false} onChange={() => onSaves(saves?.includes(ability.key) ? saves.filter(item => item !== ability.key) : [...(saves || []), ability.key])}/>спас {signed(mod + (saves?.includes(ability.key) ? saveBonus || 0 : 0))}</label>}
  </div>; })}</div>;
}

// ---- Monster ----
const crList = ['0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, i) => String(i + 1))];
const xpByCr: Record<string, number> = { '0': 10, '1/8': 25, '1/4': 50, '1/2': 100, '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800, '6': 2300, '7': 2900, '8': 3900, '9': 5000, '10': 5900, '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000, '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000, '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000, '26': 90000, '27': 105000, '28': 120000, '29': 135000, '30': 155000 };
export function composeType(m: Monster) { return [m.size, m.creature].filter(Boolean).join(' ') + (m.alignment ? `, ${m.alignment}` : ''); }

export function MonsterEditor({ monster, onSave, onClose, busy, title, project }: { monster: Monster; onSave: (monster: Monster, card?: File) => void; onClose: () => void; busy: boolean; title?: string; project?: Project }) {
  const [card, setCard] = useState<{ file: File; url: string } | null>(null);
  const [cardError, setCardError] = useState('');
  useEffect(() => () => { if (card) URL.revokeObjectURL(card.url); }, [card]);
  const [draft, setDraft] = useState<Monster>(() => ({ traits: [], actions: [], bonusActions: [], reactions: [], legendary: [], ...structuredClone(monster) }));
  const [tab, setTab] = useState<'main' | 'stats' | 'actions' | 'notes'>('main');
  const [error, setError] = useState('');
  const set = (patch: Partial<Monster>) => setDraft(current => ({ ...current, ...patch }));
  const pb = crProficiency(draft.cr);
  const scores = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...draft.abilities };
  const passive = 10 + skillBonus('perception', parseSkills(draft.skills || '', scores, pb).profs, scores, pb);
  function chooseCard(file: File) {
    if (!/\.(png|jpe?g|webp)$/i.test(file.name)) { setCardError('Нужен PNG, JPEG или WebP'); return; }
    if (file.size > 25 * 1024 * 1024) { setCardError('Файл больше 25 МБ'); return; }
    setCardError(''); setCard({ file, url: URL.createObjectURL(file) });
  }
  function save() {
    if (!draft.name.trim()) { setError('Введите название'); setTab('main'); return; }
    if (!Number.isSafeInteger(draft.hp) || draft.hp < 1) { setError('ХП должно быть не меньше 1'); setTab('main'); return; }
    const bad = [...(draft.actions || []), ...(draft.bonusActions || []), ...(draft.reactions || []), ...(draft.legendary || [])].find(action => action.damage.some(part => part.dice && !validDice(part.dice)));
    if (bad) { setError(`Проверьте кубы урона в «${bad.name || 'без названия'}»`); setTab('actions'); return; }
    const clean = (list?: Action[]) => (list || []).map(action => ({ ...action, name: action.name.trim() || 'Действие', damage: action.damage.filter(part => part.dice.trim()) }));
    onSave({ ...draft, name: draft.name.trim(), type: composeType(draft) || draft.type, traits: (draft.traits || []).filter(item => item.name.trim() || item.text.trim()), actions: clean(draft.actions), bonusActions: clean(draft.bonusActions), reactions: clean(draft.reactions), legendary: clean(draft.legendary) }, card?.file);
  }
  return <Modal wide title={title || (draft.name ? draft.name : 'Новый монстр')} subtitle={`${composeType(draft) || 'Тип не указан'} · Опасность ${draft.cr || '—'}`} onClose={onClose}
    footer={<><span className="spacer"/>{error && <span className="ui-error" role="alert">{error}</span>}<button type="button" onClick={onClose}>Отмена</button><button type="button" className="primary" disabled={busy} onClick={save}>Сохранить в бестиарий</button></>}>
    <Segmented label="Разделы монстра" value={tab} onChange={setTab} options={[{ value: 'main', label: 'Основное' }, { value: 'stats', label: 'Характеристики' }, { value: 'actions', label: 'Действия' }, { value: 'notes', label: 'Описание' }]}/>
    {tab === 'main' && <div className="monster-main">
      <div className="monster-card-column">
        <Dropzone accept="image/png,image/jpeg,image/webp" onFile={chooseCard}>
          <div className="monster-card-preview">{card || draft.portrait ? <img src={card?.url || draft.portrait!.image} alt=""/> : <span className="monster-card-empty"><b>{draft.name.slice(0, 1) || '?'}</b>Карта врага</span>}<span className="monster-card-hint">{card ? card.file.name : draft.portrait ? 'Заменить карту' : 'Перетащите или нажмите'}</span></div>
        </Dropzone>
        {cardError && <p className="ui-error">{cardError}</p>}
        <p className="ui-note small">Вертикальная картинка 2:3 — так она выглядит на столе.</p>
      </div>
      <div className="monster-main-fields">
      <Section title="Кто это">
        <Field label="Название"><input autoFocus value={draft.name} maxLength={100} onChange={e => set({ name: e.target.value })}/></Field>
        <div className="ui-grid three"><Field label="Размер"><select value={draft.size || ''} onChange={e => set({ size: e.target.value })}><option value="">—</option>{sizes.map(size => <option key={size}>{size}</option>)}</select></Field><Field label="Тип существа"><input value={draft.creature || ''} maxLength={200} placeholder="гуманоид (гоблиноид)" onChange={e => set({ creature: e.target.value })}/></Field><Field label="Мировоззрение"><input value={draft.alignment || ''} maxLength={200} placeholder="нейтрально-злой" onChange={e => set({ alignment: e.target.value })}/></Field></div>
      </Section>
      <Section title="Боевые показатели">
        <div className="stat-tiles">
          <Field label="Хиты"><input type="number" min={1} max={1000000} value={draft.hp} onChange={e => set({ hp: num(e.target.value, 1) })}/></Field>
          <Field label="Кости хитов" hint={draft.hpDice && averageDice(draft.hpDice) !== null ? `в среднем ${averageDice(draft.hpDice)}` : 'например 2d8+2'}><div className="input-with-button"><input value={draft.hpDice || ''} maxLength={50} onChange={e => set({ hpDice: e.target.value })}/>{draft.hpDice && averageDice(draft.hpDice) !== null && <button type="button" className="ui-button small" onClick={() => set({ hp: Math.max(1, averageDice(draft.hpDice!)!) })} title="Взять среднее">=</button>}</div></Field>
          <Field label="КД"><input type="number" min={0} max={1000} value={draft.ac} onChange={e => set({ ac: num(e.target.value, 10) })}/></Field>
          <Field label="Источник КД"><input value={draft.acNote || ''} maxLength={200} placeholder="природный доспех" onChange={e => set({ acNote: e.target.value })}/></Field>
          <Field label="Инициатива"><input type="number" min={-50} max={50} value={draft.initiative ?? modifier(draft.abilities.dex ?? 10)} onChange={e => set({ initiative: num(e.target.value) })}/></Field>
          <Field label="Скорость"><input value={draft.speed} maxLength={500} placeholder="30 фт., лазая 30 фт." onChange={e => set({ speed: e.target.value })}/></Field>
          <Field label="Опасность (CR)"><select value={draft.cr} onChange={e => set({ cr: e.target.value, xp: xpByCr[e.target.value] ?? draft.xp })}><option value="">—</option>{crList.map(cr => <option key={cr}>{cr}</option>)}{draft.cr && !crList.includes(draft.cr) && <option>{draft.cr}</option>}</select></Field>
          <Field label="Опыт"><input type="number" min={0} max={1000000} value={draft.xp ?? xpByCr[draft.cr] ?? 0} onChange={e => set({ xp: num(e.target.value) })}/></Field>
        </div>
      </Section>
      </div>
    </div>}
    {tab === 'stats' && <>
      <Section title={`Характеристики · бонус мастерства ${signed(pb)}`}>
        <AbilityGrid value={draft.abilities} onChange={value => set({ abilities: value })} saves={Object.keys(draft.saves || {}) as Ability[]} saveBonus={pb} onSaves={keys => set({ saves: Object.fromEntries(keys.map(key => [key, modifier(draft.abilities[key] ?? 10) + pb])) })}/>
      </Section>
      <Section title="Навыки"><SkillsEditor value={draft.skills || ''} scores={scores} pb={pb} onChange={value => set({ skills: value })}/></Section>
      <Section title="Чувства"><SensesEditor value={draft.senses || ''} passive={passive} onChange={value => set({ senses: value })}/></Section>
      <Section title="Урон и состояния">
        <TokenPicker label="Сопротивления" value={draft.resistances || ''} options={damageTypes} onChange={value => set({ resistances: value })}/>
        <TokenPicker label="Иммунитет к урону" value={draft.immunities || ''} options={damageTypes} onChange={value => set({ immunities: value })}/>
        <TokenPicker label="Уязвимости" value={draft.vulnerabilities || ''} options={damageTypes} onChange={value => set({ vulnerabilities: value })}/>
        <TokenPicker label="Иммунитет к состояниям" value={draft.conditionImmunities || ''} options={conditions} onChange={value => set({ conditionImmunities: value })}/>
      </Section>
      <Section title="Языки"><TokenPicker label="Знает языки" value={draft.languages || ''} options={languages} onChange={value => set({ languages: value })} placeholder="Например, телепатия 60 фт."/></Section>
      <FeatureList title="Особенности" value={draft.traits || []} onChange={traits => set({ traits })} empty="Пассивные способности: «Тактика стаи», «Чувствительность к солнцу»…"/>
    </>}
    {tab === 'actions' && <>
      <ActionList title="Действия" value={draft.actions || []} onChange={actions => set({ actions })} empty="Атаки и способности, которые монстр использует действием."/>
      <ActionList title="Бонусные действия" value={draft.bonusActions || []} onChange={bonusActions => set({ bonusActions })} empty="Нет бонусных действий." defaultKind="other"/>
      <ActionList title="Реакции" value={draft.reactions || []} onChange={reactions => set({ reactions })} empty="Нет реакций." defaultKind="other"/>
      <ActionList title="Легендарные действия" value={draft.legendary || []} onChange={legendary => set({ legendary })} empty="Только для легендарных существ." defaultKind="other"/>
    </>}
    {tab === 'notes' && project && <Section title="Лут по умолчанию"><p className="ui-note small">Подставляется каждому экземпляру при добавлении в бой.</p><LootEditor project={project} value={draft.loot || []} busy={busy} onChange={loot => set({ loot: loot.length ? loot : undefined })}/></Section>}
    {tab === 'notes' && <Section title="Описание, тактика и заметки"><Field label="Текст" hint="Видит только мастер"><textarea rows={14} value={draft.description} maxLength={100000} onChange={e => set({ description: e.target.value })}/></Field><Field label="Источник"><input value={draft.source} maxLength={500} onChange={e => set({ source: e.target.value })}/></Field></Section>}
  </Modal>;
}

export function StatBlock({ monster, portrait }: { monster: Monster; portrait?: string }) {
  const actions = (title: string, list?: Action[]) => list?.length ? <div className="sb-section"><h4>{title}</h4>{list.map(action => <p key={action.id}><strong>{action.name}{action.recharge ? ` (${action.recharge})` : ''}.</strong> {actionSummary(action) && <em className="sb-roll">{actionSummary(action)}. </em>}{action.effect}</p>)}</div> : null;
  const line = (label: string, value?: string) => value ? <p><strong>{label}</strong> {value}</p> : null;
  const saves = Object.entries(monster.saves || {}).map(([key, value]) => `${abilities.find(a => a.key === key)?.short} ${signed(value as number)}`).join(', ');
  return <article className="stat-block">
    <header>{portrait && <img src={portrait} alt=""/>}<div><h3>{monster.name}</h3><p>{composeType(monster) || monster.type}</p></div></header>
    <div className="sb-core"><span><b>КД</b> {monster.ac}{monster.acNote ? ` (${monster.acNote})` : ''}</span><span><b>Хиты</b> {monster.hp}{monster.hpDice ? ` (${monster.hpDice})` : ''}</span><span><b>Скорость</b> {monster.speed || '—'}</span>{monster.initiative !== undefined && <span><b>Инициатива</b> {signed(monster.initiative)}</span>}</div>
    <div className="sb-abilities">{abilities.map(a => <div key={a.key}><b>{a.short}</b><span>{monster.abilities[a.key] ?? 10}</span><small>{signed(modifier(monster.abilities[a.key] ?? 10))}</small></div>)}</div>
    <div className="sb-lines">{line('Спасброски', saves)}{line('Навыки', monster.skills)}{line('Уязвимости', monster.vulnerabilities)}{line('Сопротивления', monster.resistances)}{line('Иммунитеты', monster.immunities)}{line('Иммунитет к состояниям', monster.conditionImmunities)}{line('Чувства', monster.senses)}{line('Языки', monster.languages)}<p><strong>Опасность</strong> {monster.cr || '—'}{monster.xp ? ` (${monster.xp} опыта)` : ''}</p></div>
    {monster.traits?.length ? <div className="sb-section">{monster.traits.map(trait => <p key={trait.id}><strong>{trait.name}.</strong> {trait.text}</p>)}</div> : null}
    {actions('Действия', monster.actions)}{actions('Бонусные действия', monster.bonusActions)}{actions('Реакции', monster.reactions)}{actions('Легендарные действия', monster.legendary)}
    {monster.description && <details className="sb-notes"><summary>Описание и заметки</summary><p>{monster.description}</p></details>}
  </article>;
}

// ---- Spell ----
export const spellLevel = (level: number) => level === 0 ? 'Заговор' : `${level} круг`;
export function spellSummary(spell: Spell) {
  const attack = spell.attack === 'save' ? `спасбросок ${abilities.find(a => a.key === spell.save)?.short || ''}` : spell.attack === 'melee' ? 'атака вблизи' : spell.attack === 'ranged' ? 'дальняя атака' : spell.attack === 'auto' ? 'без броска' : '';
  return [attack, damageText(spell.damage) && `урон ${damageText(spell.damage)}${spell.attack === 'save' && spell.onSave === 'half' ? ' (½ при успехе)' : ''}`, spell.heal && `лечение ${spell.heal}`, spell.conditions.length ? spell.conditions.join(', ') : ''].filter(Boolean).join(' · ');
}
export function SpellEditor({ spell, onSave, onClose, busy }: { spell: Spell; onSave: (spell: Spell) => void; onClose: () => void; busy: boolean }) {
  const [draft, setDraft] = useState<Spell>(() => structuredClone(spell));
  const [error, setError] = useState('');
  const set = (patch: Partial<Spell>) => setDraft(current => ({ ...current, ...patch }));
  function save() {
    if (!draft.name.trim()) { setError('Введите название'); return; }
    if (draft.damage.some(part => part.dice && !validDice(part.dice)) || (draft.heal && !validDice(draft.heal))) { setError('Проверьте кубы: формат 2d6+3'); return; }
    onSave({ ...draft, name: draft.name.trim(), damage: draft.damage.filter(part => part.dice.trim()), heal: draft.heal?.trim() || undefined });
  }
  return <Modal wide title={draft.name || 'Новое заклинание'} subtitle={`${spellLevel(draft.level)} · ${draft.school}${draft.concentration ? ' · концентрация' : ''}${draft.ritual ? ' · ритуал' : ''}`} onClose={onClose}
    footer={<><span className="spacer"/>{error && <span className="ui-error" role="alert">{error}</span>}<button type="button" onClick={onClose}>Отмена</button><button type="button" className="primary" disabled={busy} onClick={save}>Сохранить заклинание</button></>}>
    <Section title="Основное">
      <div className="ui-grid three"><Field label="Название"><input autoFocus value={draft.name} maxLength={200} onChange={e => set({ name: e.target.value })}/></Field><Field label="Круг"><select value={draft.level} onChange={e => set({ level: Number(e.target.value) })}>{Array.from({ length: 10 }, (_, i) => <option key={i} value={i}>{spellLevel(i)}</option>)}</select></Field><Field label="Школа"><input list="spell-schools" value={draft.school} maxLength={500} onChange={e => set({ school: e.target.value })}/><datalist id="spell-schools">{schools.map(s => <option key={s} value={s}/>)}</datalist></Field></div>
      <div className="ui-grid three"><Field label="Время накладывания"><input value={draft.castingTime} maxLength={500} onChange={e => set({ castingTime: e.target.value })}/></Field><Field label="Дистанция"><input value={draft.range} maxLength={500} onChange={e => set({ range: e.target.value })}/></Field><Field label="Длительность"><input value={draft.duration} maxLength={500} onChange={e => set({ duration: e.target.value })}/></Field></div>
      <div className="ui-grid three"><Field label="Компоненты"><input value={draft.components} maxLength={500} placeholder="В, С, М (щепотка серы)" onChange={e => set({ components: e.target.value })}/></Field><Field label="Классы"><input value={draft.classes} maxLength={500} placeholder="Волшебник, Чародей" onChange={e => set({ classes: e.target.value })}/></Field><div className="check-stack"><label className="check-line"><input type="checkbox" checked={draft.concentration} onChange={e => set({ concentration: e.target.checked })}/>Концентрация</label><label className="check-line"><input type="checkbox" checked={draft.ritual} onChange={e => set({ ritual: e.target.checked })}/>Ритуал</label></div></div>
    </Section>
    <Section title="Попадание и урон">
      <Segmented label="Как цель защищается" value={draft.attack} onChange={attack => set({ attack })} options={[{ value: 'save', label: 'Спасбросок' }, { value: 'ranged', label: 'Дальняя атака' }, { value: 'melee', label: 'Атака вблизи' }, { value: 'auto', label: 'Без броска' }, { value: 'none', label: 'Не наносит урон' }]}/>
      {draft.attack === 'save' && <div className="ui-grid two"><Field label="Спасбросок"><select value={draft.save || 'dex'} onChange={e => set({ save: e.target.value as Ability })}>{abilities.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}</select></Field><Field label="При успехе"><select value={draft.onSave || 'half'} onChange={e => set({ onSave: e.target.value as Spell['onSave'] })}><option value="half">Половина урона</option><option value="none">Без урона / эффекта</option></select></Field></div>}
      {draft.attack !== 'none' && <DamageEditor value={draft.damage} onChange={damage => set({ damage })}/>}
      <div className="ui-grid two"><Field label="Лечение" hint="Кубы, например 2d8+3"><input className={draft.heal && !validDice(draft.heal) ? 'invalid' : ''} value={draft.heal || ''} maxLength={50} onChange={e => set({ heal: e.target.value })}/></Field><Field label="На больших кругах" hint="Например: +1d6 за каждый круг выше 3"><input value={draft.higher} maxLength={2000} onChange={e => set({ higher: e.target.value })}/></Field></div>
    </Section>
    <Section title="Последствия">
      <ChipPicker label="Состояния цели" options={conditions} value={draft.conditions} onChange={value => set({ conditions: value })}/>
      <Field label="Эффект" hint="Коротко: что происходит с целью, сколько длится, как закончить"><textarea rows={3} value={draft.effect} maxLength={20000} onChange={e => set({ effect: e.target.value })}/></Field>
      <Field label="Полное описание"><textarea rows={6} value={draft.description} maxLength={100000} onChange={e => set({ description: e.target.value })}/></Field>
    </Section>
  </Modal>;
}

// ---- Weapon ----
export function weaponSummary(weapon: Weapon) {
  return [damageText(weapon.damage), weapon.versatile && `универсальное ${weapon.versatile}`, weapon.bonus ? `+${weapon.bonus} магия` : '', weapon.distance, weapon.properties.join(', ')].filter(Boolean).join(' · ');
}
export function WeaponEditor({ weapon, onSave, onClose, busy }: { weapon: Weapon; onSave: (weapon: Weapon) => void; onClose: () => void; busy: boolean }) {
  const [draft, setDraft] = useState<Weapon>(() => structuredClone(weapon));
  const [error, setError] = useState('');
  const set = (patch: Partial<Weapon>) => setDraft(current => ({ ...current, ...patch }));
  function save() {
    if (!draft.name.trim()) { setError('Введите название'); return; }
    if (draft.damage.some(part => part.dice && !validDice(part.dice)) || (draft.versatile && !validDice(draft.versatile))) { setError('Проверьте кубы: формат 1d8 или 2d6+1'); return; }
    onSave({ ...draft, name: draft.name.trim(), damage: draft.damage.filter(part => part.dice.trim()), versatile: draft.properties.includes('универсальное') ? draft.versatile : undefined });
  }
  return <Modal wide title={draft.name || 'Новое оружие'} subtitle={weaponSummary(draft) || 'Оружие'} onClose={onClose}
    footer={<><span className="spacer"/>{error && <span className="ui-error" role="alert">{error}</span>}<button type="button" onClick={onClose}>Отмена</button><button type="button" className="primary" disabled={busy} onClick={save}>Сохранить оружие</button></>}>
    <Section title="Основное">
      <div className="ui-grid two"><Field label="Название"><input autoFocus value={draft.name} maxLength={200} placeholder="Например, Пылающий клинок" onChange={e => set({ name: e.target.value })}/></Field><Field label="Магический бонус" hint="+1, +2, +3 к атаке и урону"><select value={draft.bonus || 0} onChange={e => set({ bonus: Number(e.target.value) || undefined })}>{[0, 1, 2, 3].map(value => <option key={value} value={value}>{value ? `+${value}` : 'нет'}</option>)}</select></Field></div>
      <Segmented label="Категория" value={draft.category} onChange={category => set({ category })} options={[{ value: 'simple', label: 'Простое' }, { value: 'martial', label: 'Воинское' }, { value: 'magic', label: 'Особое / магическое' }]}/>
      <Segmented label="Дистанция" value={draft.range} onChange={range => set({ range })} options={[{ value: 'melee', label: 'Рукопашное', icon: <Icon name="sword" size={14}/> }, { value: 'ranged', label: 'Дальнобойное', icon: <Icon name="bow" size={14}/> }]}/>
    </Section>
    <Section title="Урон">
      <DamageEditor value={draft.damage} onChange={damage => set({ damage })}/>
      <ChipPicker label="Свойства" options={weaponProperties} value={draft.properties} onChange={properties => set({ properties })}/>
      <div className="ui-grid three">
        {draft.properties.includes('универсальное') && <Field label="Урон двумя руками"><input className={draft.versatile && !validDice(draft.versatile) ? 'invalid' : ''} value={draft.versatile || ''} maxLength={50} placeholder="1d10" onChange={e => set({ versatile: e.target.value })}/></Field>}
        {(draft.range === 'ranged' || draft.properties.includes('метательное')) && <Field label="Дистанция"><input value={draft.distance || ''} maxLength={200} placeholder="80/320 фт." onChange={e => set({ distance: e.target.value })}/></Field>}
        <Field label="Приём (2024)"><select value={draft.mastery || ''} onChange={e => set({ mastery: e.target.value || undefined })}>{masteries.map(item => <option key={item} value={item}>{item || 'нет'}</option>)}</select></Field>
      </div>
    </Section>
    <Section title="Последствия и описание">
      <ChipPicker label="Состояния при попадании" options={conditions} value={draft.conditions} onChange={value => set({ conditions: value })}/>
      <Field label="Эффект при попадании" hint="Например: цель сбита с ног, если провалит спасбросок Силы Сл 13"><textarea rows={2} value={draft.effect} maxLength={20000} onChange={e => set({ effect: e.target.value })}/></Field>
      <div className="ui-grid two"><Field label="Вес"><input value={draft.weight || ''} maxLength={200} placeholder="3 фнт." onChange={e => set({ weight: e.target.value })}/></Field><Field label="Цена"><input value={draft.cost || ''} maxLength={200} placeholder="15 зм" onChange={e => set({ cost: e.target.value })}/></Field></div>
      <Field label="Описание"><textarea rows={4} value={draft.description} maxLength={100000} onChange={e => set({ description: e.target.value })}/></Field>
    </Section>
  </Modal>;
}
export function weaponToAction(weapon: Weapon, attackBonus: number, damageBonus: number): Action {
  const add = (dice: string) => { const total = damageBonus + (weapon.bonus || 0); return total ? `${dice}${total > 0 ? '+' : ''}${total}` : dice; };
  return { id: newId(), name: weapon.name, kind: weapon.range === 'ranged' ? 'ranged' : 'melee', bonus: attackBonus + (weapon.bonus || 0), reach: weapon.range === 'ranged' || weapon.distance ? `дистанция ${weapon.distance || ''}`.trim() : 'досягаемость 5 фт.', damage: weapon.damage.map((part, index) => index === 0 ? { ...part, dice: add(part.dice) } : part), conditions: [...weapon.conditions], effect: [weapon.effect, weapon.versatile ? `Двумя руками: ${add(weapon.versatile)}.` : '', weapon.mastery ? `Приём: ${weapon.mastery}.` : ''].filter(Boolean).join(' ') };
}
