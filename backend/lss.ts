import { lssSpells } from '../src/data/lss-spells.js';
import { randomUUID } from 'node:crypto';
import { characters, validGame, type Ability, type Action, type Character, type Game, type Block } from '../src/contracts.js';
import { composeSkills, parseSkills, proficiency, signed, skills, validDice, type Profs } from '../src/library.js';

type Json = Record<string, any>;
const stats = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const skillStats: Record<string, string> = { acrobatics: 'dex', 'animal handling': 'wis', arcana: 'int', athletics: 'str', deception: 'cha', history: 'int', insight: 'wis', intimidation: 'cha', investigation: 'int', medicine: 'wis', nature: 'int', perception: 'wis', performance: 'cha', persuasion: 'cha', religion: 'int', 'sleight of hand': 'dex', stealth: 'dex', survival: 'wis' };
const object = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const wrapped = (value: unknown) => object(value).value;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Deliberately restricted arithmetic. Never execute imported expressions as JavaScript.
function arithmetic(value: unknown, vars: Record<string, number>): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || value.length > 500) throw new Error('Неподдерживаемая формула');
  const source = value.replace(/\[([A-Z]+)\]/g, (_, key: string) => String(vars[key] ?? 'unknown')).replace(/\s/g, '');
  const tokens = source.match(/\d+(?:\.\d+)?|[()+*/-]/g) || [];
  if (tokens.join('') !== source || !tokens.length) throw new Error('Неподдерживаемая формула');
  let index = 0;
  function atom(): number {
    const token = tokens[index++];
    if (token === '+') return atom();
    if (token === '-') return -atom();
    if (token === '(') { const result = sum(); if (tokens[index++] !== ')') throw new Error('Скобки'); return result; }
    if (!token || !/^\d/.test(token)) throw new Error('Число');
    return Number(token);
  }
  function product(): number { let result = atom(); while (['*', '/'].includes(tokens[index])) { const op = tokens[index++]; const right = atom(); result = op === '*' ? result * right : result / right; } return result; }
  function sum(): number { let result = product(); while (['+', '-'].includes(tokens[index])) { const op = tokens[index++]; const right = product(); result = op === '+' ? result + right : result - right; } return result; }
  const result = sum(); if (index !== tokens.length || !Number.isFinite(result)) throw new Error('Формула'); return result;
}
function plain(node: unknown, depth = 0): string {
  if (depth > 40) return '';
  if (typeof node === 'string') return node;
  const value = object(node);
  if (typeof value.text === 'string') return value.text;
  if (!Array.isArray(value.content)) return '';
  return value.content.map((item: unknown) => plain(item, depth + 1)).join(['doc','bulletList','orderedList','listItem','spoiler','spoilerContent'].includes(value.type) ? '\n' : '');
}
function document(text: string) {
  return { type: 'doc', content: text.split('\n').map(line => ({ type: 'paragraph', ...(line ? { content: [{ type: 'text', text: line }] } : {}) })) };
}
function textValue(value: unknown) { return plain(object(wrapped(value)).data); }
// LSS damage formulas look like `1к8+[STR]`: substitute the variables so the sheet shows real dice such as 1d8+3.
function fromLssDice(formula: string, mod: (key: string) => number, pb: number, level: number) {
  const substituted = formula.replace(/к/gi, 'd').replace(/\[(\w+)\]/g, (_, name: string) => { const key = name.toLowerCase(); return String(stats.includes(key) ? mod(key) : key === 'prof' ? pb : key === 'lvl' ? level : 0); });
  return substituted.replace(/\s+/g, '').replace(/\+-/g, '-').replace(/--/g, '+').replace(/[+-]0(?!\d)/g, '');
}
// Inventory tiles travel as the «items» text block: one «Name ×N» line per tile.
function parseItems(text: string) {
  return text.split('\n').map(line => line.trim()).filter(Boolean).slice(0, 300).map(line => {
    const match = /^(.*?)(?:\s*×(\d+))?(\s*\(экипировано\))?$/.exec(line)!;
    return { id: randomUUID(), name: (match[1] || line).slice(0, 100), icon: '', quantity: Math.max(1, Math.min(100000, Number(match[2]) || 1)), description: '', kind: 'Из LSS', ...(match[3] ? { equipped: true } : {}) };
  });
}
const toLssDice = (dice: string) => dice.replace(/d/gi, 'к');

export function importLss(input: unknown): { character: Character; game: Game; warnings: string[] } {
  const original = structuredClone(object(input));
  if (original.jsonType !== 'character') throw new Error('Ожидается JSON персонажа Long Story Short');
  let data: Json;
  try { data = typeof original.data === 'string' ? object(JSON.parse(original.data)) : original; } catch { throw new Error('Поле data содержит некорректный JSON'); }
  if (!data.name || !data.stats || !data.info || !data.vitality) throw new Error('В файле нет имени, характеристик или жизненных показателей');
  const warnings = new Set<string>();
  if (original.edition && !['2014','2024'].includes(original.edition)) throw new Error('Поддерживаются редакции 2014 и 2024');
  if (!original.edition) warnings.add('Редакция не указана: выбрана 2024. При необходимости переключите её в листе.');
  const edition = original.edition === '2014' ? '2014' : '2024';
  const info = object(data.info); const vitality = object(data.vitality);
  const level = Number(wrapped(info.level) ?? 1);
  const abilities: Record<string, number> = {};
  const vars: Record<string, number> = { LVL: level, PROF: Number(data.proficiency ?? 2 + Math.floor((level - 1) / 4)) };
  function evaluate(value: unknown, fallback: number, label: string) {
    try { return arithmetic(value, vars); } catch { warnings.add(`${label}: формула не рассчитана. Проверьте значение вручную; исходная формула сохранена.`); return fallback; }
  }
  function bonus(target: string, initial: number) {
    let value = initial;
    const list: Json[] = Array.isArray(data.bonuses) ? data.bonuses : [];
    for (const item of list.filter(b => b.target === target && !b.disabled).sort((a, b) => (a.priority ?? (a.kind === 'override' ? 100 : 0)) - (b.priority ?? (b.kind === 'override' ? 100 : 0)))) {
      if (item.conditional && !item.conditional.default) { warnings.add('Условные бонусы требуют проверки в листе.'); continue; }
      if (item.source?.kind === 'effect' && Array.isArray(data.effects) && data.effects.some((e: Json) => e.id === item.source.refId && e.disabled)) continue;
      const amount = evaluate(item.value ?? item.expr, 0, target);
      switch (item.mode ?? (item.kind === 'override' ? 'set' : 'add')) {
        case 'add': value += amount; break;
        case 'set': value = amount; break;
        case 'upgrade': value = Math.max(value, amount); break;
        case 'downgrade': value = Math.min(value, amount); break;
        case 'multiply': value *= amount; break;
        default: warnings.add(`Бонус ${target} требует проверки вручную.`);
      }
    }
    return value;
  }
  for (const key of stats) { abilities[key] = bonus(`stat.${key}.score`, Number(object(data.stats[key]).score ?? 10)); vars[key.toUpperCase()] = Math.floor((abilities[key] - 10) / 2); }
  const maxHp = bonus('hp.max', evaluate(wrapped(vitality['hp-max']), 10, 'Максимум ХП') + evaluate(wrapped(vitality['hp-max-bonus']) ?? 0, 0, 'Бонус ХП'));
  const shield = object(vitality.shield);
  const ac = bonus('ac', evaluate(wrapped(vitality.ac), 10, 'КД') + (shield.value ? bonus('shield', evaluate(shield.mod ?? 2, 2, 'Щит')) : 0));
  const blocks: Block[] = Object.entries(object(data.text)).filter(([key]) => key !== 'equipment' && key !== 'items').map(([key, value]) => ({ id: key, kind: 'text', title: key, text: textValue(value) }));
  const book = object(original.spells);
  const normalizeSpells = (value: unknown) => Array.isArray(value) ? value.map(id => lssSpells[edition][id] || id) : [];
  const unknownSpells = [...new Set([...(Array.isArray(book.prepared) ? book.prepared : []), ...(Array.isArray(book.book) ? book.book : [])].filter(id => !lssSpells[edition][id]))];
  if (unknownSpells.length) warnings.add(`${unknownSpells.length} заклинаний — собственные заклинания LSS: их названий нет в файле, на листе они видны как коды. Замените их названиями или импортируйте персонажа в формате Arcane Table.`);
  const pb = vars.PROF; const mod = (key: string) => vars[key.toUpperCase()] ?? 0;
  const profLevel = (value: unknown) => value === 2 ? 2 : value ? 1 : 0;
  const saves = stats.filter(key => profLevel(object(object(data.saves)[key]).isProf) > 0) as Ability[];
  const profs: Profs = {}; const customSkills: string[] = [];
  for (const [name, value] of Object.entries(object(data.skills))) {
    const skill = skills.find(item => item.en.toLowerCase() === name); if (!skill) continue;
    const custom = Number(object(value).customModifier);
    if (object(value).customModifier !== undefined && object(value).customModifier !== '' && Number.isFinite(custom)) { customSkills.push(`${skill.label} ${signed(custom)}`); continue; }
    const level = profLevel(object(value).isProf); if (level) profs[skill.id] = level as 1 | 2;
  }
  const initiativeFormula = object(vitality.initiative).value;
  const initiative = typeof initiativeFormula === 'string' && initiativeFormula.trim() ? Math.max(-50, Math.min(50, Math.round(evaluate(initiativeFormula, mod('dex'), 'Инициатива')))) : undefined;
  const attacks: Action[] = (Array.isArray(data.weaponsList) ? data.weaponsList : []).slice(0, 60).map((weapon: Json) => {
    const ability = typeof weapon.ability === 'string' && stats.includes(weapon.ability) ? weapon.ability : null;
    const name = String(object(weapon.name).value ?? 'Оружие').slice(0, 200);
    const dice = fromLssDice(String(object(weapon.dmg).value ?? ''), mod, pb, level);
    if (object(weapon.dmg).value && !validDice(dice)) warnings.add(`Урон «${name}» не распознан: формула сохранена в описании.`);
    // Notes written by our exporter are «reach · +1d6 огонь · effect»: read reach and extra damage back out of them.
    let reach = ''; const extraDamage: { dice: string; type: string }[] = []; const rest: string[] = [];
    for (const part of String(object(weapon.notes).value ?? '').split(' · ').map(item => item.trim()).filter(Boolean)) {
      const bonusDamage = /^\+(\d+[dк]\d+(?:[+-]\d+)?)\s+(.{1,50})$/i.exec(part);
      if (bonusDamage && validDice(bonusDamage[1].replace(/к/gi, 'd')) && extraDamage.length < 9) extraDamage.push({ dice: bonusDamage[1].replace(/к/gi, 'd'), type: bonusDamage[2] });
      else if (!reach && !rest.length && /^(досягаемость|дистанция)?\s*\d+(\s*\/\s*\d+)?\s*фт\.?$/i.test(part)) reach = part;
      else rest.push(part);
    }
    const notes = rest.join(' · ');
    const flat = Number(object(weapon.modBonus).value ?? object(weapon.modCustom).value ?? 0) || 0;
    return { id: String(weapon.id || randomUUID()).slice(0, 100), name, kind: /\d+\s*\/\s*\d+|лук|арбалет|праща|bow|crossbow|sling/i.test(`${name} ${reach} ${notes}`) ? 'ranged' : 'melee',
      bonus: Math.max(-50, Math.min(50, (ability ? mod(ability) : 0) + (weapon.isProf ? pb : 0) + flat)), reach: reach.slice(0, 200),
      damage: [...(validDice(dice) ? [{ dice: dice.slice(0, 50), type: String(object(weapon.dmgType).value ?? '').slice(0, 50) }] : []), ...extraDamage], conditions: [],
      effect: [validDice(dice) ? '' : `Урон: ${object(weapon.dmg).value}`, notes].filter(Boolean).join(' · ').slice(0, 20000) };
  });
  // Spell slots come as «spellSlot.N» bonuses; «slots-N.filled» counts the spent ones.
  const slotList = Array.from({ length: 9 }, (_, index) => { const max = Math.max(0, Math.min(20, Math.round(bonus(`spellSlot.${index + 1}`, 0)))); return { max, used: Math.max(0, Math.min(max, Math.round(Number(object(object(data.spells)[`slots-${index + 1}`]).filled) || 0))) }; });
  const coins = Object.fromEntries(['cp', 'sp', 'ep', 'gp', 'pp'].map(key => [key, Math.max(0, Math.min(100000000, Math.floor(Number(object(object(data.coins)[key]).value) || 0)))]));
  const game: Game = { hp: Number(wrapped(vitality['hp-current']) ?? maxHp), maxHp, ac, blocks, edition, level, race: String(wrapped(info.race) ?? ''), className: String(wrapped(info.charClass) ?? ''), speed: evaluate(wrapped(vitality.speed) ?? 30, 30, 'Скорость'), abilities, inventory: textValue(object(data.text).equipment), spells: normalizeSpells(book.prepared), spellBook: normalizeSpells(book.book),
    saves, skills: composeSkills(profs, customSkills.join(', '), abilities, pb).slice(0, 2000), ...(initiative !== undefined ? { initiative } : {}), attacks, coins, ...(slotList.some(slot => slot.max) ? { spellSlots: slotList } : {}), items: parseItems(textValue(object(data.text).items)) };
  if (!validGame(game)) throw new Error('Характеристики вне допустимых границ. Проверьте уровень, ХП, КД и значения характеристик в исходном файле.');
  if (data.bonuses?.length) warnings.add('Числовые бонусы учтены. Автоматические классовые правила и сложные эффекты проверьте вручную.');
  game.lssOriginal = original; game.lssBaseline = structuredClone(game); delete game.lssBaseline.lssOriginal;
  return { character: { ...characters[2], id: randomUUID(), name: String(wrapped(data.name) || 'Импортированный персонаж').slice(0, 100), caption: `${game.race} · ${game.className}`.slice(0, 200), subtitle: `Уровень ${level} · D&D ${edition}` }, game, warnings: [...warnings] };
}

export function exportLss(character: Character, game: Game): Json {
  const original = structuredClone(game.lssOriginal || {}) as Json;
  const envelope = typeof original.data === 'string';
  const data: Json = envelope ? object(JSON.parse(original.data)) : original;
  const baseline = game.lssBaseline || {};
  const fresh = !game.lssOriginal;
  data.jsonType = 'character'; data.template ??= 'default';
  data.name = { ...object(data.name), value: character.name };
  data.info = object(data.info); data.stats = object(data.stats); data.vitality = object(data.vitality);
  if (fresh) for (const key of ['charClass','charSubclass','level','background','playerName','race','alignment','experience']) data.info[key] = { name: key, value: key === 'level' ? 1 : '' };
  const setValue = (container: Json, key: string, value: unknown) => { container[key] = { ...object(container[key]), value }; };
  for (const [key, field, fallback] of [['level','level',1],['race','race',''],['charClass','className','']] as const) if (fresh || game[field] !== baseline[field]) setValue(data.info, key, game[field] ?? fallback);
  const manual = (target: string, value: number) => {
    const id = `arcane-manual-${target}`;
    data.bonuses = (Array.isArray(data.bonuses) ? data.bonuses : []).filter((b: Json) => b.id !== id);
    data.bonuses.push({ id, label: 'Ручное значение Arcane Table', target, mode: 'set', priority: 1000000000, value, source: { kind: 'user', label: 'Arcane Table' } });
  };
  for (const key of stats) {
    const value = game.abilities?.[key] ?? 10;
    if (fresh) data.stats[key] = { name: key, score: value };
    else if (value !== object(baseline.abilities)[key]) manual(`stat.${key}.score`, value);
  }
  data.saves ??= Object.fromEntries(stats.map(key => [key, { name: key, isProf: false }]));
  data.skills ??= Object.fromEntries(Object.entries(skillStats).map(([name, baseStat]) => [name, { name, baseStat }]));
  // Fields edited in Arcane Table are written back only when they differ from the imported baseline.
  const changed = (key: 'saves' | 'skills' | 'initiative' | 'attacks' | 'coins' | 'features' | 'items') => fresh || !same(game[key], baseline[key]);
  if (changed('saves')) for (const key of stats) data.saves[key] = { ...object(data.saves[key]), name: key, isProf: (game.saves || []).includes(key as Ability) };
  if (changed('skills')) {
    const scores = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...game.abilities };
    const { profs, extra } = parseSkills(game.skills || '', scores, proficiency(game.level || 1));
    // Bonuses that are neither proficiency nor expertise travel as LSS customModifier.
    const custom = new Map<string, number>();
    for (const token of extra.split(/\s*[,;]\s*/)) { const match = /^(.+?)\s*([+−-]\d+)$/.exec(token); const skill = match && skills.find(item => item.label.toLowerCase() === match[1].trim().toLowerCase()); if (skill) custom.set(skill.id, Number(match![2].replace('−', '-'))); }
    for (const skill of skills) {
      const key = skill.en.toLowerCase(); const level = profs[skill.id];
      const entry: Json = { ...object(data.skills[key]), name: key, baseStat: skillStats[key], isProf: level === 2 ? 2 : Boolean(level) };
      if (custom.has(skill.id)) entry.customModifier = custom.get(skill.id); else delete entry.customModifier;
      data.skills[key] = entry;
    }
  }
  if (changed('initiative')) data.vitality.initiative = { value: game.initiative === undefined ? null : String(game.initiative) };
  if (changed('attacks')) {
    const before = Array.isArray(baseline.attacks) ? baseline.attacks as Action[] : [];
    const list: Json[] = Array.isArray(data.weaponsList) ? data.weaponsList : [];
    data.weaponsList = (game.attacks || []).map(attack => {
      const original = list.find(weapon => weapon.id === attack.id);
      if (original && same(attack, before.find(item => item.id === attack.id))) return original;
      const [main, ...rest] = attack.damage;
      const notes = [attack.reach, ...rest.map(part => `+${part.dice} ${part.type}`), attack.effect].filter(Boolean).join(' · ');
      return { id: attack.id, name: { value: attack.name }, dmg: { value: main ? toLssDice(main.dice) : '' }, ability: 'none', isProf: false, modBonus: { value: attack.bonus ?? 0 }, dmgType: { value: main?.type || '' }, ...(notes ? { notes: { value: notes }, notesVisibility: original?.notesVisibility ?? true } : {}) };
    });
  }
  // Sheet features have no structured LSS field: they go to the «features» text block unless a note block already uses that id.
  if (changed('features') && (game.features?.length || baseline.features) && !game.blocks.some(block => block.id === 'features')) { data.text = object(data.text); data.text.features = { ...object(data.text.features), value: { data: document((game.features || []).map(feature => `${feature.name}. ${feature.text}`).join('\n')) } }; }
  if (changed('items') && !game.blocks.some(block => block.id === 'items')) { data.text = object(data.text); data.text.items = { ...object(data.text.items), value: { data: document((game.items || []).map(item => `${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ''}${item.equipped ? ' (экипировано)' : ''}`).join('\n')) } }; }
  if (changed('coins')) data.coins = Object.fromEntries(['gp', 'sp', 'cp', 'pp', 'ep'].map(key => [key, { ...object(object(data.coins)[key]), value: game.coins?.[key as 'gp'] ?? 0 }]));
  if (fresh || game.hp !== baseline.hp) setValue(data.vitality, 'hp-current', game.hp);
  if (fresh) { setValue(data.vitality, 'hp-max', game.maxHp); setValue(data.vitality, 'ac', String(game.ac)); }
  else {
    if (game.maxHp !== baseline.maxHp) manual('hp.max', game.maxHp);
    if (game.ac !== baseline.ac || !same(game.abilities, baseline.abilities)) manual('ac', game.ac);
  }
  if (fresh || game.speed !== baseline.speed) setValue(data.vitality, 'speed', String(game.speed ?? 30));
  data.text = object(data.text);
  if (fresh || game.inventory !== baseline.inventory) data.text.equipment = { ...object(data.text.equipment), value: { data: document(game.inventory || '') } };
  const oldBlocks = Array.isArray(baseline.blocks) ? baseline.blocks as Block[] : [];
  for (const block of oldBlocks) if (!game.blocks.some(b => b.id === block.id)) delete data.text[block.id];
  for (const block of game.blocks) if (!same(block, oldBlocks.find(b => b.id === block.id))) data.text[block.id] = { ...object(data.text[block.id]), value: { data: document(`${block.title}\n${block.text}`) } };
  const result: Json = envelope ? { ...original, data: JSON.stringify(data) } : { jsonType: 'character', version: '2', data: JSON.stringify(data) };
  result.edition = game.edition || '2024'; result.sheetEdition ??= result.edition;
  result.spells = object(result.spells); result.spells.mode ??= 'cards';
  const editionChanged = Boolean(game.lssOriginal && game.edition !== baseline.edition);
  if (editionChanged && Array.isArray(result.spells.granted)) result.spells.granted = result.spells.granted.map((value: Json) => { const slug = lssSpells[String(baseline.edition)]?.[value.id]; const id = slug && Object.entries(lssSpells[game.edition || '2024']).find(([, name]) => name === slug)?.[0]; return id ? { ...value, id } : value; });
  if (fresh || editionChanged || !same(game.spells, baseline.spells)) result.spells.prepared = game.spells || [];
  if (fresh || editionChanged || !same(game.spellBook, baseline.spellBook)) result.spells.book = game.spellBook || [];
  result.spells.prepared ??= []; result.spells.book ??= [];
  result.disabledBlocks ??= { 'info-left': [], 'info-right': [], 'subinfo-left': [], 'subinfo-right': [], 'notes-left': [], 'notes-right': [] };
  return result;
}
