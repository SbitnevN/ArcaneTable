import React, { useState } from 'react';
import { newId, type InventoryItem } from './contracts';
import { effectGroup, effectSentence, effectText, itemEffects, itemKindLabels, rarities, stackInto } from './library';
import { ItemIcon, iconFor, itemIcons, kindIcons } from './item-icons';
import { Field, Modal, Section } from './ui';
import { EffectsEditor } from './effects-editor';

// Potions, scrolls, food and ammo are used up; everything else is worn or wielded.
const consumableKinds = [itemKindLabels.potion, itemKindLabels.scroll, itemKindLabels.food, itemKindLabels.ammo];
const consumable = (item: InventoryItem) => consumableKinds.includes(item.kind) || /зель|эликсир|свит|паёк|паек|рацион|еда|стрел|болт|пул[ия]|дротик/i.test(`${item.kind} ${item.name}`);
const rarityLabel = (value?: InventoryItem['rarity']) => rarities.find(item => item.value === value)?.label || '';
export function TileArt({ item }: { item: Pick<InventoryItem, 'artwork' | 'icon' | 'kind' | 'name'> }) {
  return item.artwork ? <img className="item-icon painted" src={item.artwork.image} alt="" draggable={false}/> : <ItemIcon name={iconFor(item.icon, item.kind, item.name)}/>;
}

// Minecraft-like grid of inventory tiles; every change is reported as the whole new list.
export function InventoryGrid({ items, catalog, onChange, busy, slots = 24, title = 'Инвентарь', allowEffects = false }: { items: InventoryItem[]; catalog: InventoryItem[]; onChange: (items: InventoryItem[]) => void; busy: boolean; slots?: number; title?: string; allowEffects?: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const total = Math.max(slots, Math.ceil((items.length + 1) / 6) * 6);
  const item = items.find(entry => entry.id === selected);
  const effects = item ? itemEffects(item, catalog) : [];
  const update = (id: string, patch: Partial<InventoryItem> | null) => onChange(patch === null ? items.filter(entry => entry.id !== id) : items.map(entry => entry.id === id ? { ...entry, ...patch } : entry));
  return <div className="inventory">
    <div className="inventory-head"><strong>{title}</strong><span>{items.reduce((sum, entry) => sum + entry.quantity, 0)} предм.</span><button type="button" className="ui-button small" disabled={busy} onClick={() => setAdding(true)}>＋ Добавить</button></div>
    <div className="inventory-grid" role="list">
      {Array.from({ length: total }, (_, index) => { const entry = items[index]; return entry
        ? <button type="button" role="listitem" key={entry.id} className={`inventory-slot filled rarity-${entry.rarity || 'mundane'}${entry.id === selected ? ' selected' : ''}${entry.equipped ? ' equipped' : ''}`} title={entry.name} onClick={() => setSelected(entry.id === selected ? null : entry.id)}>
            <TileArt item={entry}/>{itemEffects(entry, catalog).length > 0 && <i className="inventory-magic" aria-label="Есть эффекты">✦</i>}{entry.quantity > 1 && <b className="inventory-count">{entry.quantity}</b>}{entry.equipped && <i className="inventory-equipped" aria-label="Экипировано">E</i>}
          </button>
        : <button type="button" role="listitem" key={`empty-${index}`} className="inventory-slot empty" aria-label="Пустая ячейка: добавить предмет" disabled={busy} onClick={() => setAdding(true)}/>; })}
    </div>
    {item && <div className={`inventory-detail rarity-${item.rarity || 'mundane'}`}>
      <div className="inventory-detail-art"><TileArt item={item}/></div>
      <div className="inventory-detail-body">
        <span className="inventory-detail-kind">{[item.kind, rarityLabel(item.rarity)].filter(Boolean).join(' · ') || 'Предмет'}</span>
        <strong>{item.name}</strong>
        {item.description && <p>{item.description}</p>}
        {effects.length > 0 && <div className={item.equipped ? 'item-effects active' : 'item-effects'}>{effects.map((effect, index) => <span key={index} className={`effect-chip fx-${effectGroup(effect)}`} title={effectSentence(effect)}>{effectText(effect)}</span>)}<small>{item.equipped ? 'Действует на персонажа' : 'Начнёт действовать после «Экипировать»'}</small></div>}
        <div className="inventory-actions">
          <span className="inventory-stepper"><button type="button" aria-label="Меньше" disabled={busy || item.quantity <= 1} onClick={() => update(item.id, { quantity: item.quantity - 1 })}>−</button><b>{item.quantity}</b><button type="button" aria-label="Больше" disabled={busy || item.quantity >= 100000} onClick={() => update(item.id, { quantity: item.quantity + 1 })}>＋</button></span>
          {consumable(item) && !item.equipped
            ? <button type="button" className="primary" disabled={busy} onClick={() => { if (item.quantity > 1) update(item.id, { quantity: item.quantity - 1 }); else { update(item.id, null); setSelected(null); } }}>Использовать</button>
            : <button type="button" className="primary" disabled={busy} onClick={() => update(item.id, { equipped: item.equipped ? undefined : true })}>{item.equipped ? 'Снять' : 'Экипировать'}</button>}{!item.sourceId && <button type="button" disabled={busy} onClick={() => setEditing(item)}>Изменить</button>}
          <button type="button" className="danger" disabled={busy} onClick={() => { update(item.id, null); setSelected(null); }}>Выбросить</button>
        </div>
      </div>
    </div>}
    {adding && <AddItemDialog catalog={catalog} busy={busy} allowEffects={allowEffects} onClose={() => setAdding(false)} onAdd={(entry) => { onChange(stackInto(items, entry)); setAdding(false); }}/>}
    {editing && <CustomItemEditor item={editing} busy={busy} allowEffects={allowEffects} onClose={() => setEditing(null)} onSave={next => { update(next.id, next); setEditing(null); }}/>}
  </div>;
}

const kindOrder = ['Оружие', ...Object.values(itemKindLabels).filter(label => label !== 'Оружие')];
const kindIcon = (label: string) => kindIcons[(Object.keys(itemKindLabels) as (keyof typeof itemKindLabels)[]).find(key => itemKindLabels[key] === label) || 'gear'] || 'bag';

// Library picker with category tabs, plus a way to make your own item.
export function AddItemDialog({ catalog, busy, onClose, onAdd, title = 'Добавить в инвентарь', confirm = 'Добавить', allowEffects = false }: { catalog: InventoryItem[]; busy: boolean; onClose: () => void; onAdd: (item: InventoryItem) => void; title?: string; confirm?: string; allowEffects?: boolean }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');
  const [picked, setPicked] = useState<InventoryItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [custom, setCustom] = useState(false);
  const q = query.trim().toLocaleLowerCase();
  const kinds = [...kindOrder.filter(label => catalog.some(entry => entry.kind === label)), ...[...new Set(catalog.map(entry => entry.kind))].filter(label => label && !kindOrder.includes(label))];
  const list = catalog.filter(entry => (!kind || entry.kind === kind) && (!q || `${entry.name} ${entry.kind}`.toLocaleLowerCase().includes(q)));
  if (custom) return <CustomItemEditor item={{ id: newId(), name: '', icon: '', quantity, description: '', kind: 'Своё' }} busy={busy} allowEffects={allowEffects} onClose={() => setCustom(false)} onSave={onAdd} title="Свой предмет" back="← К списку предметов"/>;
  function add() { if (picked) onAdd({ ...structuredClone(picked), id: newId(), quantity: Math.max(1, Math.min(100000, Math.floor(quantity) || 1)) }); }
  return <Modal wide title={title} onClose={onClose}
    footer={<><button type="button" onClick={() => setCustom(true)}>＋ Свой предмет</button><span className="spacer"/><label className="count-field">Количество<input type="number" min={1} max={100000} value={quantity} onChange={e => setQuantity(Number(e.target.value))}/></label><button type="button" onClick={onClose}>Отмена</button><button type="button" className="primary" disabled={busy || !picked} onClick={add}>{confirm}</button></>}>
    {catalog.length === 0 ? <p className="ui-empty">Мастер ещё не добавил предметы в проект. Создайте свой предмет.</p> : <>
      <div className="catalog-kinds" role="tablist" aria-label="Категории предметов">
        <button type="button" role="tab" aria-selected={!kind} className={!kind ? 'active' : ''} onClick={() => setKind('')}><ItemIcon name="chest"/>Все<small>{catalog.length}</small></button>
        {kinds.map(label => <button type="button" role="tab" key={label} aria-selected={kind === label} className={kind === label ? 'active' : ''} onClick={() => setKind(label)}><ItemIcon name={kindIcon(label)}/>{label}<small>{catalog.filter(entry => entry.kind === label).length}</small></button>)}
      </div>
      <input autoFocus type="search" aria-label="Поиск предмета" placeholder="Поиск: зелье, меч, верёвка…" value={query} onChange={e => setQuery(e.target.value)}/>
      {list.length === 0 ? <p className="ui-empty">Ничего не найдено.</p> : <div className="catalog-grid">{list.map(entry => <button type="button" key={entry.sourceId || entry.id} className={`catalog-tile rarity-${entry.rarity || 'mundane'}${picked?.id === entry.id ? ' selected' : ''}`} aria-pressed={picked?.id === entry.id} onClick={() => setPicked(entry)}>
        <span className="catalog-art"><TileArt item={entry}/></span><strong>{entry.name}</strong><small>{entry.kind}</small>
      </button>)}</div>}
      {picked?.description && <p className="ui-note">{picked.description}</p>}
    </>}
  </Modal>;
}

// Editor for an item that is not from the library, laid out like the master's item editor.
// Players cannot grant themselves effects: the server drops them, so the effects section is shown only to the master.
export function CustomItemEditor({ item, busy, allowEffects, onClose, onSave, title, back }: { item: InventoryItem; busy: boolean; allowEffects: boolean; onClose: () => void; onSave: (item: InventoryItem) => void; title?: string; back?: string }) {
  const [draft, setDraft] = useState<InventoryItem>(() => structuredClone(item));
  const [error, setError] = useState('');
  const set = (patch: Partial<InventoryItem>) => setDraft(current => ({ ...current, ...patch }));
  const icon = iconFor(draft.icon, draft.kind, draft.name);
  function save() {
    if (!draft.name.trim()) { setError('Введите название'); return; }
    const clean: InventoryItem = { ...draft, name: draft.name.trim().slice(0, 100), description: draft.description.slice(0, 3000), quantity: Math.max(1, Math.min(100000, Math.floor(draft.quantity) || 1)) };
    if (!clean.rarity || clean.rarity === 'mundane') delete clean.rarity;
    if (!allowEffects || !clean.effects?.length) delete clean.effects;
    onSave(clean);
  }
  return <Modal wide title={title || draft.name || 'Предмет'} subtitle={[draft.kind, rarityLabel(draft.rarity)].filter(Boolean).join(' · ')} onClose={onClose}
    footer={<>{back && <button type="button" onClick={onClose}>{back}</button>}<span className="spacer"/>{error && <span className="ui-error" role="alert">{error}</span>}{!back && <button type="button" onClick={onClose}>Отмена</button>}<button type="button" className="primary" disabled={busy} onClick={save}>Сохранить предмет</button></>}>
    <div className="item-editor">
      <div className="item-editor-art">
        <div className={`item-art-preview rarity-${draft.rarity || 'mundane'}`}>{draft.artwork ? <img src={draft.artwork.image} alt=""/> : <ItemIcon name={icon}/>}</div>
        <span className="ui-label">Иконка</span>
        <div className="icon-picker">{itemIcons.map(name => <button type="button" key={name} aria-label={name} aria-pressed={icon === name} className={icon === name ? 'active' : ''} onClick={() => set({ icon: name })}><ItemIcon name={name}/></button>)}</div>
      </div>
      <div className="item-editor-fields">
        <Section title="Основное">
          <div className="ui-grid two"><Field label="Название"><input autoFocus value={draft.name} maxLength={100} placeholder="Например, Письмо от барона" onChange={e => set({ name: e.target.value })}/></Field>
            <Field label="Тип"><select value={draft.kind} onChange={e => set({ kind: e.target.value })}>{[...new Set(['Своё', ...kindOrder, draft.kind])].map(label => <option key={label} value={label}>{label}</option>)}</select></Field></div>
          <div className="ui-grid two"><Field label="Редкость"><select value={draft.rarity || 'mundane'} onChange={e => set({ rarity: e.target.value as InventoryItem['rarity'] })}>{rarities.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></Field>
            <Field label="Количество"><input type="number" min={1} max={100000} value={draft.quantity} onChange={e => set({ quantity: Number(e.target.value) })}/></Field></div>
        </Section>
        {allowEffects && <Section title="Эффекты, пока предмет экипирован"><EffectsEditor value={draft.effects || []} onChange={effects => set({ effects })}/></Section>}
        <Section title="Описание"><Field label="Что это и что делает"><textarea rows={4} value={draft.description} maxLength={3000} onChange={e => set({ description: e.target.value })}/></Field>
          {!allowEffects && <p className="ui-note small">Эффекты, которые меняют характеристики, добавляет мастер.</p>}</Section>
      </div>
    </div>
  </Modal>;
}
