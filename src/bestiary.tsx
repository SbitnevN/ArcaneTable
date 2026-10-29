import React, { useEffect, useMemo, useState } from 'react';
import { newId, type Command, type InventoryItem, type Monster, type Project } from './contracts';
import { catalog, Attribution, type Entry } from './references';
import { parseStatblock } from './library';
import { MonsterEditor, StatBlock, composeType } from './editors';
import { Field, Modal, Segmented, confirmAction } from './ui';
import { Icon } from './icons';

type Run = (type: string, extra?: Partial<Command>) => void;
const crOrder = (cr: string) => cr.includes('/') ? Number(cr.split('/')[0]) / Number(cr.split('/')[1]) : Number(cr) || 0;
const crFilters = ['', '0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, i) => String(i + 1))];

export function srdToMonster(entry: Entry): Monster {
  const parsed = parseStatblock(entry.text, newId);
  return { id: newId(), name: entry.name, edition: entry.edition, hp: entry.hp || 10, ac: entry.ac || 10, type: entry.type || '', cr: entry.cr || '', speed: entry.speed || '', abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...entry.abilities }, description: '', source: `SRD ${entry.edition === '2014' ? '5.1' : '5.2.1'}, стр. ${entry.page}`, page: entry.page, ...parsed };
}
function useSrd() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { let active = true; void catalog().then(value => { if (active) setEntries(value.filter(item => item.kind === 'monsters')); }).catch(err => setError(err.message)); return () => { active = false; }; }, []);
  return { entries, error };
}
type Row = { key: string; name: string; cr: string; type: string; hp: number; ac: number; edition: string; portrait?: string; srd?: Entry; mine?: Monster };
function rows(srd: Entry[], mine: Monster[]): { srd: Row[]; mine: Row[] } {
  return {
    srd: srd.map(entry => ({ key: entry.id, name: entry.name, cr: entry.cr || '', type: entry.type || '', hp: entry.hp || 0, ac: entry.ac || 0, edition: entry.edition, srd: entry })),
    mine: mine.map(monster => ({ key: monster.id, name: monster.name, cr: monster.cr, type: composeType(monster) || monster.type, hp: monster.hp, ac: monster.ac, edition: monster.edition, portrait: monster.portrait?.image, mine: monster }))
  };
}
function filter(list: Row[], query: string, edition: string, cr: string) {
  const q = query.trim().toLocaleLowerCase();
  return list.filter(row => (!edition || row.edition === edition) && (!cr || row.cr === cr) && (!q || row.name.toLocaleLowerCase().includes(q) || row.type.toLocaleLowerCase().includes(q)))
    .sort((a, b) => crOrder(a.cr) - crOrder(b.cr) || a.name.localeCompare(b.name));
}

export function Bestiary({ project, command, busy, portrait }: { project: Project; command: Run; busy: boolean; portrait: (id: string, file: File) => Promise<void> }) {
  const { entries, error } = useSrd();
  const [source, setSource] = useState<'srd' | 'mine'>(() => project.monsters.length ? 'mine' : 'srd');
  const [query, setQuery] = useState('');
  const [edition, setEdition] = useState<string>(project.edition || '2024');
  const [cr, setCr] = useState('');
  const [selected, setSelected] = useState('');
  const [limit, setLimit] = useState(60);
  const [editing, setEditing] = useState<{ monster: Monster; title?: string } | null>(null);
  const [count, setCount] = useState(1);
  const all = useMemo(() => rows(entries, project.monsters), [entries, project.monsters]);
  const list = filter(source === 'srd' ? all.srd : all.mine, query, source === 'srd' ? edition : '', cr);
  useEffect(() => setLimit(60), [query, edition, cr, source]);
  const row = (source === 'srd' ? all.srd : all.mine).find(item => item.key === selected) || list[0];
  const monster = useMemo(() => row?.mine || (row?.srd ? srdToMonster(row.srd) : null), [row?.key, row?.mine]);
  const combat = project.combat;
  function addToCombat() {
    if (!row || !monster) return;
    if (row.mine) command('combat.add', { monsterId: row.mine.id, count });
    else command('combat.add', { participant: { name: monster.name, maxHp: monster.hp, ac: monster.ac, source: row.key }, count });
  }
  return <div className="bestiary">
    <div className="bestiary-toolbar">
      <Segmented label="Бестиарий" value={source} onChange={value => { setSource(value); setSelected(''); }} options={[{ value: 'srd', label: `Классический D&D · ${entries.length}`, icon: <Icon name="book" size={14}/> }, { value: 'mine', label: `Мастерский · ${project.monsters.length}`, icon: <Icon name="edit" size={14}/> }]}/>
      <input className="bestiary-search" type="search" aria-label="Поиск монстра" placeholder="Поиск по названию или типу…" value={query} onChange={e => setQuery(e.target.value)}/>
      {source === 'srd' && <select aria-label="Редакция" value={edition} onChange={e => setEdition(e.target.value)}><option value="2024">D&D 2024</option><option value="2014">D&D 2014</option></select>}
      <select aria-label="Опасность" value={cr} onChange={e => setCr(e.target.value)}>{crFilters.map(item => <option key={item} value={item}>{item ? `CR ${item}` : 'Любая опасность'}</option>)}</select>
      <button type="button" className="primary" disabled={busy} onClick={() => setEditing({ monster: { id: newId(), name: '', edition: project.edition || '2024', hp: 10, ac: 12, type: '', cr: '1', speed: '30 фт.', abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, description: '', source: 'Мастерский', size: 'Средний', traits: [], actions: [], bonusActions: [], reactions: [], legendary: [] }, title: 'Новый монстр' })}>＋ Новый монстр</button>
    </div>
    {error && <p className="ui-error" role="alert">{error}</p>}
    <div className="bestiary-columns">
      <section className="editor-card bestiary-list">
        <div className="section-heading"><h2>{source === 'srd' ? 'SRD' : 'Мои монстры'}</h2><span>Найдено: {list.length}</span></div>
        {source === 'mine' && project.monsters.length === 0 ? <p className="ui-empty">Здесь будут ваши монстры. Создайте нового или скопируйте любого из классического бестиария и измените под себя.</p> :
          <div className="reference-list">{list.slice(0, limit).map(item => <button type="button" key={item.key} aria-pressed={row?.key === item.key} onClick={() => setSelected(item.key)}>
            {item.portrait ? <img src={item.portrait} alt=""/> : <span className="monster-initial" aria-hidden="true">{item.name.slice(0, 1)}</span>}
            <span><strong>{item.name}</strong><small>{item.type}</small></span>
            <span className="monster-chips"><b>CR {item.cr || '—'}</b><small><Icon name="heart" size={11}/>{item.hp} <Icon name="shield" size={11}/>{item.ac}</small></span>
          </button>)}</div>}
        {list.length > limit && <button type="button" onClick={() => setLimit(limit + 60)}>Показать ещё</button>}
      </section>
      <section className="bestiary-detail">
        {monster && row ? <>
          <div className="bestiary-actions editor-card">
            {row.mine ? <>
              <button type="button" className="primary" disabled={busy} onClick={() => setEditing({ monster: structuredClone(row.mine!) })}><Icon name="edit"/>Изменить</button>
              <button type="button" disabled={busy} onClick={() => setEditing({ monster: { ...structuredClone(row.mine!), id: newId(), name: `${row.mine!.name} (копия)`.slice(0, 100), portrait: undefined }, title: 'Копия монстра' })}><Icon name="copy"/>Дублировать</button>
              <label className="ui-button"><Icon name="image"/>Карта<input hidden type="file" disabled={busy} accept="image/png,image/jpeg,image/webp" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void portrait(row.mine!.id, file); }}/></label>
              <button type="button" className="danger" disabled={busy} onClick={() => { if (confirmAction(`Удалить «${row.mine!.name}» из бестиария? Уже добавленные в бой противники останутся.`)) { command('monster.delete', { monsterId: row.mine!.id }); setSelected(''); } }}>Удалить</button>
            </> : <>
              <button type="button" className="primary" disabled={busy} onClick={() => setEditing({ monster, title: `Своя версия: ${monster.name}` })}><Icon name="copy"/>Скопировать в мастерский</button>
              {row.srd!.page > 0 && <a className="ui-button" download={`srd-${row.srd!.edition}.pdf`} href={`/references/srd-${row.srd!.edition}.pdf`}>PDF · стр. {row.srd!.page}</a>}
            </>}
            <span className="spacer"/>
            {combat ? <div className="add-to-combat"><label>Кол-во<input type="number" min={1} max={10} value={count} onChange={e => setCount(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}/></label><button type="button" disabled={busy} onClick={addToCombat}><Icon name="sword"/>В бой «{combat.name}»</button></div> : <small className="ui-note small">Создайте бой, чтобы добавлять противников</small>}
          </div>
          <StatBlock monster={monster} portrait={row.portrait}/>
          {row.srd && <details className="editor-card sb-original"><summary>Оригинальный текст SRD</summary><pre className="reference-text">{row.srd.text}</pre></details>}
        </> : <p className="ui-empty">Выберите монстра в списке.</p>}
      </section>
    </div>
    <Attribution/>
    {editing && <MonsterEditor key={editing.monster.id} project={project} title={editing.title} monster={editing.monster} busy={busy} onClose={() => setEditing(null)} onSave={(value, card) => { command('monster.save', { monster: value }); if (card) void portrait(value.id, card); setEditing(null); setSource('mine'); setSelected(value.id); }}/>}
  </div>;
}

export type EnemyChoice = { name: string; hp: number; ac: number; count: number; cr?: string; monsterId?: string; source?: string; portrait?: string; loot: InventoryItem[] };
// Without onPick the chosen enemies go straight into the current combat; with it the caller collects them (encounter wizard).
export function BestiaryPicker({ project, command, busy, onClose, onPick }: { project: Project; command: Run; busy: boolean; onClose: () => void; onPick?: (choice: EnemyChoice) => void }) {
  const { entries } = useSrd();
  const [query, setQuery] = useState('');
  const [edition, setEdition] = useState('');
  const [picked, setPicked] = useState<Row | null>(null);
  const [count, setCount] = useState(1);
  const all = useMemo(() => rows(entries, project.monsters), [entries, project.monsters]);
  const mine = filter(all.mine, query, '', '');
  const srd = query.trim().length >= 2 || edition ? filter(all.srd, query, edition, '').slice(0, 40) : [];
  const preview = useMemo(() => picked?.mine || (picked?.srd ? srdToMonster(picked.srd) : null), [picked?.key]);
  function add() {
    if (!picked || !preview) return;
    if (onPick) { onPick({ name: preview.name, hp: preview.hp, ac: preview.ac, count, ...(preview.cr ? { cr: preview.cr } : {}), ...(picked.mine ? { monsterId: picked.mine.id, portrait: picked.portrait, loot: structuredClone(picked.mine.loot || []) } : { source: picked.key, loot: [] }) }); onClose(); return; }
    if (picked.mine) command('combat.add', { monsterId: picked.mine.id, count });
    else command('combat.add', { participant: { name: preview.name, maxHp: preview.hp, ac: preview.ac, source: picked.key }, count });
    onClose();
  }
  const item = (row: Row) => <button type="button" key={row.key} aria-pressed={picked?.key === row.key} onClick={() => setPicked(row)}>{row.portrait ? <img src={row.portrait} alt=""/> : <span className="monster-initial" aria-hidden="true">{row.name.slice(0, 1)}</span>}<span><strong>{row.name}</strong><small>{row.srd ? `SRD ${row.edition} · ` : ''}{row.type}</small></span><span className="monster-chips"><b>CR {row.cr || '—'}</b><small><Icon name="heart" size={11}/>{row.hp} <Icon name="shield" size={11}/>{row.ac}</small></span></button>;
  return <Modal wide title="Противники из бестиария" subtitle={!onPick && project.combat ? `Добавить в «${project.combat.name}»` : ''} onClose={onClose}
    footer={<><span className="spacer"/>{picked && <span className="ui-note">{picked.name}</span>}<label className="count-field">Количество<input type="number" min={1} max={10} value={count} onChange={e => setCount(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}/></label><button type="button" onClick={onClose}>Отмена</button><button type="button" className="primary" disabled={busy || !picked} onClick={add}>Добавить {count > 1 ? `×${count}` : ''}</button></>}>
    <div className="picker-toolbar"><input autoFocus type="search" aria-label="Поиск монстра" placeholder="Название или тип: гоблин, dragon, undead…" value={query} onChange={e => setQuery(e.target.value)}/><select aria-label="Редакция SRD" value={edition} onChange={e => setEdition(e.target.value)}><option value="">SRD: обе редакции</option><option value="2024">SRD 2024</option><option value="2014">SRD 2014</option></select></div>
    <div className="picker-columns">
      <div className="picker-list">
        <h4>Мастерский бестиарий</h4>
        {mine.length ? <div className="reference-list">{mine.map(item)}</div> : <p className="ui-note small">{project.monsters.length ? 'Ничего не найдено.' : 'Пока пусто.'}</p>}
        <h4>Классический D&D</h4>
        {srd.length ? <div className="reference-list">{srd.map(item)}</div> : <p className="ui-note small">{query.trim().length < 2 && !edition ? 'Начните вводить название.' : 'Ничего не найдено.'}</p>}
      </div>
      <div className="picker-preview">{preview ? <StatBlock monster={preview} portrait={picked?.portrait}/> : <p className="ui-empty">Выберите монстра, чтобы увидеть статблок.</p>}</div>
    </div>
  </Modal>;
}

export function sourceMonster(project: Project, source: string | undefined, entries: Entry[]): Monster | null {
  if (!source) return null;
  const own = project.monsters.find(item => item.id === source);
  if (own) return own;
  const entry = entries.find(item => item.id === source);
  return entry ? srdToMonster(entry) : null;
}
export function StatBlockButton({ project, source }: { project: Project; source?: string }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  useEffect(() => { if (open && !project.monsters.some(item => item.id === source)) void catalog().then(setEntries).catch(() => {}); }, [open]);
  if (!source) return null;
  const monster = open ? sourceMonster(project, source, entries) : null;
  return <><button type="button" className="ui-icon-button" aria-label="Статблок" title="Статблок" onClick={() => setOpen(true)}><Icon name="book" size={15}/></button>{open && <Modal wide title={monster?.name || 'Статблок'} onClose={() => setOpen(false)}>{monster ? <StatBlock monster={monster} portrait={monster.portrait?.image}/> : <p className="ui-note">Загрузка…</p>}</Modal>}</>;
}
