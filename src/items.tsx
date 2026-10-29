import React, { useEffect, useState } from 'react';
import { EffectsEditor } from './effects-editor';
import { newId, type Command, type Item, type ItemKind, type Project } from './contracts';
import { blankItem, conditions, damageText, effectText, itemKinds, itemPresets, rarities, validDice, type ItemPreset } from './library';
import { currencies } from './shop-view';
import { ItemIcon, iconFor, itemIcons, kindIcons, kindLabels } from './item-icons';
import { ChipPicker, DamageEditor } from './editors';
import { Armory } from './grimoire';
import { Field, Modal, Section, confirmAction, copyText } from './ui';
import { Icon } from './icons';
import { exportItemJson, itemJsonPrompt, parseItemJson, type ImportResult } from './item-import';

type Run = (type: string, extra?: Partial<Command>) => void;
type Tab = ItemKind | 'weapon' | 'all';
const formatPrice = (item: Pick<Item, 'price' | 'currency'>) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(item.price)} ${currencies[item.currency]}`;
const rarityLabel = (value: Item['rarity']) => rarities.find(item => item.value === value)?.label || '';
export const itemIconName = (item: Pick<Item, 'icon' | 'kind'>) => item.icon || kindIcons[item.kind];
function itemSummary(item: Item) {
  return [item.ac !== undefined && (item.armorType === 'shield' ? `КД +${item.ac}` : `КД ${item.ac}${item.armorType === 'light' ? ' + Лов' : item.armorType === 'medium' ? ' + Лов (макс. 2)' : ''}`), item.heal && `лечение ${item.heal}`, damageText(item.damage), item.charges !== undefined && `заряды: ${item.charges}`, item.spell && `заклинание: ${item.spell}`, item.quantity && `×${item.quantity}`].filter(Boolean).join(' · ');
}

export function ItemsPage({ project, command, busy, upload }: { project: Project; command: Run; busy: boolean; upload: (itemId: string, file: File) => Promise<void> }) {
  const items = project.items || [];
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Item | null>(null);
  const [importing, setImporting] = useState(false);
  const q = query.trim().toLocaleLowerCase();
  const list = items.filter(item => (tab === 'all' || item.kind === tab) && (!q || item.name.toLocaleLowerCase().includes(q)));
  const count = (kind: Tab) => kind === 'all' ? items.length + (project.weapons || []).length : kind === 'weapon' ? (project.weapons || []).length : items.filter(item => item.kind === kind).length;
  const presets = itemPresets.filter(preset => tab === 'all' || preset.kind === tab);
  const fromPreset = (preset: ItemPreset) => setEditing({ ...blankItem(newId(), preset.kind), ...preset, id: newId() } as Item);
  return <div className="items-page">
    <nav className="item-tabs" aria-label="Категории предметов">
      {(['all', 'weapon', ...itemKinds] as Tab[]).map(kind => <button type="button" key={kind} aria-pressed={tab === kind} className={tab === kind ? 'item-tab active' : 'item-tab'} onClick={() => setTab(kind)}>
        <ItemIcon name={kind === 'all' ? 'chest' : kindIcons[kind]}/><span>{kind === 'all' ? 'Все предметы' : kindLabels[kind]}</span><small>{count(kind)}</small>
      </button>)}
    </nav>
    {tab === 'weapon' ? <Armory project={project} command={command} busy={busy}/> : <>
      <div className="bestiary-toolbar"><input className="bestiary-search" type="search" aria-label="Поиск предмета" placeholder="Поиск по названию…" value={query} onChange={e => setQuery(e.target.value)}/><button type="button" className="primary" disabled={busy} onClick={() => setEditing(blankItem(newId(), tab === 'all' ? 'gear' : tab))}>＋ Новый предмет</button><button type="button" disabled={busy} onClick={() => setImporting(true)}><Icon name="upload"/>Импорт JSON</button><button type="button" disabled={!items.length && !(project.weapons || []).length} onClick={() => download(exportItemJson(items, project.weapons || []), `предметы-${project.name}.json`)}><Icon name="download"/>Экспорт</button></div>
      {list.length === 0 ? <p className="ui-empty">{items.length ? 'Ничего не найдено.' : 'Предметов пока нет. Создайте свой или возьмите шаблон ниже — потом их можно выставить в магазин.'}</p> :
        <div className="item-grid">{list.map(item => <article key={item.id} className={`item-card rarity-${item.rarity}`}>
          <button type="button" className="item-card-art" onClick={() => setEditing(structuredClone(item))} aria-label={`Изменить ${item.name}`}>{item.artwork ? <img src={item.artwork.image} alt=""/> : <ItemIcon name={itemIconName(item)}/>}</button>
          <div className="item-card-body">
            <span className="item-card-kind">{kindLabels[item.kind]}{item.rarity !== 'mundane' ? ` · ${rarityLabel(item.rarity)}` : ''}{item.attunement ? ' · настройка' : ''}</span>
            <strong>{item.name}</strong>
            {itemSummary(item) && <small className="item-card-stats">{itemSummary(item)}</small>}{item.effects?.length ? <small className="item-card-effects">✦ {item.effects.map(effectText).join(' · ')}</small> : null}
            <span className="item-card-price">{formatPrice(item)}{item.weight ? ` · ${item.weight}` : ''}</span>
          </div>
          <div className="item-card-actions"><button type="button" className="ui-icon-button" aria-label={`Изменить ${item.name}`} onClick={() => setEditing(structuredClone(item))}><Icon name="edit" size={15}/></button><button type="button" className="ui-icon-button" aria-label={`Копия ${item.name}`} onClick={() => setEditing({ ...structuredClone(item), id: newId(), name: `${item.name} (копия)`.slice(0, 100), artwork: undefined })}><Icon name="copy" size={15}/></button><button type="button" className="ui-icon-button" aria-label={`Удалить ${item.name}`} onClick={() => { if (confirmAction(`Удалить «${item.name}»? Товары в магазинах останутся.`)) command('item.delete', { itemId: item.id }); }}><Icon name="trash" size={15}/></button></div>
        </article>)}</div>}
      {presets.length > 0 && <section className="editor-card"><div className="section-heading"><h2>Шаблоны D&D</h2><span>Нажмите, чтобы добавить и настроить</span></div><div className="chip-row preset-row">{presets.map(preset => <button type="button" key={preset.name} className="chip" disabled={busy} onClick={() => fromPreset(preset)}><ItemIcon name={preset.icon || kindIcons[preset.kind]}/>{preset.name}</button>)}</div></section>}
    </>}
    {importing && <ImportDialog busy={busy} onClose={() => setImporting(false)} onImport={result => { command('library.import', { libraryItems: result.items, weapons: result.weapons }); setImporting(false); }}/>}
    {editing && <ItemEditor key={editing.id} item={editing} busy={busy} saved={items.some(item => item.id === editing.id)} upload={upload} project={project} onClose={() => setEditing(null)} onSave={(value, picture) => { command('item.save', { libraryItem: value }); if (picture) void upload(value.id, picture); setEditing(null); }}/>}
  </div>;
}

function ItemEditor({ item, project, saved, busy, upload, onSave, onClose }: { item: Item; project: Project; saved: boolean; busy: boolean; upload: (itemId: string, file: File) => Promise<void>; onSave: (item: Item, picture?: File) => void; onClose: () => void }) {
  const [picture, setPicture] = useState<{ file: File; url: string } | null>(null);
  useEffect(() => () => { if (picture) URL.revokeObjectURL(picture.url); }, [picture]);
  const [draft, setDraft] = useState<Item>(() => structuredClone(item));
  const [error, setError] = useState('');
  const set = (patch: Partial<Item>) => setDraft(current => ({ ...current, ...patch }));
  const artwork = (project.items || []).find(entry => entry.id === item.id)?.artwork;
  const num = (value: string) => value === '' ? undefined : Math.max(0, Math.floor(Number(value) || 0));
  function save() {
    if (!draft.name.trim()) { setError('Введите название'); return; }
    if (!Number.isFinite(draft.price) || draft.price < 0) { setError('Цена не может быть отрицательной'); return; }
    if (draft.damage.some(part => part.dice && !validDice(part.dice)) || (draft.heal && !validDice(draft.heal))) { setError('Проверьте кубы: формат 2d4+2'); return; }
    const kindFields = { armor: ['ac', 'armorType', 'strength', 'stealth'], potion: ['heal'], scroll: ['spell'], wand: ['charges'], ring: ['charges'], wondrous: ['charges'], ammo: ['quantity'] } as Record<string, string[]>;
    const keep = new Set(kindFields[draft.kind] || []);
    const clean = { ...draft, name: draft.name.trim(), damage: draft.damage.filter(part => part.dice.trim()) } as Record<string, unknown>;
    if (!draft.effects?.length) delete clean.effects;
    for (const key of ['ac', 'armorType', 'strength', 'stealth', 'heal', 'spell', 'charges', 'quantity']) if (!keep.has(key) || clean[key] === '' || clean[key] === undefined) delete clean[key];
    onSave(clean as Item, picture?.file);
  }
  return <Modal wide title={draft.name || 'Новый предмет'} subtitle={`${kindLabels[draft.kind]} · ${rarityLabel(draft.rarity)}`} onClose={onClose}
    footer={<><span className="spacer"/>{error && <span className="ui-error" role="alert">{error}</span>}<button type="button" onClick={onClose}>Отмена</button><button type="button" className="primary" disabled={busy} onClick={save}>Сохранить предмет</button></>}>
    <div className="item-editor">
      <div className="item-editor-art">
        <div className={`item-art-preview rarity-${draft.rarity}`}>{picture || artwork ? <img src={picture?.url || artwork!.image} alt=""/> : <ItemIcon name={iconFor(draft.icon || kindIcons[draft.kind])}/>}</div>
        <label className="ui-button small"><Icon name="image"/>{picture || artwork ? 'Заменить картинку' : 'Своя картинка'}<input hidden type="file" disabled={busy} accept="image/png,image/jpeg,image/webp" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; if (file.size > 25 * 1024 * 1024) { setError('Картинка больше 25 МБ'); return; } setPicture({ file, url: URL.createObjectURL(file) }); }}/></label>{picture && <p className="ui-note small">Загрузится при сохранении</p>}
        <span className="ui-label">Иконка по умолчанию</span>
        <div className="icon-picker">{itemIcons.map(name => <button type="button" key={name} aria-label={name} aria-pressed={(draft.icon || kindIcons[draft.kind]) === name} className={(draft.icon || kindIcons[draft.kind]) === name ? 'active' : ''} onClick={() => set({ icon: name === kindIcons[draft.kind] ? '' : name })}><ItemIcon name={name}/></button>)}</div>
      </div>
      <div className="item-editor-fields">
        <Section title="Основное">
          <div className="ui-grid two"><Field label="Название"><input autoFocus value={draft.name} maxLength={100} onChange={e => set({ name: e.target.value })}/></Field><Field label="Тип"><select value={draft.kind} onChange={e => set({ kind: e.target.value as ItemKind })}>{itemKinds.map(kind => <option key={kind} value={kind}>{kindLabels[kind]}</option>)}</select></Field></div>
          <div className="ui-grid three"><Field label="Редкость"><select value={draft.rarity} onChange={e => set({ rarity: e.target.value as Item['rarity'] })}>{rarities.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></Field><Field label="Цена"><div className="input-with-button"><input type="number" min={0} step="0.01" value={draft.price} onChange={e => set({ price: Number(e.target.value) })}/><select className="currency-select" value={draft.currency} onChange={e => set({ currency: e.target.value as Item['currency'] })}>{Object.entries(currencies).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></div></Field><Field label="Вес"><input value={draft.weight} maxLength={100} placeholder="1 фнт." onChange={e => set({ weight: e.target.value })}/></Field></div>
          <label className="check-line"><input type="checkbox" checked={draft.attunement} onChange={e => set({ attunement: e.target.checked })}/>Требует настройки</label>
        </Section>
        {draft.kind === 'armor' && <Section title="Защита"><div className="ui-grid auto">
          <Field label="Тип доспеха"><select value={draft.armorType || 'light'} onChange={e => set({ armorType: e.target.value as Item['armorType'] })}><option value="light">Лёгкий</option><option value="medium">Средний</option><option value="heavy">Тяжёлый</option><option value="shield">Щит</option></select></Field>
          <Field label={draft.armorType === 'shield' ? 'Бонус к КД' : 'Базовый КД'}><input type="number" min={0} max={50} value={draft.ac ?? ''} onChange={e => set({ ac: num(e.target.value) })}/></Field>
          {draft.armorType === 'heavy' && <Field label="Требуется Сила"><input type="number" min={0} max={30} value={draft.strength ?? ''} onChange={e => set({ strength: num(e.target.value) })}/></Field>}
          <label className="check-line"><input type="checkbox" checked={draft.stealth || false} onChange={e => set({ stealth: e.target.checked })}/>Помеха к Скрытности</label>
        </div></Section>}
        {(draft.kind === 'potion' || draft.kind === 'scroll' || draft.kind === 'wand' || draft.kind === 'ring' || draft.kind === 'wondrous' || draft.kind === 'ammo') && <Section title="Действие"><div className="ui-grid auto">
          {draft.kind === 'potion' && <Field label="Лечение" hint="Кубы, например 2d4+2"><input className={draft.heal && !validDice(draft.heal) ? 'invalid' : ''} value={draft.heal || ''} maxLength={50} onChange={e => set({ heal: e.target.value })}/></Field>}
          {draft.kind === 'scroll' && <Field label="Заклинание"><input list="item-spell-names" value={draft.spell || ''} maxLength={200} placeholder="Огненный шар" onChange={e => set({ spell: e.target.value })}/><datalist id="item-spell-names">{(project.spells || []).map(spell => <option key={spell.id} value={spell.name}/>)}</datalist></Field>}
          {(draft.kind === 'wand' || draft.kind === 'ring' || draft.kind === 'wondrous') && <Field label="Заряды"><input type="number" min={0} max={1000} value={draft.charges ?? ''} placeholder="—" onChange={e => set({ charges: num(e.target.value) })}/></Field>}
          {draft.kind === 'ammo' && <Field label="Количество в наборе"><input type="number" min={1} max={10000} value={draft.quantity ?? ''} onChange={e => set({ quantity: num(e.target.value) || undefined })}/></Field>}
        </div>
          {draft.kind !== 'ammo' && <DamageEditor value={draft.damage} onChange={damage => set({ damage })}/>}
          <ChipPicker label="Состояния, которые накладывает" options={conditions} value={draft.conditions} onChange={value => set({ conditions: value })}/>
        </Section>}
        <Section title="Эффекты, пока предмет экипирован">
          <p className="ui-note small">Соберите правило из блоков: когда герой нажмёт «Экипировать», итоговые статы пересчитаются сами. Базовые значения листа не меняются.</p>
          <EffectsEditor value={draft.effects || []} onChange={effects => set({ effects })}/>
        </Section>
        <Section title="Описание">
          <Field label="Для игроков" hint="Это увидят в магазине"><textarea rows={3} value={draft.description} maxLength={3000} onChange={e => set({ description: e.target.value })}/></Field>
          <Field label="Эффект и правила"><textarea rows={3} value={draft.effect} maxLength={20000} onChange={e => set({ effect: e.target.value })}/></Field>
          <Field label="Заметка мастера" hint="Игроки не видят"><textarea rows={2} value={draft.notes} maxLength={10000} onChange={e => set({ notes: e.target.value })}/></Field>
        </Section>
      </div>
    </div>
  </Modal>;
}

export function ShopItemPicker({ project, command, busy, shopId, onClose }: { project: Project; command: Run; busy: boolean; shopId: string; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Record<string, number | null>>({});
  const q = query.trim().toLocaleLowerCase();
  const rows = [...(project.items || []).map(item => ({ id: item.id, name: item.name, kind: kindLabels[item.kind], icon: itemIconName(item), art: item.artwork?.image, price: formatPrice(item) })),
    ...(project.weapons || []).map(weapon => ({ id: weapon.id, name: weapon.name, kind: 'Оружие', icon: weapon.range === 'ranged' ? 'bow' : 'sword', art: undefined, price: weapon.cost || 'цена не указана' }))]
    .filter(row => !q || `${row.name} ${row.kind}`.toLocaleLowerCase().includes(q));
  const chosen = Object.keys(picked);
  function add() {
    for (const id of chosen) command('shop.item.import', { shopId, itemId: id, amount: picked[id] ?? -1 });
    onClose();
  }
  return <Modal wide title="Товары из предметов" subtitle="Отметьте предметы и задайте остаток" onClose={onClose}
    footer={<><span className="spacer"/><span className="ui-note">Выбрано: {chosen.length}</span><button type="button" onClick={onClose}>Отмена</button><button type="button" className="primary" disabled={busy || !chosen.length} onClick={add}>Добавить в магазин</button></>}>
    <input type="search" aria-label="Поиск предмета" placeholder="Поиск по названию или типу…" value={query} onChange={e => setQuery(e.target.value)}/>
    {rows.length === 0 ? <p className="ui-empty">{(project.items || []).length + (project.weapons || []).length ? 'Ничего не найдено.' : 'Сначала добавьте предметы в разделе «Предметы».'}</p> :
      <ul className="shop-picker-list">{rows.map(row => { const on = row.id in picked; return <li key={row.id} className={on ? 'active' : ''}>
        <label><input type="checkbox" checked={on} onChange={() => setPicked(current => { const next = { ...current }; if (on) delete next[row.id]; else next[row.id] = 1; return next; })}/>
          <span className="shop-picker-art">{row.art ? <img src={row.art} alt=""/> : <ItemIcon name={row.icon}/>}</span><span><strong>{row.name}</strong><small>{row.kind} · {row.price}</small></span></label>
        {on && <span className="shop-picker-stock"><input type="number" aria-label={`Остаток ${row.name}`} min={0} max={1000000} disabled={picked[row.id] === null} value={picked[row.id] ?? ''} onChange={e => setPicked(current => ({ ...current, [row.id]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}/><label className="check-line"><input type="checkbox" checked={picked[row.id] === null} onChange={e => setPicked(current => ({ ...current, [row.id]: e.target.checked ? null : 1 }))}/>∞</label></span>}
      </li>; })}</ul>}
  </Modal>;
}

function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ImportDialog({ busy, onClose, onImport }: { busy: boolean; onClose: () => void; onImport: (result: ImportResult) => void }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [copied, setCopied] = useState(false);
  function parse(sources: { name: string; text: string }[]) {
    const merged: ImportResult = { items: [], weapons: [], errors: [] };
    for (const source of sources) {
      try { const part = parseItemJson(JSON.parse(source.text.replace(/^﻿/, '').replace(/^\s*```(?:json)?|```\s*$/g, '')), source.name); merged.items.push(...part.items); merged.weapons.push(...part.weapons); merged.errors.push(...part.errors); }
      catch { merged.errors.push(`${source.name}: это не JSON`); }
    }
    setResult(merged);
  }
  const total = result ? result.items.length + result.weapons.length : 0;
  return <Modal wide title="Импорт предметов из JSON" subtitle="Один файл, несколько файлов или вставленный текст" onClose={onClose}
    footer={<><span className="spacer"/>{result && <span className="ui-note">Готово к импорту: {total}{result.errors.length ? ` · ошибок: ${result.errors.length}` : ''}</span>}<button type="button" onClick={onClose}>Отмена</button><button type="button" className="primary" disabled={busy || !total} onClick={() => result && onImport(result)}>Импортировать {total || ''}</button></>}>
    <div className="import-sources">
      <label className="ui-button"><Icon name="upload"/>Выбрать JSON-файлы<input hidden type="file" multiple accept=".json,application/json" onChange={async e => { const files = Array.from(e.target.files || []); e.target.value = ''; parse(await Promise.all(files.map(async file => ({ name: file.name, text: await file.text() })))); }}/></label>
      <span className="ui-note small">или вставьте ответ нейросети:</span>
    </div>
    <textarea className="import-text" rows={8} value={text} placeholder='[{ "name": "Пламенный клинок", "type": "оружие", "damage": "1d8 рубящий + 1d6 огонь", "price": 500 }]' onChange={e => { setText(e.target.value); if (e.target.value.trim()) parse([{ name: 'текст', text: e.target.value }]); else setResult(null); }}/>
    {result && <div className="import-preview">
      {total > 0 && <div className="chip-row">{[...result.items.map(item => ({ id: item.id, name: item.name, icon: item.icon || kindIcons[item.kind], kind: kindLabels[item.kind] })), ...result.weapons.map(weapon => ({ id: weapon.id, name: weapon.name, icon: weapon.range === 'ranged' ? 'bow' : 'sword', kind: 'Оружие' }))].slice(0, 60).map(entry => <span key={entry.id} className="chip import-chip"><ItemIcon name={entry.icon}/>{entry.name}<small>{entry.kind}</small></span>)}{total > 60 && <span className="ui-note small">и ещё {total - 60}</span>}</div>}
      {result.errors.length > 0 && <ul className="import-errors">{result.errors.slice(0, 20).map((line, index) => <li key={index}>{line}</li>)}</ul>}
    </div>}
    <details className="import-format"><summary>Формат для нейросети</summary><p className="ui-note small">Скопируйте эту инструкцию в нейросеть вместе с просьбой, например «20 магических предметов для пиратской кампании».</p><pre>{itemJsonPrompt}</pre><button type="button" className="ui-button small" onClick={() => void copyText(itemJsonPrompt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>{copied ? '✓ Скопировано' : 'Копировать инструкцию'}</button></details>
  </Modal>;
}
