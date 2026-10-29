import React, { useEffect, useId, useMemo, useState } from 'react';
import { InventoryGrid } from './inventory';
import type { Ability, EffectStat, Game, Item, Spell, Weapon } from './contracts';
import { ActionList, AbilityGrid, FeatureList, spellSummary, weaponToAction } from './editors';
import { effectGroup, effectSentence, effectText, effectiveStats, inventoryFrom, itemKindLabels, modifier, proficiency, signed, type EffectiveStats } from './library';
import { catalog } from './references';
import { spellLabel, useSpellRu } from './spell-ru';
import { Field, Section, SheetPanel, SheetTabs } from './ui';
import { SkillsEditor } from './stat-pickers';

const num = (value: string, fallback: number) => { const parsed = Number.parseInt(value, 10); return Number.isFinite(parsed) ? parsed : fallback; };

function SpellChips({ label, value, onChange, mine, listId }: { label: string; value: string[]; onChange: (value: string[]) => void; mine: Spell[]; listId: string }) {
  const ruNames = useSpellRu().names;
  const [draft, setDraft] = useState('');
  const list = value.filter(item => item.trim());
  function add() { const name = draft.trim(); if (name && !list.includes(name) && list.length < 1000) onChange([...list, name.slice(0, 500)]); setDraft(''); }
  return <div className="spell-chips"><span className="ui-label">{label} · {list.length}</span>
    <div className="chip-row">{list.map(name => { const own = mine.find(spell => spell.name === name); return <span key={name} className={own ? 'chip spell own' : 'chip spell'} title={own ? spellSummary(own) : name}>{spellLabel(name, ruNames)}<button type="button" aria-label={`Убрать ${name}`} onClick={() => onChange(list.filter(item => item !== name))}>×</button></span>; })}{!list.length && <span className="ui-note small">Пока пусто</span>}</div>
    <div className="inline-form"><input aria-label={`Добавить: ${label}`} list={listId} value={draft} maxLength={500} placeholder="Начните вводить название…" onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}/><button type="button" className="ui-button small" disabled={!draft.trim()} onClick={add}>＋ Добавить</button></div>
  </div>;
}

// Prepared spells and the spellbook share one suggestion list; no nested <form>, so it also works inside the player's sheet form.
export function SpellLists({ edition, spells, spellBook, mine, onSpells, onSpellBook }: { edition?: string; spells: string[]; spellBook: string[]; mine: Spell[]; onSpells: (value: string[]) => void; onSpellBook: (value: string[]) => void }) {
  const ru = useSpellRu();
  const [names, setNames] = useState<string[]>([]);
  const listId = useId();
  useEffect(() => { let active = true; void catalog().then(entries => { if (active) setNames([...new Set(entries.filter(item => item.kind === 'spells' && item.edition === (edition || '2024')).map(item => ru.name(item.edition, item.name)))]); }).catch(() => {}); return () => { active = false; }; }, [edition, ru.names]);
  return <div className="spell-lists">
    <SpellChips label="Подготовленные" value={spells} onChange={onSpells} mine={mine} listId={listId}/>
    <SpellChips label="Книга заклинаний" value={spellBook} onChange={onSpellBook} mine={mine} listId={listId}/>
    <datalist id={listId}>{[...mine.map(spell => spell.name), ...names].map((name, index) => <option key={`${name}-${index}`} value={name}/>)}</datalist>
  </div>;
}

export const coinLabels = { pp: 'Платина', gp: 'Золото', ep: 'Электрум', sp: 'Серебро', cp: 'Медь' } as const;
const abilityShort: [string, string][] = [['str', 'СИЛ'], ['dex', 'ЛОВ'], ['con', 'ТЕЛ'], ['int', 'ИНТ'], ['wis', 'МДР'], ['cha', 'ХАР']];

// Always-visible summary; values changed by equipped items are highlighted and explained.
export function SheetOverview({ level, pb, stats }: { level: number; pb: number; stats: EffectiveStats }) {
  const why = (stat: EffectStat) => stats.active.filter(entry => 'stat' in entry.effect && entry.effect.stat === stat).map(entry => `${entry.item}: ${effectText(entry.effect)}`).join('\n') || undefined;
  const cell = (stat: EffectStat | '', label: string, value: string) => <span key={label} className={stat && stats.changed[stat] !== undefined ? 'boosted' : undefined} title={stat ? why(stat) : undefined}><small>{label}</small><b>{value}</b></span>;
  return <div className="sheet-overview">
    <div className="sheet-numbers">{[cell('', 'Уровень', String(level)), cell('', 'Мастерство', signed(pb)), cell('ac', 'КД', String(stats.ac)), cell('initiative', 'Инициатива', signed(stats.initiative)), cell('speed', 'Скорость', `${stats.speed} фт.`)]}</div>
    <div className="sheet-abilities">{abilityShort.map(([key, label]) => cell(key as EffectStat, label, signed(modifier(stats.abilities[key as Ability]))))}</div>
    {stats.active.length > 0 && <div className="sheet-effects"><span className="ui-label">Действуют предметы</span>{stats.active.map((entry, index) => <span key={index} className={`effect-chip fx-${effectGroup(entry.effect)}`} title={effectSentence(entry.effect)}><b>{entry.item}</b> {effectText(entry.effect)}</span>)}</div>}
  </div>;
}

type HeroTab = 'main' | 'skills' | 'attacks' | 'features' | 'magic' | 'gear';

export function HeroSheet({ game, setGame, weapons, spells, items }: { game: Game; setGame: React.Dispatch<React.SetStateAction<Game>>; weapons: Weapon[]; spells: Spell[]; items: Item[] }) {
  const inventoryCatalog = useMemo(() => [...items.map(item => inventoryFrom(item, item.id, 1, itemKindLabels[item.kind])), ...weapons.map(weapon => inventoryFrom(weapon, weapon.id, 1, 'Оружие'))], [items, weapons]);
  const [tab, setTab] = useState<HeroTab>('main');
  const set = (patch: Partial<Game>) => setGame(current => ({ ...current, ...patch }));
  const scores = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...game.abilities };
  const pb = proficiency(game.level || 1);
  const initiative = game.initiative ?? modifier(scores.dex);
  function fromWeapon(id: string) {
    const weapon = weapons.find(item => item.id === id); if (!weapon) return;
    const dex = weapon.range === 'ranged' || (weapon.properties.includes('фехтовальное') && scores.dex > scores.str);
    const mod = modifier(dex ? scores.dex : scores.str);
    set({ attacks: [...(game.attacks || []), weaponToAction(weapon, pb + mod, mod)] });
  }
  const tabs = [
    { value: 'main' as const, label: 'Основа' },
    { value: 'skills' as const, label: 'Навыки' },
    { value: 'attacks' as const, label: 'Атаки', count: game.attacks?.length },
    { value: 'features' as const, label: 'Умения', count: game.features?.length },
    { value: 'magic' as const, label: 'Магия', count: (game.spells?.length || 0) + (game.spellBook?.length || 0) },
    { value: 'gear' as const, label: 'Снаряжение', count: game.items?.length }
  ];
  return <section className="panel hero-sheet">
    <div className="hero-sheet-head"><h2>Лист персонажа</h2><span className="edition-note">D&D {game.edition || '2024'} · редакция задаётся в настройках проекта</span></div>
    <SheetOverview level={game.level || 1} pb={pb} stats={effectiveStats(game, items)}/>
    <SheetTabs label="Разделы листа" value={tab} tabs={tabs} onChange={setTab}/>
    <SheetPanel active={tab === 'main'} hint="Кто это и базовые числа. Отметьте спасброски, которыми владеет герой.">
      <div className="ui-grid two">
        <Field label="Раса / вид"><input value={game.race || ''} maxLength={200} placeholder="Дварф" onChange={e => set({ race: e.target.value })}/></Field>
        <Field label="Класс"><input value={game.className || ''} maxLength={200} placeholder="Паладин (клятва преданности)" onChange={e => set({ className: e.target.value })}/></Field>
      </div>
      <div className="stat-tiles">
        <Field label="Уровень"><input type="number" min={1} max={20} value={game.level || 1} onChange={e => { const level = num(e.target.value, game.level || 1); if (level >= 1 && level <= 20) set({ level }); }}/></Field>
        <Field label="Инициатива"><input type="number" min={-50} max={50} value={initiative} onChange={e => set({ initiative: num(e.target.value, 0) })}/></Field>
        <Field label="Скорость, фт."><input type="number" min={0} max={10000} value={game.speed ?? 30} onChange={e => { const speed = num(e.target.value, 30); if (speed >= 0 && speed <= 10000) set({ speed }); }}/></Field>
      </div>
      <Section title="Характеристики и спасброски">
        <AbilityGrid value={scores} onChange={abilities => set({ abilities })} saves={game.saves || []} saveBonus={pb} onSaves={(saves: Ability[]) => set({ saves })}/>
      </Section>
    </SheetPanel>
    <SheetPanel active={tab === 'skills'}>
      <SkillsEditor value={game.skills || ''} scores={scores} pb={pb} onChange={value => set({ skills: value })} extraLabel="Владения: доспехи, оружие, инструменты"/>
    </SheetPanel>
    <SheetPanel active={tab === 'attacks'} hint="Бонус атаки и урон для боя. Оружие из библиотеки подставит числа по характеристикам.">
      <ActionList title="Атаки и оружие" value={game.attacks || []} onChange={attacks => set({ attacks })} empty="Пока нет атак. Добавьте вручную или выберите оружие из библиотеки."
        extra={weapons.length > 0 && <select aria-label="Добавить из оружия" className="small-select" value="" onChange={e => fromWeapon(e.target.value)}><option value="">＋ Из оружия…</option>{weapons.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}/>
    </SheetPanel>
    <SheetPanel active={tab === 'features'} hint="Классовые умения, черты и особенности вида.">
      <FeatureList title="Умения и черты" value={game.features || []} onChange={features => set({ features })} empty="Например: «Божественное чувство», «Второе дыхание», «Тёмное зрение»."/>
    </SheetPanel>
    <SheetPanel active={tab === 'magic'} hint="Начните вводить название: подскажут заклинания SRD и ваши собственные.">
      <SpellLists edition={game.edition} spells={game.spells || []} spellBook={game.spellBook || []} mine={spells} onSpells={value => set({ spells: value })} onSpellBook={value => set({ spellBook: value })}/>
    </SheetPanel>
    <SheetPanel active={tab === 'gear'}>
      <Section title="Монеты"><div className="coin-row">{(['pp', 'gp', 'ep', 'sp', 'cp'] as const).map(key => <Field key={key} label={coinLabels[key]}><input type="number" min={0} max={100000000} value={game.coins?.[key] ?? 0} onChange={e => set({ coins: { ...game.coins, [key]: Math.max(0, Math.min(100000000, Math.floor(Number(e.target.value) || 0))) } })}/></Field>)}</div></Section>
      <Section title="Инвентарь"><InventoryGrid items={game.items || []} catalog={inventoryCatalog} busy={false} allowEffects onChange={value => set({ items: value })}/></Section>
      <Field label="Заметки об инвентаре"><textarea rows={4} value={game.inventory || ''} maxLength={100000} placeholder="Кольчуга, щит, 15 зм…" onChange={e => set({ inventory: e.target.value })}/></Field>
    </SheetPanel>
  </section>;
}
