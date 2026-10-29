import React, { useEffect, useMemo, useState } from 'react';
import { newId, type Command, type Project, type Spell, type Weapon } from './contracts';
import { catalog, Attribution, type Entry } from './references';
import { blankSpell, blankWeapon, damageText, parseSpellDamage } from './library';
import { SpellEditor, WeaponEditor, spellLevel, spellSummary } from './editors';
import { Segmented, confirmAction, copyText } from './ui';
import { Icon, type IconName } from './icons';
import { Modal } from './ui';
import { castingRu, classesRu, componentsRu, durationRu, postSpellTexts, rangeRu, reloadSpellTexts, schoolRu, spellKey, spellTranslatePrompt, useSpellRu } from './spell-ru';

type Run = (type: string, extra?: Partial<Command>) => void;

type Ru = ReturnType<typeof useSpellRu>;
export function srdToSpell(entry: Entry, ru?: Ru): Spell {
  const translated = ru?.text(entry.edition, entry.name);
  const higherRaw = /(At Higher Levels\.|Using a Higher-Level Spell Slot\.|Cantrip Upgrade\.)\s*([\s\S]*)$/i.exec(entry.text)?.[2]?.replace(/(\w)-\s+(\w)/g, '$1$2').replace(/\s+/g, ' ').trim() || '';
  // PDF extraction sometimes runs into the next page: keep only the first sentence of the upcast rule.
  const higher = /^.*?[.!](?=\s|$)/.exec(higherRaw)?.[0] || higherRaw;
  return { ...blankSpell(newId(), entry.edition), name: ru ? ru.name(entry.edition, entry.name) : entry.name, level: entry.level ?? 0, school: schoolRu(entry.school), castingTime: castingRu(entry.castingTime), range: rangeRu(entry.range), components: componentsRu(entry.components), duration: durationRu(entry.duration), concentration: Boolean(entry.concentration), ritual: /ritual/i.test(entry.text.split('\n')[0] || ''), heal: undefined, higher: translated ? '' : higher.slice(0, 2000), effect: '', description: (translated || entry.text).slice(0, 100000), classes: classesRu(entry.classes), source: `${entry.name} · SRD ${entry.edition === '2014' ? '5.1' : '5.2.1'}, стр. ${entry.page}${translated ? '' : ' · описание на английском'}`, ...parseSpellDamage(entry.text) };
}

export function Spellbook({ project, command, busy }: { project: Project; command: Run; busy: boolean }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState('');
  const mine = project.spells || [];
  const [source, setSource] = useState<'srd' | 'mine'>(() => mine.length ? 'mine' : 'srd');
  const [query, setQuery] = useState('');
  const [edition, setEdition] = useState<string>(project.edition || '2024');
  const [level, setLevel] = useState('');
  const [selected, setSelected] = useState('');
  const [limit, setLimit] = useState(60);
  const [editing, setEditing] = useState<Spell | null>(null);
  const [translating, setTranslating] = useState(false);
  const ru = useSpellRu();
  useEffect(() => { let active = true; void catalog().then(value => { if (active) setEntries(value.filter(item => item.kind === 'spells')); }).catch(err => setError(err.message)); return () => { active = false; }; }, []);
  useEffect(() => setLimit(60), [query, edition, level, source]);
  const q = query.trim().toLocaleLowerCase();
  const srdList = entries.filter(item => item.edition === edition && (level === '' || String(item.level) === level) && (!q || `${item.name} ${ru.name(item.edition, item.name)}`.toLocaleLowerCase().includes(q))).sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || ru.name(a.edition, a.name).localeCompare(ru.name(b.edition, b.name), 'ru'));
  const mineList = mine.filter(item => (level === '' || String(item.level) === level) && (!q || item.name.toLocaleLowerCase().includes(q))).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  const srdItem = source === 'srd' ? srdList.find(item => item.id === selected) || srdList[0] : undefined;
  const mineItem = source === 'mine' ? mineList.find(item => item.id === selected) || mineList[0] : undefined;
  const spell = useMemo(() => mineItem || (srdItem ? srdToSpell(srdItem, ru) : null), [mineItem, srdItem?.id, ru.names, ru.texts]);
  const translatedCount = entries.filter(item => item.edition === edition && ru.text(item.edition, item.name)).length;
  return <div className="grimoire">
    <div className="bestiary-toolbar">
      <Segmented label="Источник" value={source} onChange={value => { setSource(value); setSelected(''); }} options={[{ value: 'srd', label: 'Классические SRD', icon: <Icon name="book" size={14}/> }, { value: 'mine', label: `Мои заклинания · ${mine.length}`, icon: <Icon name="edit" size={14}/> }]}/>
      <input className="bestiary-search" type="search" aria-label="Поиск заклинания" placeholder="Поиск по названию…" value={query} onChange={e => setQuery(e.target.value)}/>
      {source === 'srd' && <select aria-label="Редакция" value={edition} onChange={e => setEdition(e.target.value)}><option value="2024">D&D 2024</option><option value="2014">D&D 2014</option></select>}
      <select aria-label="Круг" value={level} onChange={e => setLevel(e.target.value)}><option value="">Любой круг</option>{Array.from({ length: 10 }, (_, i) => <option key={i} value={i}>{spellLevel(i)}</option>)}</select>
      <button type="button" className="primary" disabled={busy} onClick={() => setEditing(blankSpell(newId(), project.edition || '2024'))}>＋ Новое заклинание</button>
      {source === 'srd' && <button type="button" onClick={() => setTranslating(true)}>Перевод описаний · {translatedCount}/{entries.filter(item => item.edition === edition).length}</button>}
    </div>
    {error && <p className="ui-error" role="alert">{error}</p>}
    <div className="bestiary-columns">
      <section className="editor-card bestiary-list">
        <div className="section-heading"><h2>{source === 'srd' ? 'SRD' : 'Мои заклинания'}</h2><span>Найдено: {source === 'srd' ? srdList.length : mineList.length}</span></div>
        {source === 'mine' && !mine.length ? <p className="ui-empty">Создайте своё заклинание или скопируйте классическое и поменяйте кубы, урон и последствия.</p> :
          <div className="reference-list">{(source === 'srd' ? srdList.map(item => ({ id: item.id, name: ru.name(item.edition, item.name), level: item.level ?? 0, sub: `${schoolRu(item.school)} · ${item.name}` })) : mineList.map(item => ({ id: item.id, name: item.name, level: item.level, sub: spellSummary(item) || item.school }))).slice(0, limit).map(item => <button type="button" key={item.id} aria-pressed={(spell && (mineItem?.id === item.id || srdItem?.id === item.id)) || false} onClick={() => setSelected(item.id)}><span className="spell-level" aria-hidden="true">{item.level || '◦'}</span><span><strong>{item.name}</strong><small>{item.sub}</small></span></button>)}</div>}
        {(source === 'srd' ? srdList.length : mineList.length) > limit && <button type="button" onClick={() => setLimit(limit + 60)}>Показать ещё</button>}
      </section>
      <section className="bestiary-detail">{spell ? <>
        <div className="bestiary-actions editor-card">{mineItem ? <><button type="button" className="primary" disabled={busy} onClick={() => setEditing(structuredClone(mineItem))}><Icon name="edit"/>Изменить</button><button type="button" disabled={busy} onClick={() => setEditing({ ...structuredClone(mineItem), id: newId(), name: `${mineItem.name} (копия)`.slice(0, 200) })}><Icon name="copy"/>Дублировать</button><button type="button" className="danger" disabled={busy} onClick={() => { if (confirmAction(`Удалить «${mineItem.name}»?`)) { command('spell.delete', { itemId: mineItem.id }); setSelected(''); } }}>Удалить</button></> : <><button type="button" className="primary" disabled={busy} onClick={() => setEditing(spell)}><Icon name="copy"/>Скопировать в мои</button>{srdItem && srdItem.page > 0 && <a className="ui-button" download={`srd-${srdItem.edition}.pdf`} href={`/references/srd-${srdItem.edition}.pdf`}>PDF · стр. {srdItem.page}</a>}</>}</div>
        <SpellCard spell={spell}/>
      </> : <p className="ui-empty">Выберите заклинание.</p>}</section>
    </div>
    <Attribution/>
    {translating && <TranslationDialog entries={entries.filter(item => item.edition === edition)} edition={edition} ru={ru} onClose={() => setTranslating(false)}/>}
    {editing && <SpellEditor key={editing.id} spell={editing} busy={busy} onClose={() => setEditing(null)} onSave={value => { command('spell.save', { spell: value }); setEditing(null); setSource('mine'); setSelected(value.id); }}/>}
  </div>;
}

// The text of a spell as readable blocks: the header lines the grid already shows are dropped,
// paragraphs stay apart, and the «higher levels» rule is pulled out into its own block.
const spellHeaderLine = /^(\d+-?(й|ый|ой)?\s*(уровень|круг)|заговор|время накладывания|дистанция|компоненты|длительность|классы|casting time|range|components|duration|\d+(st|nd|rd|th)-level|level \d|cantrip)/i;
const higherLine = /^(на больших уровнях|на более высоких уровнях|использование ячейки более высокого уровня|усиление заговора|at higher levels|using a higher-level spell slot|cantrip upgrade)/i;
export function spellParagraphs(text: string) {
  // PDF text breaks lines mid-sentence («When-» / «ever»): a line that does not end a sentence continues the previous one.
  const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean).reduce<string[]>((all, line) => {
    const last = all[all.length - 1];
    if (last === undefined || /[.!?:;»)]$/.test(last) || spellHeaderLine.test(last) || spellHeaderLine.test(line) || higherLine.test(line)) all.push(line);
    else all[all.length - 1] = /\p{L}-$/u.test(last) ? last.slice(0, -1) + line : `${last} ${line}`;
    return all;
  }, []);
  let start = 0; while (start < lines.length && start < 6 && spellHeaderLine.test(lines[start])) start++;
  const body = lines.slice(start); const cut = body.findIndex(line => higherLine.test(line));
  return { body: cut < 0 ? body : body.slice(0, cut), higher: cut < 0 ? '' : body.slice(cut).join(' ') };
}
// Dice like «1к4», «2d6+3» or «d4» get a plate so they stand out while reading.
function Dice({ text }: { text: string }) {
  const parts = text.split(/((?<![\p{L}\d])\d*[dкk]\d+(?:\s?[+−-]\s?\d+)?(?![\p{L}\d]))/u);
  return <>{parts.map((part, index) => index % 2 ? <span className="spell-dice" key={index}>{part}</span> : part)}</>;
}
function HigherRule({ text }: { text: string }) {
  const match = /^(.*?[.:])\s+([\s\S]*)$/.exec(text);
  return <p className="spell-higher">{match && higherLine.test(match[1]) ? <><b>{match[1]}</b> <Dice text={match[2]}/></> : <><b>На больших уровнях.</b> <Dice text={text}/></>}</p>;
}
export function SpellCard({ spell }: { spell: Spell }) {
  // «В, С, М (несколько капель святой воды)»: the tile shows the letters, the material goes under the grid.
  const material = /^(.*?)\s*\((.+)\)\s*$/.exec(spell.components);
  const duration = `${spell.concentration && !/концентрац/i.test(spell.duration) ? 'Концентрация, ' : ''}${spell.duration}`;
  const meta: [IconName, string, string][] = [['hourglass', 'Время', spell.castingTime], ['ruler', 'Дистанция', spell.range], ['flask', 'Компоненты', material ? material[1] : spell.components], ['clock', 'Длительность', duration]];
  const text = spellParagraphs(spell.description || '');
  const higher = spell.higher || text.higher;
  return <article className="stat-block spell-card">
    <header><div><h3>{spell.name}</h3><p>{[spellLevel(spell.level), spell.school, spell.concentration ? 'концентрация' : '', spell.ritual ? 'ритуал' : ''].filter(Boolean).join(' · ')}</p></div></header>
    <div className="spell-params">{meta.filter(([, , value]) => value).map(([icon, label, value]) => <div key={label}><Icon name={icon}/><small>{label}</small><b>{value}</b></div>)}</div>
    {material && <p className="spell-material">Материал: {material[2]}</p>}
    {(spell.damage.length > 0 || spell.heal || spell.attack !== 'none') && <div className="dice-panel">
      {spell.attack !== 'none' && <div><span>Бросок</span><strong>{spell.attack === 'save' ? `Спасбросок ${({ str: 'Силы', dex: 'Ловкости', con: 'Телосложения', int: 'Интеллекта', wis: 'Мудрости', cha: 'Харизмы' } as Record<string, string>)[spell.save || 'dex']}` : spell.attack === 'ranged' ? 'Дальняя атака заклинанием' : spell.attack === 'melee' ? 'Рукопашная атака заклинанием' : 'Без броска'}</strong></div>}
      {spell.damage.length > 0 && <div><span>Урон</span><strong>{damageText(spell.damage)}</strong>{spell.attack === 'save' && <small>{spell.onSave === 'half' ? 'половина при успехе' : 'нет урона при успехе'}</small>}</div>}
      {spell.heal && <div><span>Лечение</span><strong>{spell.heal}</strong></div>}
    </div>}
    {(spell.conditions.length > 0 || spell.effect) && <div className="sb-section"><h4>Последствия</h4>{spell.conditions.length > 0 && <div className="chip-row">{spell.conditions.map(item => <span className="chip active" key={item}>{item}</span>)}</div>}{spell.effect && <p className="spell-text"><Dice text={spell.effect}/></p>}</div>}
    {text.body.length > 0 && (spell.effect
      ? <details className="sb-notes"><summary>Полное описание</summary><div className="spell-body">{text.body.map((line, index) => <p key={index}><Dice text={line}/></p>)}</div></details>
      : <div className="spell-body">{text.body.map((line, index) => <p key={index}><Dice text={line}/></p>)}</div>)}
    {higher && <HigherRule text={higher}/>}
    {spell.classes && <p className="spell-classes">Классы: {spell.classes}</p>}
    <p className="ui-note small">{spell.source}</p>
  </article>;
}

const presets: [string, Weapon['category'], Weapon['range'], string, string, string[], string?, string?][] = [
  ['Кинжал', 'simple', 'melee', '1d4', 'колющий', ['фехтовальное', 'лёгкое', 'метательное'], '20/60 фт.'], ['Дубинка', 'simple', 'melee', '1d4', 'дробящий', ['лёгкое']], ['Палица', 'simple', 'melee', '1d6', 'дробящий', []],
  ['Боевой посох', 'simple', 'melee', '1d6', 'дробящий', ['универсальное'], undefined, '1d8'], ['Копьё', 'simple', 'melee', '1d6', 'колющий', ['метательное', 'универсальное'], '20/60 фт.', '1d8'], ['Ручной топор', 'simple', 'melee', '1d6', 'рубящий', ['лёгкое', 'метательное'], '20/60 фт.'],
  ['Лёгкий арбалет', 'simple', 'ranged', '1d8', 'колющий', ['боеприпас', 'перезарядка', 'двуручное'], '80/320 фт.'], ['Короткий лук', 'simple', 'ranged', '1d6', 'колющий', ['боеприпас', 'двуручное'], '80/320 фт.'],
  ['Длинный меч', 'martial', 'melee', '1d8', 'рубящий', ['универсальное'], undefined, '1d10'], ['Короткий меч', 'martial', 'melee', '1d6', 'колющий', ['фехтовальное', 'лёгкое']], ['Рапира', 'martial', 'melee', '1d8', 'колющий', ['фехтовальное']],
  ['Скимитар', 'martial', 'melee', '1d6', 'рубящий', ['фехтовальное', 'лёгкое']], ['Боевой топор', 'martial', 'melee', '1d8', 'рубящий', ['универсальное'], undefined, '1d10'], ['Секира', 'martial', 'melee', '1d12', 'рубящий', ['тяжёлое', 'двуручное']],
  ['Двуручный меч', 'martial', 'melee', '2d6', 'рубящий', ['тяжёлое', 'двуручное']], ['Боевой молот', 'martial', 'melee', '1d8', 'дробящий', ['универсальное'], undefined, '1d10'], ['Глефа', 'martial', 'melee', '1d10', 'рубящий', ['тяжёлое', 'досягаемость', 'двуручное']],
  ['Длинный лук', 'martial', 'ranged', '1d8', 'колющий', ['боеприпас', 'тяжёлое', 'двуручное'], '150/600 фт.'], ['Тяжёлый арбалет', 'martial', 'ranged', '1d10', 'колющий', ['боеприпас', 'тяжёлое', 'перезарядка', 'двуручное'], '100/400 фт.']
];
const presetWeapon = ([name, category, range, dice, type, properties, distance, versatile]: typeof presets[number]): Weapon => ({ ...blankWeapon(newId()), name, category, range, damage: [{ dice, type }], properties, ...(distance ? { distance } : {}), ...(versatile ? { versatile } : {}) });

export function Armory({ project, command, busy }: { project: Project; command: Run; busy: boolean }) {
  const weapons = project.weapons || [];
  const [editing, setEditing] = useState<Weapon | null>(null);
  const [query, setQuery] = useState('');
  const q = query.trim().toLocaleLowerCase();
  const list = weapons.filter(item => !q || item.name.toLocaleLowerCase().includes(q));
  return <div className="grimoire">
    <div className="bestiary-toolbar"><input className="bestiary-search" type="search" aria-label="Поиск оружия" placeholder="Поиск оружия…" value={query} onChange={e => setQuery(e.target.value)}/><span className="spacer"/><button type="button" className="primary" disabled={busy} onClick={() => setEditing(blankWeapon(newId()))}>＋ Новое оружие</button></div>
    <section className="editor-card">
      <div className="section-heading"><h2>Оружие проекта</h2><span>{weapons.length}</span></div>
      {weapons.length === 0 ? <p className="ui-empty">Здесь будет ваше оружие: обычное, магическое, уникальные артефакты. Начните с шаблона ниже или создайте своё.</p> :
        <div className="weapon-grid">{list.map(weapon => <article key={weapon.id} className="weapon-card">
          <div className="weapon-icon" aria-hidden="true">{weapon.range === 'ranged' ? <Icon name="bow" size={22}/> : <Icon name="sword" size={22}/>}</div>
          <div className="weapon-info"><strong>{weapon.name}{weapon.bonus ? ` +${weapon.bonus}` : ''}</strong><span className="weapon-damage">{damageText(weapon.damage) || 'без урона'}</span><small>{[weapon.category === 'simple' ? 'простое' : weapon.category === 'martial' ? 'воинское' : 'особое', ...weapon.properties].join(' · ')}</small>{(weapon.conditions.length > 0 || weapon.effect) && <small className="weapon-effect"><Icon name="bolt" size={11}/>{[...weapon.conditions, weapon.effect].filter(Boolean).join('; ').slice(0, 140)}</small>}</div>
          <div className="weapon-actions"><button type="button" className="ui-icon-button" aria-label={`Изменить ${weapon.name}`} onClick={() => setEditing(structuredClone(weapon))}><Icon name="edit" size={15}/></button><button type="button" className="ui-icon-button" aria-label={`Удалить ${weapon.name}`} onClick={() => { if (confirmAction(`Удалить «${weapon.name}»?`)) command('weapon.delete', { itemId: weapon.id }); }}>×</button></div>
        </article>)}</div>}
    </section>
    <section className="editor-card">
      <div className="section-heading"><h2>Шаблоны базового оружия</h2><span>Нажмите, чтобы добавить и настроить</span></div>
      <div className="chip-row preset-row">{presets.map(preset => <button type="button" key={preset[0]} className="chip" disabled={busy} onClick={() => setEditing(presetWeapon(preset))}>{preset[2] === 'ranged' ? <Icon name="bow" size={13}/> : <Icon name="sword" size={13}/>}{preset[0]} <small>{preset[3]}</small></button>)}</div>
    </section>
    {editing && <WeaponEditor key={editing.id} weapon={editing} busy={busy} onClose={() => setEditing(null)} onSave={value => { command('weapon.save', { weapon: value }); setEditing(null); }}/>}
  </div>;
}

// Export untranslated SRD descriptions for another AI and import its answers (one or many JSON files / pasted text).
function TranslationDialog({ entries, edition, ru, onClose }: { entries: Entry[]; edition: string; ru: Ru; onClose: () => void }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const missing = entries.filter(entry => !ru.text(entry.edition, entry.name));
  function exportBatch(list: Entry[]) {
    const json = JSON.stringify(list.map(entry => ({ key: spellKey(entry.edition, entry.name), name: ru.name(entry.edition, entry.name), text: entry.text })), null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `заклинания-${edition}-для-перевода.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function submit(sources: string[]) {
    const texts: Record<string, { name?: string; text: string }> = {};
    let bad = 0;
    for (const source of sources) {
      try {
        const value = JSON.parse(source.replace(/^\uFEFF/, '').replace(/^\s*```(?:json)?|```\s*$/g, ''));
        const list = Array.isArray(value) ? value : Object.entries(value).map(([key, entry]) => typeof entry === 'string' ? { key, text: entry } : { key, ...(entry as object) });
        for (const entry of list as { key?: unknown; name?: unknown; text?: unknown }[]) if (typeof entry?.key === 'string' && typeof entry.text === 'string' && /^(2014|2024):/.test(entry.key)) texts[entry.key] = { ...(typeof entry.name === 'string' && entry.name.trim() ? { name: entry.name.trim().slice(0, 120) } : {}), text: entry.text.slice(0, 30000) }; else bad++;
      } catch { bad++; }
    }
    if (!Object.keys(texts).length) { setStatus('Не нашёл переводов: нужен JSON-массив { key, name, text }'); return; }
    setBusy(true);
    try { await postSpellTexts(texts); reloadSpellTexts(); setStatus(`Загружено переводов: ${Object.keys(texts).length}${bad ? `, пропущено: ${bad}` : ''}`); setText(''); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Не удалось сохранить перевод'); }
    finally { setBusy(false); }
  }
  return <Modal wide title="Перевод описаний заклинаний" subtitle={`D&D ${edition}: переведено ${entries.length - missing.length} из ${entries.length}. Названия и параметры уже на русском.`} onClose={onClose}>
    <ol className="spotify-steps">
      <li><strong>Выгрузите тексты</strong> — лучше частями по 20–30 заклинаний, так нейросеть не обрежет ответ.<div className="action-row">{Array.from({ length: Math.ceil(missing.length / 25) }, (_, index) => <button type="button" key={index} className="ui-button small" onClick={() => exportBatch(missing.slice(index * 25, index * 25 + 25))}>Часть {index + 1}</button>)}{missing.length > 0 && <button type="button" className="ui-button small" onClick={() => exportBatch(missing)}>Все {missing.length}</button>}{!missing.length && <span className="ui-note">Всё переведено.</span>}</div></li>
      <li><strong>Отдайте нейросети</strong> файл вместе с инструкцией:<div className="action-row"><button type="button" className="ui-button small" onClick={() => void copyText(spellTranslatePrompt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>{copied ? '✓ Скопировано' : 'Копировать инструкцию'}</button></div></li>
      <li><strong>Загрузите ответ</strong> — файлы или вставленный текст:<div className="action-row"><label className="ui-button small"><Icon name="upload"/>JSON-файлы<input hidden type="file" multiple accept=".json,application/json" onChange={async e => { const files = Array.from(e.target.files || []); e.target.value = ''; void submit(await Promise.all(files.map(file => file.text()))); }}/></label></div>
        <textarea className="import-text" rows={6} value={text} placeholder='[{ "key": "2024:Fireball", "name": "Огненный шар", "text": "Яркая вспышка…" }]' onChange={e => setText(e.target.value)}/>
        <div className="action-row"><button type="button" className="primary" disabled={busy || !text.trim()} onClick={() => void submit([text])}>Загрузить вставленный перевод</button></div></li>
    </ol>
    {status && <p className="ui-note" role="status">{status}</p>}
  </Modal>;
}
