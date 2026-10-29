import React, { useEffect, useMemo, useState } from 'react';
import { newId, type Action, type Game, type Spell, type SpellSlot } from './contracts';
import type { PlayerPost } from './player-combat';
import { ActionList, spellLevel } from './editors';
import { SpellCard, srdToSpell } from './grimoire';
import { catalog, type Entry } from './references';
import { schoolRu, spellLabel, useSpellRu } from './spell-ru';
import { Modal } from './ui';

const same = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
// Long Story Short stores SRD spells as slugs such as «mage-hand».
const slug = (name: string) => name.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
type Option = { key: string; name: string; level: number; school: string; mine: boolean; spell: () => Spell };

// Every spell the hero could take: the master's own spells first, then the SRD of the project's edition.
function useSpellOptions(edition: string, own: Spell[]) {
  const ru = useSpellRu();
  const [entries, setEntries] = useState<Entry[]>([]);
  useEffect(() => { let active = true; void catalog().then(list => { if (active) setEntries(list.filter(item => item.kind === 'spells')); }).catch(() => {}); return () => { active = false; }; }, []);
  const options = useMemo<Option[]>(() => {
    const mine = own.filter(spell => spell.edition === edition).map(spell => ({ key: `mine:${spell.id}`, name: spell.name, level: spell.level, school: spell.school, mine: true, spell: () => spell }));
    const srd = entries.filter(entry => entry.edition === edition && !mine.some(item => same(item.name, ru.name(entry.edition, entry.name))))
      .map(entry => ({ key: entry.id, name: ru.name(entry.edition, entry.name), level: entry.level ?? 0, school: schoolRu(entry.school), mine: false, spell: () => srdToSpell(entry, ru) }));
    return [...mine, ...srd].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, 'ru'));
  }, [own, entries, edition, ru.names, ru.texts]);
  // What a name on the sheet means: own spell, or an SRD entry by its Russian or English name (any edition as a fallback).
  const find = (name: string): Spell | null => {
    const mine = own.find(spell => same(spell.name, name));
    if (mine) return mine;
    const matches = entries.filter(entry => same(entry.name, name) || same(ru.name(entry.edition, entry.name), name) || slug(entry.name) === name);
    const entry = matches.find(item => item.edition === edition) || matches[0];
    return entry ? srdToSpell(entry, ru) : null;
  };
  return { options, find, ruNames: ru.names };
}

// One spell on the sheet, drawn like an attack card: name, a short line of what it does; tap to read the full card, × to remove it.
const spellLine = (spell: Spell) => [spellLevel(spell.level), spell.school, spell.castingTime, spell.range, spell.concentration ? 'концентрация' : ''].filter(Boolean).join(' · ');
function SpellRow({ label, spell, onRemove }: { label: string; spell: Spell | null; onRemove: () => void }) {
  return <details className="player-spell action-card">
    <summary className="action-card-head"><span className="action-card-toggle"><strong>{label}</strong><small>{spell ? spellLine(spell) : 'нет в справочнике'}</small></span><button type="button" className="ui-icon-button player-spell-remove" aria-label={`Убрать ${label}`} onClick={e => { e.preventDefault(); onRemove(); }}>×</button></summary>
    {spell ? <SpellCard spell={spell}/> : <p className="ui-note">Описание не найдено: заклинания нет в SRD и у мастера. Попросите мастера добавить его в «Мои заклинания».</p>}
  </details>;
}

// Separate window for choosing a spell: search, filter by level, read the card, then add.
function SpellPicker({ title, options, taken, onAdd, onClose }: { title: string; options: Option[]; taken: string[]; onAdd: (name: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<number | null>(null);
  const [picked, setPicked] = useState<Option | null>(null);
  const q = query.trim().toLocaleLowerCase();
  const levels = [...new Set(options.map(item => item.level))].sort((a, b) => a - b);
  const list = options.filter(item => (level === null || item.level === level) && (!q || item.name.toLocaleLowerCase().includes(q))).slice(0, 300);
  const custom = query.trim() && !options.some(item => same(item.name, query)) ? query.trim().slice(0, 500) : '';
  const has = (name: string) => taken.some(item => same(item, name));
  return <Modal wide title={title} onClose={onClose}
    footer={<><span className="spacer"/><button type="button" onClick={onClose}>Закрыть</button><button type="button" className="primary" disabled={!picked || has(picked.name)} onClick={() => { if (picked) { onAdd(picked.name); setPicked(null); } }}>{picked && has(picked.name) ? 'Уже добавлено' : picked ? `Добавить «${picked.name}»` : 'Выберите заклинание'}</button></>}>
    <input autoFocus type="search" aria-label="Поиск заклинания" placeholder="Поиск: огненный шар, щит…" value={query} onChange={e => { setQuery(e.target.value); setPicked(null); }}/>
    <div className="catalog-kinds" role="tablist" aria-label="Круг заклинания">
      <button type="button" role="tab" aria-selected={level === null} className={level === null ? 'active' : ''} onClick={() => setLevel(null)}>Все</button>
      {levels.map(value => <button type="button" role="tab" key={value} aria-selected={level === value} className={level === value ? 'active' : ''} onClick={() => setLevel(value)}>{value === 0 ? 'Заговоры' : `${value} круг`}</button>)}
    </div>
    {picked ? <div className="spell-picker-preview"><button type="button" className="ui-button small" onClick={() => setPicked(null)}>← К списку</button><SpellCard spell={picked.spell()}/></div>
      : <div className="spell-picker-list">{list.map(item => <button type="button" key={item.key} className={has(item.name) ? 'taken' : undefined} onClick={() => setPicked(item)}>
          <strong>{item.name}</strong><small>{spellLevel(item.level)} · {item.school}{item.mine ? ' · от мастера' : ''}{has(item.name) ? ' · уже есть' : ''}</small>
        </button>)}
        {!list.length && <p className="ui-empty">Ничего не найдено.</p>}
        {custom && <button type="button" className="spell-picker-custom" onClick={() => onAdd(custom)}>＋ Добавить «{custom}» без описания</button>}
      </div>}
  </Modal>;
}

const circleLabel = (level: number) => level === 0 ? 'Заговоры' : level > 9 ? 'Без круга' : `${level} круг`;

// Slot pips for one circle: gold = still available, ring = spent. A tap on gold spends one slot, on a ring restores one.
function SlotPips({ slot, busy, onChange }: { slot: SpellSlot; busy: boolean; onChange: (slot: SpellSlot) => void }) {
  const available = slot.max - slot.used;
  return <span className="slot-pips" aria-label={`Ячейки: ${available} из ${slot.max}`}>{Array.from({ length: slot.max }, (_, index) => <button type="button" key={index} disabled={busy} className={index < available ? 'slot-pip ready' : 'slot-pip spent'} aria-label={index < available ? 'Потратить ячейку' : 'Вернуть ячейку'} onClick={() => onChange({ ...slot, used: slot.used + (index < available ? 1 : -1) })}/>)}<small>{available}/{slot.max}</small></span>;
}

// «Атаки» tab of the player remote: attacks and spells are always editable, and every spell opens to its full text.
export function PlayerAttacks({ game, busy, post, spells = [] }: { game: Game; busy: boolean; post: PlayerPost; spells?: Spell[] }) {
  const [attacks, setAttacks] = useState<Action[]>(game.attacks || []);
  const [prepared, setPrepared] = useState<string[]>(game.spells || []);
  const [book, setBook] = useState<string[]>(game.spellBook || []);
  const [dirty, setDirty] = useState(false);
  const [picking, setPicking] = useState<'prepared' | 'book' | null>(null);
  const server = JSON.stringify([game.attacks, game.spells, game.spellBook]);
  // Master edits arrive from the server; unsaved local changes are kept until saved or discarded.
  useEffect(() => { if (!dirty) { setAttacks(game.attacks || []); setPrepared(game.spells || []); setBook(game.spellBook || []); } }, [server]);
  const { options, find, ruNames } = useSpellOptions(game.edition || '2024', spells);
  const lists = { prepared: [prepared, setPrepared], book: [book, setBook] } as const;
  const add = (target: 'prepared' | 'book', name: string) => { const [list, set] = lists[target]; if (!list.some(item => same(item, name)) && list.length < 1000) { set([...list, name]); setDirty(true); } };
  // Spell slots save at once: spending one in combat should not wait for «Сохранить».
  const slots = Array.from({ length: 9 }, (_, index) => game.spellSlots?.[index] || { max: 0, used: 0 });
  const [slotEdit, setSlotEdit] = useState(false);
  const saveSlots = (next: SpellSlot[]) => void post('/api/player/command', { id: newId(), type: 'player.update', sheet: { spellSlots: next } });
  const setSlot = (index: number, slot: SpellSlot) => saveSlots(slots.map((item, i) => i === index ? { max: Math.max(0, Math.min(20, slot.max)), used: Math.max(0, Math.min(slot.max, slot.used)) } : item));
  // Spells grouped by circle; a circle with slots but no spells still shows, so its slots can be spent.
  const grouped = (target: 'prepared' | 'book') => {
    const [list, set] = lists[target];
    const entries = list.map(name => ({ name, spell: find(name) }));
    const levels = [...new Set([...entries.map(entry => entry.spell?.level ?? 10), ...(target === 'prepared' ? slots.flatMap((slot, index) => slot.max ? [index + 1] : []) : [])])].sort((a, b) => a - b);
    return levels.map(level => <div className="spell-circle" key={level}>
      <h4><span>{circleLabel(level)}</span>{target === 'prepared' && level >= 1 && level <= 9 && slots[level - 1].max > 0 && <SlotPips slot={slots[level - 1]} busy={busy} onChange={slot => setSlot(level - 1, slot)}/>}</h4>
      <div className="player-spell-list">{entries.filter(entry => (entry.spell?.level ?? 10) === level).map(({ name, spell }) => <SpellRow key={name} label={spellLabel(name, ruNames)} spell={spell} onRemove={() => { set(list.filter(item => item !== name)); setDirty(true); }}/>)}</div>
    </div>);
  };
  function discard() { setAttacks(game.attacks || []); setPrepared(game.spells || []); setBook(game.spellBook || []); setDirty(false); }
  async function save() { if (await post('/api/player/command', { id: newId(), type: 'player.update', sheet: { attacks, spells: prepared, spellBook: book } })) setDirty(false); }
  return <div className="player-attacks">
    <section className="player-paper"><ActionList title="Атаки" value={attacks} onChange={value => { setAttacks(value); setDirty(true); }} empty="Пока нет атак. Добавьте оружие или заклинание-атаку."/></section>
    <section className="player-paper player-spells">
      <h2>Заклинания</h2>
      <div className="spell-slots-bar"><h3 className="player-spells-label">Подготовленные <small>{prepared.length}</small></h3>
        <button type="button" className="ui-button small" aria-pressed={slotEdit} onClick={() => setSlotEdit(!slotEdit)}>{slotEdit ? 'Готово' : 'Ячейки'}</button>
        {slots.some(slot => slot.used) && <button type="button" className="ui-button small" disabled={busy} onClick={() => saveSlots(slots.map(slot => ({ ...slot, used: 0 })))}>Отдых</button>}</div>
      {slotEdit && <div className="spell-slot-editor">{slots.map((slot, index) => <label key={index}><span>{index + 1} круг</span><span className="inventory-stepper"><button type="button" aria-label={`Меньше ячеек ${index + 1} круга`} disabled={busy || slot.max <= 0} onClick={() => setSlot(index, { ...slot, max: slot.max - 1 })}>−</button><b>{slot.max}</b><button type="button" aria-label={`Больше ячеек ${index + 1} круга`} disabled={busy || slot.max >= 20} onClick={() => setSlot(index, { ...slot, max: slot.max + 1 })}>＋</button></span></label>)}</div>}
      {prepared.length || slots.some(slot => slot.max) ? grouped('prepared') : <p className="ui-empty">Пока нет подготовленных заклинаний.</p>}
      <button type="button" className="player-spell-add" onClick={() => setPicking('prepared')}>＋ Добавить заклинание</button>
      <details className="player-spellbook"><summary>Книга заклинаний <small>{book.length}</small></summary>
        {book.length ? grouped('book') : <p className="ui-empty">Книга пуста.</p>}
        <button type="button" className="player-spell-add" onClick={() => setPicking('book')}>＋ Добавить в книгу</button>
      </details>
    </section>
    {picking && <SpellPicker title={picking === 'prepared' ? 'Подготовить заклинание' : 'Добавить в книгу заклинаний'} options={options} taken={lists[picking][0]} onAdd={name => add(picking, name)} onClose={() => setPicking(null)}/>}
    {dirty && <div className="player-sheet-savebar dirty"><span>Не сохранено</span><button type="button" disabled={busy} onClick={discard}>Отменить</button><button type="button" className="primary" disabled={busy} onClick={() => void save()}>Сохранить</button></div>}
  </div>;
}
