import type { Ability, Action, DamagePart, Effect, EffectStat, Feature, StatEffect, TraitEffect, InventoryItem, Item, Monster, Spell, Weapon } from './contracts.js';
import { validArtwork } from './shop-view.js';

export const abilities: { key: Ability; short: string; label: string }[] = [
  { key: 'str', short: 'СИЛ', label: 'Сила' }, { key: 'dex', short: 'ЛОВ', label: 'Ловкость' }, { key: 'con', short: 'ТЕЛ', label: 'Телосложение' },
  { key: 'int', short: 'ИНТ', label: 'Интеллект' }, { key: 'wis', short: 'МДР', label: 'Мудрость' }, { key: 'cha', short: 'ХАР', label: 'Харизма' }
];
export const damageTypes = ['колющий', 'рубящий', 'дробящий', 'огонь', 'холод', 'электричество', 'звук', 'кислота', 'яд', 'некротический', 'излучение', 'силовое поле', 'психический'];
export const conditions = ['ослеплён', 'очарован', 'оглушён', 'испуган', 'схвачен', 'недееспособен', 'невидим', 'парализован', 'окаменён', 'отравлен', 'сбит с ног', 'опутан', 'ошеломлён', 'без сознания', 'истощение'];
export const schools = ['воплощение', 'вызов', 'иллюзия', 'некромантия', 'ограждение', 'очарование', 'преобразование', 'прорицание'];
export const weaponProperties = ['фехтовальное', 'лёгкое', 'тяжёлое', 'двуручное', 'универсальное', 'метательное', 'досягаемость', 'боеприпас', 'перезарядка', 'особое', 'серебряное', 'магическое'];
export const masteries = ['', 'Cleave', 'Graze', 'Nick', 'Push', 'Sap', 'Slow', 'Topple', 'Vex'];
export const sizes = ['Крошечный', 'Маленький', 'Средний', 'Большой', 'Огромный', 'Громадный'];
export const actionKinds: { value: Action['kind']; label: string }[] = [
  { value: 'melee', label: 'Атака вблизи' }, { value: 'ranged', label: 'Дальняя атака' }, { value: 'spell', label: 'Атака заклинанием' }, { value: 'save', label: 'Спасбросок' }, { value: 'other', label: 'Особое' }
];

export const modifier = (score: number) => Math.floor((score - 10) / 2);
export const signed = (value: number) => value >= 0 ? `+${value}` : `−${Math.abs(value)}`;
export const proficiency = (level: number) => 2 + Math.floor((Math.max(1, level) - 1) / 4);
export function crProficiency(cr: string) {
  const value = cr.includes('/') ? 0 : Number.parseInt(cr, 10) || 0;
  return value < 5 ? 2 : 2 + Math.floor((value - 1) / 4);
}
export function averageDice(dice: string): number | null {
  const clean = dice.replace(/\s+/g, '').replace(/−/g, '-').toLowerCase();
  if (!/^(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(clean)) return null;
  let total = 0;
  for (const part of clean.match(/[+-]?[^+-]+/g) || []) {
    const sign = part.startsWith('-') ? -1 : 1; const value = part.replace(/^[+-]/, '');
    const match = /^(\d*)d(\d+)$/.exec(value);
    total += sign * (match ? (Number(match[1] || 1) * (Number(match[2]) + 1)) / 2 : Number(value));
  }
  return Math.floor(total);
}
export const validDice = (dice: string) => averageDice(dice) !== null;
export function damageText(parts: DamagePart[]) {
  return parts.filter(part => part.dice.trim()).map(part => { const average = averageDice(part.dice); return `${average !== null ? `${average} (${part.dice})` : part.dice} ${part.type}`.trim(); }).join(' + ');
}
export function actionSummary(action: Action) {
  const head = action.kind === 'save' ? `Спасбросок ${abilities.find(a => a.key === action.save)?.short || ''} Сл ${action.dc ?? '?'}` : action.kind === 'other' ? '' : `${actionKinds.find(k => k.value === action.kind)?.label}: ${signed(action.bonus ?? 0)} к попаданию`;
  const damage = damageText(action.damage);
  return [head, action.reach, damage && `урон ${damage}${action.kind === 'save' && action.onSave === 'half' ? ', половина при успехе' : ''}`, action.conditions?.length ? `состояния: ${action.conditions.join(', ')}` : '', action.recharge && `перезарядка ${action.recharge}`].filter(Boolean).join(' · ');
}

export const blankAction = (id: string, kind: Action['kind'] = 'melee'): Action => ({ id, name: '', kind, bonus: kind === 'save' || kind === 'other' ? undefined : 4, ...(kind === 'save' ? { dc: 13, save: 'dex' as Ability, onSave: 'half' as const } : {}), reach: kind === 'ranged' ? 'дистанция 80/320 фт.' : kind === 'melee' ? 'досягаемость 5 фт.' : '', damage: kind === 'other' ? [] : [{ dice: '1d6+2', type: kind === 'save' ? 'огонь' : 'рубящий' }], conditions: [], effect: '' });
export const blankSpell = (id: string, edition: '2014' | '2024' = '2024'): Spell => ({ id, name: '', edition, level: 1, school: 'воплощение', castingTime: '1 действие', range: '60 футов', components: 'В, С', duration: 'Мгновенная', concentration: false, ritual: false, attack: 'save', save: 'dex', damage: [{ dice: '2d6', type: 'огонь' }], onSave: 'half', higher: '', conditions: [], effect: '', description: '', classes: '', source: 'Пользовательское' });
export const blankWeapon = (id: string): Weapon => ({ id, name: '', category: 'martial', range: 'melee', damage: [{ dice: '1d8', type: 'рубящий' }], properties: [], conditions: [], effect: '', description: '' });

const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max;
const optionalText = (value: unknown, max: number) => value === undefined || text(value, max);
const integer = (value: unknown, min: number, max: number) => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
const optionalInteger = (value: unknown, min: number, max: number) => value === undefined || integer(value, min, max);
const abilityKeys = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const strings = (value: unknown, count: number, max: number) => value === undefined || Array.isArray(value) && value.length <= count && value.every(item => text(item, max));
export function validDamage(value: unknown) { return Array.isArray(value) && value.length <= 10 && value.every(part => part && typeof part === 'object' && text(part.dice, 50) && text(part.type, 50)); }
export function validAction(value: unknown): value is Action {
  const a = value as Action;
  return Boolean(a) && typeof a === 'object' && text(a.id, 100) && text(a.name, 200) && ['melee', 'ranged', 'spell', 'save', 'other'].includes(a.kind) && optionalInteger(a.bonus, -50, 50) && optionalInteger(a.dc, 0, 50) && (a.save === undefined || abilityKeys.includes(a.save)) && optionalText(a.reach, 200) && validDamage(a.damage) && (a.onSave === undefined || ['half', 'none'].includes(a.onSave)) && strings(a.conditions, 20, 100) && optionalText(a.recharge, 50) && text(a.effect, 20000);
}
export function validFeature(value: unknown): value is Feature { const f = value as Feature; return Boolean(f) && typeof f === 'object' && text(f.id, 100) && text(f.name, 200) && text(f.text, 20000); }
const actions = (value: unknown) => value === undefined || Array.isArray(value) && value.length <= 60 && value.every(validAction);
export function validMonsterDetails(m: Monster) {
  return ['size', 'creature', 'alignment', 'hpDice', 'acNote', 'skills', 'senses', 'languages', 'vulnerabilities', 'resistances', 'immunities', 'conditionImmunities'].every(key => optionalText(m[key as keyof Monster], 1000))
    && optionalInteger(m.initiative, -50, 50) && optionalInteger(m.xp, 0, 1000000)
    && (m.saves === undefined || typeof m.saves === 'object' && m.saves !== null && Object.entries(m.saves).every(([key, value]) => abilityKeys.includes(key) && integer(value, -50, 50)))
    && (m.traits === undefined || Array.isArray(m.traits) && m.traits.length <= 60 && m.traits.every(validFeature))
    && actions(m.actions) && actions(m.bonusActions) && actions(m.reactions) && actions(m.legendary)
    && (m.loot === undefined || Array.isArray(m.loot) && m.loot.length <= 50 && m.loot.every(validInventoryItem));
}
export function validSpell(value: unknown): value is Spell {
  const s = value as Spell;
  return Boolean(s) && typeof s === 'object' && text(s.id, 100) && /^[\w-]{1,100}$/.test(s.id) && text(s.name, 200) && s.name.trim().length > 0 && ['2014', '2024'].includes(s.edition) && integer(s.level, 0, 9)
    && ['school', 'castingTime', 'range', 'components', 'duration', 'classes', 'source'].every(key => text(s[key as keyof Spell], 500)) && typeof s.concentration === 'boolean' && typeof s.ritual === 'boolean'
    && ['none', 'melee', 'ranged', 'save', 'auto'].includes(s.attack) && (s.save === undefined || abilityKeys.includes(s.save)) && validDamage(s.damage) && optionalText(s.heal, 50) && (s.onSave === undefined || ['half', 'none'].includes(s.onSave))
    && text(s.higher, 2000) && strings(s.conditions, 20, 100) && text(s.effect, 20000) && text(s.description, 100000);
}
export function validWeapon(value: unknown): value is Weapon {
  const w = value as Weapon;
  return Boolean(w) && typeof w === 'object' && text(w.id, 100) && /^[\w-]{1,100}$/.test(w.id) && text(w.name, 200) && w.name.trim().length > 0 && ['simple', 'martial', 'magic'].includes(w.category) && ['melee', 'ranged'].includes(w.range)
    && validDamage(w.damage) && optionalText(w.versatile, 50) && strings(w.properties, 20, 100) && ['distance', 'mastery', 'weight', 'cost'].every(key => optionalText(w[key as keyof Weapon], 200)) && optionalInteger(w.bonus, 0, 10)
    && strings(w.conditions, 20, 100) && text(w.effect, 20000) && text(w.description, 100000);
}
export function validHeroExtras(game: { attacks?: unknown; features?: unknown; initiative?: unknown; saves?: unknown; skills?: unknown }) {
  return actions(game.attacks) && (game.features === undefined || Array.isArray(game.features) && game.features.length <= 100 && game.features.every(validFeature)) && optionalInteger(game.initiative, -50, 50)
    && (game.saves === undefined || Array.isArray(game.saves) && game.saves.length <= 6 && game.saves.every(key => abilityKeys.includes(key as string))) && optionalText(game.skills, 2000);
}

// ---- SRD statblock parsing: turns English PDF text into editable structured fields ----
const typeMap: Record<string, string> = { piercing: 'колющий', slashing: 'рубящий', bludgeoning: 'дробящий', fire: 'огонь', cold: 'холод', lightning: 'электричество', thunder: 'звук', acid: 'кислота', poison: 'яд', necrotic: 'некротический', radiant: 'излучение', force: 'силовое поле', psychic: 'психический' };
const saveMap: Record<string, Ability> = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
const sizeMap: Record<string, string> = { Tiny: 'Крошечный', Small: 'Маленький', Medium: 'Средний', Large: 'Большой', Huge: 'Огромный', Gargantuan: 'Громадный' };
const wordMap: Record<string, string> = { ...typeMap, blinded: 'ослеплён', charmed: 'очарован', deafened: 'оглушён', exhaustion: 'истощение', frightened: 'испуган', grappled: 'схвачен', incapacitated: 'недееспособен', invisible: 'невидим', paralyzed: 'парализован', petrified: 'окаменён', poisoned: 'отравлен', prone: 'сбит с ног', restrained: 'опутан', stunned: 'ошеломлён', unconscious: 'без сознания',
  common: 'Общий', goblin: 'Гоблинский', dwarvish: 'Дварфийский', elvish: 'Эльфийский', giant: 'Великаний', gnomish: 'Гномий', draconic: 'Драконий', orc: 'Орочий', halfling: 'Полуросликов', abyssal: 'Бездны', infernal: 'Инфернальный', celestial: 'Небесный', 'deep speech': 'Глубинная речь', primordial: 'Первичный', sylvan: 'Сильван', undercommon: 'Подземный', "thieves' cant": 'Воровской жаргон', 'thieves’ cant': 'Воровской жаргон', druidic: 'Друидический' };
// Translates comma/semicolon separated SRD terms that have a Russian chip; anything else stays as written.
function translate(value: string | undefined) {
  return (value || '').split(/\s*[,;]\s*/).map(token => token.trim()).filter(Boolean).map(token => wordMap[token.toLowerCase()] || token).join(', ');
}
function entries(block: string): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = [];
  let sentenceEnded = true;
  for (const line of block.split('\n')) {
    const match = /^([A-Z][\w'’ ,()/-]{1,60}?(?: \([^)]*\))?)\.\s+(.*)$/.exec(line.trim());
    const starts = match && sentenceEnded && !/^(Hit|Each|The|If|On|A|An|At|When|While|Until|It|Its|This|Melee|Ranged|Success|Failure|DC)\b/.test(match[1]);
    if (line.trim()) sentenceEnded = /[.:)]$|^Traits$/.test(line.trim());
    if (match && starts) out.push({ name: match[1].trim(), text: match[2] });
    else if (out.length && line.trim()) out[out.length - 1].text += (out[out.length - 1].text.endsWith('-') ? '' : ' ') + line.trim();
  }
  return out;
}
function parseAction(id: string, entry: { name: string; text: string }): Action {
  const body = entry.text.replace(/\s+/g, ' ');
  const recharge = /\((Recharge [^)]+|\d+\/Day[^)]*)\)/i.exec(entry.name)?.[1];
  const name = entry.name.replace(/\s*\((Recharge [^)]+|\d+\/Day[^)]*)\)/i, '');
  const damage: DamagePart[] = [];
  for (const match of body.matchAll(/\d+ \((\d+d\d+(?:\s*[+−-]\s*\d+)?)\) (\w+) damage/gi)) damage.push({ dice: match[1].replace(/\s+/g, '').replace('−', '-'), type: typeMap[match[2].toLowerCase()] || match[2] });
  const attack = /(Melee or Ranged|Melee|Ranged)(?: Weapon| Spell)? Attack(?: Roll)?:\s*([+−-]\d+)(?: to hit)?,?\s*(.*?)\.?\s*Hit:/i.exec(body);
  const save = /DC (\d+) (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw|(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw: DC (\d+)/i.exec(body);
  const found = Object.keys({ blinded: 1, charmed: 1, deafened: 1, frightened: 1, grappled: 1, incapacitated: 1, invisible: 1, paralyzed: 1, petrified: 1, poisoned: 1, prone: 1, restrained: 1, stunned: 1, unconscious: 1 }).filter(item => new RegExp(`\\b${item}\\b`, 'i').test(body));
  const ru: Record<string, string> = { blinded: 'ослеплён', charmed: 'очарован', deafened: 'оглушён', frightened: 'испуган', grappled: 'схвачен', incapacitated: 'недееспособен', invisible: 'невидим', paralyzed: 'парализован', petrified: 'окаменён', poisoned: 'отравлен', prone: 'сбит с ног', restrained: 'опутан', stunned: 'ошеломлён', unconscious: 'без сознания' };
  const base = { id, name, damage, conditions: found.map(item => ru[item]), effect: body, ...(recharge ? { recharge } : {}) };
  if (attack) return { ...base, kind: /spell/i.test(body.slice(0, attack.index + 40)) ? 'spell' : /^ranged/i.test(attack[1]) ? 'ranged' : 'melee', bonus: Number(attack[2].replace('−', '-')), reach: attack[3].replace(/,?\s*(one|each) (target|creature)\.?$/i, '').trim() };
  if (save) return { ...base, kind: 'save', dc: Number(save[1] || save[4]), save: saveMap[(save[2] || save[3]).toLowerCase()], onSave: /half (as much )?damage|Success: Half/i.test(body) ? 'half' : 'none' };
  return { ...base, kind: 'other' };
}
export function parseStatblock(text: string, makeId: () => string): Partial<Monster> {
  const sections = text.split(/\n(Actions|Bonus Actions|Reactions|Legendary Actions)\n/);
  const head = sections[0];
  const typeLine = head.split('\n')[0] || '';
  const typeMatch = /^(Tiny|Small|Medium|Large|Huge|Gargantuan)(?: or \w+)? ([^,]+),\s*(.*)$/.exec(typeLine);
  const lines = head.split('\n');
  const field = /^(Skills|Senses|Languages|Damage|Condition|Saving Throws|Saves|Resistances|Immunities|Vulnerabilities|Gear|Challenge|CR|Proficiency|Armor Class|AC|Hit Points|HP|Speed|Initiative|STR|Str|MOD)\b/;
  // Statblock fields wrap across PDF lines: join continuation lines until the next field label.
  const line = (label: RegExp) => {
    const index = lines.findIndex(item => label.test(item)); if (index < 0) return undefined;
    let value = lines[index].replace(label, '').trim();
    for (let next = index + 1; next < lines.length && lines[next].trim() && !field.test(lines[next]) && !/^\d/.test(lines[next]) && /[,;]$|\band$|\bpassive$/i.test(value); next++) value += ' ' + lines[next].trim();
    return value;
  };
  const savesLine = line(/^Saving Throws\s+/) || line(/^Saves\s+/);
  const saves: Partial<Record<Ability, number>> = {};
  for (const item of savesLine?.matchAll(/(Str|Dex|Con|Int|Wis|Cha) ([+−-]\d+)/g) || []) saves[item[1].toLowerCase() as Ability] = Number(item[2].replace('−', '-'));
  const hpDice = /\(([^)]*d[^)]*)\)/.exec(line(/^(Hit Points|HP)\s+/) || '')?.[1];
  const acNote = /\(([^)]*)\)/.exec(line(/^(Armor Class|AC)\s+/) || '')?.[1];
  const initiative = line(/^Initiative\s+/); const xp = /XP ([\d,]+)|\(([\d,]+) XP\)/.exec(head);
  const afterChallenge = head.split(/\n(?:Challenge|CR) [^\n]*\n/)[1] || '';
  const traits = entries(afterChallenge).map(entry => ({ id: makeId(), name: entry.name, text: entry.text }));
  const out: Partial<Monster> = {
    ...(typeMatch ? { size: sizeMap[typeMatch[1]] || typeMatch[1], creature: typeMatch[2].trim(), alignment: typeMatch[3].trim() } : {}),
    ...(hpDice ? { hpDice: hpDice.replace(/\s+/g, '').replace('−', '-') } : {}), ...(acNote ? { acNote } : {}),
    ...(initiative ? { initiative: Number(/([+−-]\d+)/.exec(initiative)?.[1].replace('−', '-') || 0) } : {}),
    ...(Object.keys(saves).length ? { saves } : {}), ...(xp ? { xp: Number((xp[1] || xp[2]).replace(/,/g, '')) } : {}),
    skills: line(/^Skills\s+/) || '', senses: line(/^Senses\s+/) || '', languages: translate(line(/^Languages\s+/)),
    vulnerabilities: translate(line(/^(Damage )?Vulnerabilities\s+/)), resistances: translate(line(/^(Damage )?Resistances\s+/)),
    immunities: translate(line(/^(Damage )?Immunities\s+/)), conditionImmunities: translate(line(/^Condition Immunities\s+/)),
    traits, actions: [], bonusActions: [], reactions: [], legendary: []
  };
  for (let index = 1; index < sections.length; index += 2) {
    const key = ({ Actions: 'actions', 'Bonus Actions': 'bonusActions', Reactions: 'reactions', 'Legendary Actions': 'legendary' } as const)[sections[index] as 'Actions'];
    out[key] = entries(sections[index + 1] || '').map(entry => parseAction(makeId(), entry));
  }
  return out;
}
export function parseSpellDamage(text: string): Pick<Spell, 'damage' | 'attack' | 'save' | 'onSave' | 'conditions'> {
  const body = text.replace(/\s+/g, ' ');
  const damage: DamagePart[] = [];
  for (const match of body.matchAll(/(\d+d\d+(?:\s*\+\s*\d+)?) (\w+) damage/gi)) if (damage.length < 4) damage.push({ dice: match[1].replace(/\s+/g, ''), type: typeMap[match[2].toLowerCase()] || match[2] });
  const save = /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i.exec(body);
  const attack = /(melee|ranged) spell attack/i.exec(body);
  return { damage, attack: attack ? (attack[1].toLowerCase() === 'melee' ? 'melee' : 'ranged') : save ? 'save' : damage.length ? 'auto' : 'none', ...(save ? { save: saveMap[save[1].toLowerCase()] } : {}), ...(save ? { onSave: /half as much damage/i.test(body) ? 'half' as const : 'none' as const } : {}), conditions: [] };
}

export const rarities: { value: Item['rarity']; label: string }[] = [{ value: 'mundane', label: 'Обычный' }, { value: 'common', label: 'Простой' }, { value: 'uncommon', label: 'Необычный' }, { value: 'rare', label: 'Редкий' }, { value: 'very-rare', label: 'Очень редкий' }, { value: 'legendary', label: 'Легендарный' }, { value: 'artifact', label: 'Артефакт' }];
export const itemKinds: Item['kind'][] = ['armor', 'potion', 'scroll', 'ring', 'wand', 'wondrous', 'ammo', 'tool', 'gear', 'food', 'treasure'];
export function validItem(value: unknown): value is Item {
  const i = value as Item;
  return Boolean(i) && typeof i === 'object' && text(i.id, 100) && /^[\w-]{1,100}$/.test(i.id) && text(i.name, 100) && i.name.trim().length > 0 && itemKinds.includes(i.kind) && rarities.some(r => r.value === i.rarity) && typeof i.attunement === 'boolean'
    && Number.isFinite(i.price) && i.price >= 0 && i.price <= 1000000000 && ['cp', 'sp', 'ep', 'gp', 'pp'].includes(i.currency) && text(i.weight, 100) && text(i.icon, 40) && text(i.description, 3000) && text(i.effect, 20000) && text(i.notes, 10000)
    && validDamage(i.damage) && optionalText(i.heal, 50) && strings(i.conditions, 20, 100) && optionalInteger(i.charges, 0, 1000) && optionalInteger(i.ac, 0, 50) && (i.armorType === undefined || ['light', 'medium', 'heavy', 'shield'].includes(i.armorType))
    && optionalInteger(i.strength, 0, 30) && (i.stealth === undefined || typeof i.stealth === 'boolean') && optionalText(i.spell, 200) && optionalInteger(i.quantity, 1, 10000) && validEffects(i.effects);
}
export const blankItem = (id: string, kind: Item['kind'] = 'gear'): Item => ({ id, name: '', kind, rarity: 'mundane', attunement: false, price: 1, currency: 'gp', weight: '', icon: '', description: '', effect: '', notes: '', damage: [], conditions: [] });
export type ItemPreset = Partial<Item> & { name: string; kind: Item['kind'] };
export const itemPresets: ItemPreset[] = [
  { kind: 'armor', name: 'Стёганый доспех', armorType: 'light', ac: 11, stealth: true, price: 5, weight: '8 фнт.' }, { kind: 'armor', name: 'Кожаный доспех', armorType: 'light', ac: 11, price: 10, weight: '10 фнт.' }, { kind: 'armor', name: 'Проклёпанная кожа', armorType: 'light', ac: 12, price: 45, weight: '13 фнт.' },
  { kind: 'armor', name: 'Кольчужная рубаха', armorType: 'medium', ac: 13, price: 50, weight: '20 фнт.' }, { kind: 'armor', name: 'Чешуйчатый доспех', armorType: 'medium', ac: 14, stealth: true, price: 50, weight: '45 фнт.' }, { kind: 'armor', name: 'Полулаты', armorType: 'medium', ac: 15, stealth: true, price: 750, weight: '40 фнт.' },
  { kind: 'armor', name: 'Кольчуга', armorType: 'heavy', ac: 16, strength: 13, stealth: true, price: 75, weight: '55 фнт.' }, { kind: 'armor', name: 'Латы', armorType: 'heavy', ac: 18, strength: 15, stealth: true, price: 1500, weight: '65 фнт.' }, { kind: 'armor', name: 'Щит', armorType: 'shield', ac: 2, price: 10, weight: '6 фнт.', icon: 'shield' },
  { kind: 'potion', name: 'Зелье лечения', rarity: 'common', heal: '2d4+2', price: 50, weight: '0,5 фнт.' }, { kind: 'potion', name: 'Большое зелье лечения', rarity: 'uncommon', heal: '4d4+4', price: 150 }, { kind: 'potion', name: 'Превосходное зелье лечения', rarity: 'rare', heal: '8d4+8', price: 500 },
  { kind: 'potion', name: 'Противоядие', price: 50, icon: 'vial', effect: 'Преимущество на спасброски от яда на 1 час.' }, { kind: 'potion', name: 'Алхимический огонь', price: 50, icon: 'flask', damage: [{ dice: '1d4', type: 'огонь' }], effect: 'Бросок на 20 фт., цель горит до тушения.' },
  { kind: 'scroll', name: 'Свиток заклинания (заговор)', rarity: 'common', price: 30 }, { kind: 'scroll', name: 'Свиток заклинания (1 круг)', rarity: 'common', price: 60 }, { kind: 'scroll', name: 'Свиток заклинания (3 круг)', rarity: 'uncommon', price: 300 },
  { kind: 'ring', name: 'Кольцо защиты', rarity: 'rare', attunement: true, price: 3500, effect: '+1 к КД и спасброскам.' }, { kind: 'wand', name: 'Палочка волшебных стрел', rarity: 'uncommon', charges: 7, price: 500, damage: [{ dice: '1d4+1', type: 'силовое поле' }] }, { kind: 'wand', name: 'Посох', icon: 'staff', price: 5, weight: '4 фнт.' },
  { kind: 'wondrous', name: 'Сумка хранения', rarity: 'uncommon', price: 500, icon: 'bag', effect: 'Вмещает до 500 фнт., не тяжелее 15 фнт.' }, { kind: 'wondrous', name: 'Плащ эльфов', rarity: 'uncommon', attunement: true, icon: 'cloak', price: 500 }, { kind: 'wondrous', name: 'Амулет здоровья', rarity: 'rare', attunement: true, icon: 'amulet', price: 4000 }, { kind: 'wondrous', name: 'Сапоги эльфов', rarity: 'uncommon', icon: 'boots', price: 500 }, { kind: 'wondrous', name: 'Перчатки силы огра', rarity: 'uncommon', attunement: true, icon: 'gloves', price: 500 }, { kind: 'wondrous', name: 'Хрустальный шар', rarity: 'very-rare', attunement: true, icon: 'orb', price: 20000 },
  { kind: 'ammo', name: 'Стрелы (20)', price: 1, quantity: 20, weight: '1 фнт.' }, { kind: 'ammo', name: 'Арбалетные болты (20)', price: 1, quantity: 20, weight: '1,5 фнт.' },
  { kind: 'tool', name: 'Воровские инструменты', price: 25, icon: 'key' }, { kind: 'tool', name: 'Набор травника', price: 5 }, { kind: 'tool', name: 'Лютня', price: 35, icon: 'instrument', weight: '2 фнт.' }, { kind: 'tool', name: 'Игральные кости', price: 1, currency: 'sp', icon: 'gaming' }, { kind: 'tool', name: 'Инструменты кузнеца', price: 20 },
  { kind: 'gear', name: 'Набор путешественника', price: 10 }, { kind: 'gear', name: 'Верёвка (50 фт.)', price: 1, icon: 'rope', weight: '10 фнт.' }, { kind: 'gear', name: 'Факел', price: 1, currency: 'cp', icon: 'torch' }, { kind: 'gear', name: 'Фонарь', price: 5, icon: 'lantern' }, { kind: 'gear', name: 'Карта местности', price: 5, icon: 'map' },
  { kind: 'gear', name: 'Спальник', price: 1, icon: 'bedroll', weight: '7 фнт.' }, { kind: 'gear', name: 'Бурдюк', price: 2, currency: 'sp', icon: 'waterskin', weight: '5 фнт.' }, { kind: 'gear', name: 'Трутница', price: 5, currency: 'sp', icon: 'tinderbox', weight: '1 фнт.' }, { kind: 'gear', name: 'Колчан', price: 1, icon: 'quiver', weight: '1 фнт.' }, { kind: 'gear', name: 'Отличная одежда', price: 15, icon: 'clothes', weight: '6 фнт.' }, { kind: 'gear', name: 'Святой символ', price: 5, icon: 'holy-symbol', weight: '1 фнт.' },
  { kind: 'food', name: 'Дорожный паёк (1 день)', price: 5, currency: 'sp' }, { kind: 'food', name: 'Эль (кружка)', price: 4, currency: 'cp', icon: 'mug' }, { kind: 'food', name: 'Окорок', price: 5, currency: 'sp', icon: 'meat' },
  { kind: 'treasure', name: 'Драгоценный камень', price: 100, icon: 'gem' }, { kind: 'treasure', name: 'Сундук с монетами', price: 250, icon: 'chest' }, { kind: 'treasure', name: 'Золотая корона', price: 750, icon: 'crown' }
];

// ---- Skills: shared by the sheet editors and the LSS converter ----
export const skills: { id: string; label: string; en: string; ability: Ability }[] = [
  { id: 'acrobatics', label: 'Акробатика', en: 'Acrobatics', ability: 'dex' }, { id: 'animal', label: 'Уход за животными', en: 'Animal Handling', ability: 'wis' },
  { id: 'arcana', label: 'Магия', en: 'Arcana', ability: 'int' }, { id: 'athletics', label: 'Атлетика', en: 'Athletics', ability: 'str' },
  { id: 'deception', label: 'Обман', en: 'Deception', ability: 'cha' }, { id: 'history', label: 'История', en: 'History', ability: 'int' },
  { id: 'insight', label: 'Проницательность', en: 'Insight', ability: 'wis' }, { id: 'intimidation', label: 'Запугивание', en: 'Intimidation', ability: 'cha' },
  { id: 'investigation', label: 'Анализ', en: 'Investigation', ability: 'int' }, { id: 'medicine', label: 'Медицина', en: 'Medicine', ability: 'wis' },
  { id: 'nature', label: 'Природа', en: 'Nature', ability: 'int' }, { id: 'perception', label: 'Восприятие', en: 'Perception', ability: 'wis' },
  { id: 'performance', label: 'Выступление', en: 'Performance', ability: 'cha' }, { id: 'persuasion', label: 'Убеждение', en: 'Persuasion', ability: 'cha' },
  { id: 'religion', label: 'Религия', en: 'Religion', ability: 'int' }, { id: 'sleight', label: 'Ловкость рук', en: 'Sleight of Hand', ability: 'dex' },
  { id: 'stealth', label: 'Скрытность', en: 'Stealth', ability: 'dex' }, { id: 'survival', label: 'Выживание', en: 'Survival', ability: 'wis' }
];
const skillTokens = (value: string) => value.split(/\s*[,;]\s*/).map(item => item.trim()).filter(Boolean);
export type Profs = Record<string, 1 | 2>;

// Splits a skills string into known proficient skills and the remaining free text (armor, tools, odd bonuses).
export function parseSkills(value: string, scores: Record<string, number>, pb: number): { profs: Profs; extra: string } {
  const profs: Profs = {}; const extra: string[] = [];
  for (const token of skillTokens(value)) {
    const match = /^(.+?)\s*([+−-]\d+)$/.exec(token);
    const skill = match && skills.find(item => [item.label, item.en].some(name => name.toLowerCase() === match[1].trim().toLowerCase()));
    if (!match || !skill) { extra.push(token); continue; }
    const bonus = Number(match[2].replace('−', '-')); const mod = modifier(scores[skill.ability] ?? 10);
    if (bonus === mod + pb) profs[skill.id] = 1; else if (bonus === mod + 2 * pb) profs[skill.id] = 2; else extra.push(`${skill.label} ${signed(bonus)}`);
  }
  return { profs, extra: extra.join(', ') };
}
export function composeSkills(profs: Profs, extra: string, scores: Record<string, number>, pb: number) {
  return [...skills.filter(skill => profs[skill.id]).map(skill => `${skill.label} ${signed(modifier(scores[skill.ability] ?? 10) + pb * profs[skill.id])}`), ...skillTokens(extra)].join(', ');
}
export function skillBonus(id: string, profs: Profs, scores: Record<string, number>, pb: number) {
  const skill = skills.find(item => item.id === id)!;
  return modifier(scores[skill.ability] ?? 10) + pb * (profs[id] || 0);
}

export function validInventoryItem(value: unknown): value is InventoryItem {
  const i = value as InventoryItem;
  return Boolean(i) && typeof i === 'object' && text(i.id, 100) && /^[\w-]{1,100}$/.test(i.id) && (i.sourceId === undefined || text(i.sourceId, 100) && /^[\w-]{1,100}$/.test(i.sourceId)) && text(i.name, 100) && i.name.trim().length > 0
    && text(i.icon, 40) && (i.artwork === undefined || validArtwork(i.artwork)) && integer(i.quantity, 1, 100000) && text(i.description, 3000) && text(i.kind, 100)
    && (i.rarity === undefined || rarities.some(r => r.value === i.rarity)) && (i.equipped === undefined || typeof i.equipped === 'boolean') && validEffects(i.effects);
}
// Painted weapon icon picked from the name, falling back to bow or sword by range.
const weaponIcons: [RegExp, string][] = [[/заточк|shiv/i, 'shiv'], [/кирк|pickaxe/i, 'pickaxe'], [/кинжал|нож|dagger/i, 'dagger'], [/арбалет|crossbow/i, 'crossbow'], [/посох|staff/i, 'staff'], [/топор|секир|axe/i, 'axe'], [/булав|молот|кистен|дубин|mace|hammer/i, 'mace'], [/(^|\s)лук|bow/i, 'bow']];
const weaponIcon = (weapon: Weapon) => weaponIcons.find(([pattern]) => pattern.test(weapon.name))?.[1] || (weapon.range === 'ranged' ? 'bow' : 'sword');
// Builds an inventory tile from a library item or weapon; ids stay unique per copy.
export function inventoryFrom(source: Item | Weapon, id: string, quantity = 1, kindLabel = ''): InventoryItem {
  const weapon = !('kind' in source);
  return { id, sourceId: source.id, name: source.name.slice(0, 100), icon: weapon ? weaponIcon(source as Weapon) : (source as Item).icon || '', ...(!weapon && (source as Item).artwork ? { artwork: structuredClone((source as Item).artwork!) } : {}), quantity,
    description: (weapon ? [(source as Weapon).description, damageText((source as Weapon).damage)].filter(Boolean).join(' · ') : [(source as Item).description, (source as Item).effect].filter(Boolean).join(' · ')).slice(0, 3000), kind: (kindLabel || (weapon ? 'Оружие' : '')).slice(0, 100), ...(!weapon && (source as Item).rarity !== 'mundane' ? { rarity: (source as Item).rarity } : {}), ...(!weapon && (source as Item).effects?.length ? { effects: structuredClone((source as Item).effects!) } : {}) };
}
// Adds a tile to a list, stacking with an identical item from the same source.
export function stackInto(list: InventoryItem[], item: InventoryItem): InventoryItem[] {
  const same = list.find(entry => entry.name === item.name && (entry.sourceId || '') === (item.sourceId || '') && !entry.equipped);
  if (same) return list.map(entry => entry === same ? { ...entry, quantity: Math.min(100000, entry.quantity + item.quantity) } : entry);
  return [...list, item];
}
export const itemKindLabels: Record<Item['kind'] | 'weapon', string> = { weapon: 'Оружие', armor: 'Доспехи и щиты', potion: 'Зелья', scroll: 'Свитки', ring: 'Кольца', wand: 'Жезлы и посохи', wondrous: 'Чудесные предметы', ammo: 'Боеприпасы', tool: 'Инструменты', gear: 'Снаряжение', food: 'Еда и припасы', treasure: 'Сокровища' };

// --- Item effects: small rule blocks applied to a hero while the item is equipped. ---
export const effectStats: { value: EffectStat; label: string; short: string }[] = [
  ...abilities.map(item => ({ value: item.key as EffectStat, label: item.label, short: item.short })),
  { value: 'ac', label: 'Класс доспеха', short: 'КД' }, { value: 'speed', label: 'Скорость', short: 'Скорость' },
  { value: 'initiative', label: 'Инициатива', short: 'Инициатива' }, { value: 'saves', label: 'Все спасброски', short: 'Спасброски' }
];
// Number verbs, in the order they are applied: floor → bonus → multiply → ceiling → exact value.
export const statOps: { value: StatEffect['op']; label: string; hint: string }[] = [
  { value: 'add', label: 'получает', hint: 'прибавляет или отнимает' },
  { value: 'set', label: 'не ниже', hint: 'поднимает до значения, если ниже' },
  { value: 'mul', label: 'умножает', hint: 'например, скорость ×2' },
  { value: 'cap', label: 'не выше', hint: 'ограничивает сверху' },
  { value: 'fix', label: 'фиксирует', hint: 'ровно это значение, что бы ни было' }
];
export const senses = ['Тёмное зрение', 'Слепое зрение', 'Чувство вибрации', 'Истинное зрение'];
export const advantageTargets = ['спасброски Силы', 'спасброски Ловкости', 'спасброски Телосложения', 'спасброски Интеллекта', 'спасброски Мудрости', 'спасброски Харизмы', 'все спасброски', 'проверки Внимательности', 'проверки Скрытности', 'проверки Атлетики', 'проверки Акробатики', 'атаки', 'инициатива', 'спасброски от магии', 'спасброски от яда'];
export const traitKinds: { value: TraitEffect['trait']; label: string; text: string; group: 'defense' | 'luck' | 'sense' }[] = [
  { value: 'resist', label: 'сопротивляется', text: 'Сопротивление', group: 'defense' },
  { value: 'immune', label: 'неуязвим к урону', text: 'Иммунитет', group: 'defense' },
  { value: 'vulnerable', label: 'уязвим к', text: 'Уязвимость', group: 'defense' },
  { value: 'condition', label: 'не подвержен', text: 'Иммунитет к состоянию', group: 'defense' },
  { value: 'advantage', label: 'с преимуществом на', text: 'Преимущество', group: 'luck' },
  { value: 'disadvantage', label: 'с помехой на', text: 'Помеха', group: 'luck' },
  { value: 'sense', label: 'видит', text: '', group: 'sense' }
];
export const traitOptions = (trait: TraitEffect['trait']) => trait === 'condition' ? conditions : trait === 'sense' ? senses : trait === 'advantage' || trait === 'disadvantage' ? advantageTargets : damageTypes;
export const isStatEffect = (effect: Effect): effect is StatEffect => 'stat' in effect;
export const effectGroup = (effect: Effect) => isStatEffect(effect) ? 'number' : traitKinds.find(item => item.value === effect.trait)?.group || 'defense';
const effectAliases: [EffectStat, RegExp][] = [
  ['str', /^(сил|str)/], ['dex', /^(ловк|dex)/], ['con', /^(тел|con)/], ['int', /^(инт|int)/], ['wis', /^(мудр|мдр|wis)/], ['cha', /^(хар|cha)/],
  ['ac', /^(кд|класс|броня|ac$|armou?r)/], ['speed', /^(скор|speed)/], ['initiative', /^(иниц|init)/], ['saves', /^(спас|sav)/]
];
const effectLimit = (stat: EffectStat) => stat === 'speed' ? 1000 : stat === 'ac' ? 50 : 30;
const effectFloor = (stat: EffectStat, op: StatEffect['op']) => op === 'add' ? -effectLimit(stat) : op === 'mul' ? 0 : abilities.some(item => item.key === stat) && op === 'fix' ? 1 : stat === 'initiative' || stat === 'saves' ? -effectLimit(stat) : 0;
export const effectRange = (stat: EffectStat, op: StatEffect['op']) => op === 'mul' ? [0, 4] : [effectFloor(stat, op), effectLimit(stat)];
export function validEffect(value: unknown): value is Effect {
  const e = value as Effect;
  if (!e || typeof e !== 'object') return false;
  if ('trait' in e) return traitKinds.some(item => item.value === e.trait) && text(e.what, 60) && traitOptions(e.trait).includes(e.what)
    && (e.trait === 'sense' ? integer(e.value, 5, 1000) : e.value === undefined);
  const [min, max] = effectRange(e.stat, e.op ?? 'add');
  return effectStats.some(item => item.value === e.stat) && statOps.some(item => item.value === e.op) && integer(e.value, min, max)
    && (e.max === undefined || (e.op === 'add' && integer(e.max, 0, effectLimit(e.stat))));
}
export const validEffects = (value: unknown) => value === undefined || (Array.isArray(value) && value.length <= 20 && value.every(validEffect));
export function effectText(effect: Effect) {
  if (!isStatEffect(effect)) {
    if (effect.trait === 'sense') return `${effect.what} ${effect.value} фт.`;
    return `${traitKinds.find(item => item.value === effect.trait)?.text}: ${effect.what}`;
  }
  const label = effectStats.find(item => item.value === effect.stat)?.label || effect.stat;
  if (effect.op === 'set') return `${label} не ниже ${effect.value}`;
  if (effect.op === 'fix') return `${label} ровно ${effect.value}`;
  if (effect.op === 'cap') return `${label} не выше ${effect.value}`;
  if (effect.op === 'mul') return `${label} ×${effect.value}`;
  return `${label} ${signed(effect.value)}${effect.max !== undefined ? ` (макс. ${effect.max})` : ''}`;
}
// Plain-language reading of a block, shown under it in the editor.
export function effectSentence(effect: Effect) {
  if (!isStatEffect(effect)) {
    if (effect.trait === 'sense') return `Герой получает ${effect.what.toLowerCase()} на ${effect.value} фт.`;
    if (effect.trait === 'condition') return `Состояние «${effect.what}» на героя не действует.`;
    if (effect.trait === 'advantage' || effect.trait === 'disadvantage') return `${effect.what[0].toUpperCase()}${effect.what.slice(1)} — с ${effect.trait === 'advantage' ? 'преимуществом' : 'помехой'}.`;
    return `Урон типа «${effect.what}» ${effect.trait === 'resist' ? 'уменьшается вдвое' : effect.trait === 'immune' ? 'не проходит' : 'удваивается'}.`;
  }
  const label = effectStats.find(item => item.value === effect.stat)?.label || effect.stat;
  // Russian agreement: «Сила равна», «Интеллект равен», «Телосложение равно», «спасброски равны».
  const form = effect.stat === 'saves' ? 3 : effect.stat === 'con' ? 2 : effect.stat === 'int' || effect.stat === 'ac' ? 1 : 0;
  const verb = (singular: string, plural: string) => form === 3 ? plural : singular;
  const equal = ['равна', 'равен', 'равно', 'равны'][form];
  if (effect.op === 'set') return `${label} ${verb('поднимается', 'поднимаются')} до ${effect.value}, если сейчас ниже.`;
  if (effect.op === 'fix') return `${label} всегда ${equal} ${effect.value}, что бы ни давали другие предметы.`;
  if (effect.op === 'cap') return `${label} не ${verb('может', 'могут')} быть больше ${effect.value}.`;
  if (effect.op === 'mul') return effect.value === 0 ? `${label} ${verb('обнуляется', 'обнуляются')}.` : `${label} ${verb('умножается', 'умножаются')} на ${effect.value}.`;
  return `${label} ${effect.value >= 0 ? verb('увеличивается', 'увеличиваются') : verb('уменьшается', 'уменьшаются')} на ${Math.abs(effect.value)}${effect.max !== undefined ? `, но не выше ${effect.max}` : ''}.`;
}
// Accepts «персонаж -> получает -> ловкость -> +2 -> макс 21», «Сила = 19», «КД +1», «фиксирует силу 8», «сопротивление огонь», «тёмное зрение 60».
export function parseEffect(source: string): Effect | null {
  const line = source.toLowerCase().replace(/ё/g, 'е').trim();
  const find = (list: string[]) => list.find(item => line.includes(item.toLowerCase().replace(/ё/g, 'е')));
  const traitRules: [TraitEffect['trait'], RegExp][] = [['condition', /иммунитет к состоян|не подвержен/], ['resist', /сопротивл/], ['vulnerable', /уязвим/], ['immune', /иммун|неуязвим/], ['advantage', /преимуществ/], ['disadvantage', /помех/]];
  const sense = find(senses);
  if (sense) { const feet = Number(/(\d+)/.exec(line)?.[1] ?? 60); const effect: TraitEffect = { trait: 'sense', what: sense, value: feet }; return validEffect(effect) ? effect : null; }
  for (const [trait, pattern] of traitRules) if (pattern.test(line)) {
    const kind = trait === 'immune' && !find(damageTypes) && find(conditions) ? 'condition' : trait;
    const effect: TraitEffect = { trait: kind, what: find(traitOptions(kind)) || '' };
    return validEffect(effect) ? effect : null;
  }
  const words = line.replace(/[→>]|-(?=>)/g, ' ').replace(/[(),;:]/g, ' ').replace(/[×x*](\d)/g, ' × $1').split(/\s+/).filter(Boolean);
  let op: StatEffect['op'] | '' = ''; let stat: EffectStat | '' = ''; let value: number | undefined; let max: number | undefined; let signedValue = false;
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    if (/^(получает|gets|gains|бонус)$/.test(word)) op = 'add';
    else if (/^(=|становится|устанавливает|ставит|ниже|becomes|sets?)$/.test(word)) op = 'set';
    else if (/^(фиксирует|ровно|равна?|fix(es)?)$/.test(word)) op = 'fix';
    else if (/^(ограничивает|выше|cap)$/.test(word)) op = 'cap';
    else if (/^(×|умножает|удваивает|double)$/.test(word)) { op = 'mul'; if (word === 'удваивает' || word === 'double') value = 2; }
    else if (/^(макс|максимум|max|до)\.?$/.test(word)) { const next = Number((words[index + 1] || '').replace('−', '-')); if (Number.isFinite(next)) { max = next; index++; } }
    else if (/^[+−-]?\d+$/.test(word)) { if (value === undefined) { value = Number(word.replace('−', '-')); signedValue = /^[+−-]/.test(word); } }
    else if (!stat) { const found = effectAliases.find(([, pattern]) => pattern.test(word)); if (found) stat = found[0]; }
  }
  if (!stat || value === undefined) return null;
  const effect: StatEffect = { stat, op: op || (signedValue || !abilities.some(item => item.key === stat) ? 'add' : 'set'), value };
  if (effect.op === 'add' && max !== undefined) effect.max = max;
  return validEffect(effect) ? effect : null;
}
export type EffectSource = { id: string; effects?: Effect[] };
// Library entries win over the copy stored in the inventory, so editing an item updates heroes who already carry it.
export function itemEffects(item: InventoryItem, library: EffectSource[] = []): Effect[] {
  const source = item.sourceId ? library.find(entry => entry.id === item.sourceId) : undefined;
  return (source?.effects ?? item.effects) || [];
}
export type HeroBase = { abilities?: Record<string, number>; ac: number; speed?: number; initiative?: number; items?: InventoryItem[] };
export type EffectiveStats = { abilities: Record<Ability, number>; ac: number; speed: number; initiative: number; saves: number; active: { item: string; effect: Effect }[]; traits: { item: string; effect: TraitEffect }[]; changed: Partial<Record<EffectStat, number>> };
export function effectiveStats(game: HeroBase, library: EffectSource[] = []): EffectiveStats {
  const active = (game.items || []).filter(item => item.equipped).flatMap(item => itemEffects(item, library).map(effect => ({ item: item.name, effect })));
  const numbers = active.flatMap(({ effect }) => isStatEffect(effect) ? [effect] : []);
  const apply = (stat: EffectStat, base: number, min = 0, top = stat === 'speed' ? 10000 : 50) => {
    const rules = numbers.filter(effect => effect.stat === stat); const of = (op: StatEffect['op']) => rules.filter(effect => effect.op === op);
    let result = base;
    for (const effect of of('set')) result = Math.max(result, effect.value);
    for (const effect of of('add')) { const next = result + effect.value; result = effect.max === undefined || effect.value < 0 ? next : Math.max(result, Math.min(next, effect.max)); }
    for (const effect of of('mul')) result *= effect.value;
    for (const effect of of('cap')) result = Math.min(result, effect.value);
    const fixed = of('fix'); if (fixed.length) result = fixed[fixed.length - 1].value;
    return Math.max(min, Math.min(top, result));
  };
  const scores = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...game.abilities } as Record<Ability, number>;
  const traits = active.flatMap(({ item, effect }) => isStatEffect(effect) ? [] : [{ item, effect }]);
  const result: EffectiveStats = { abilities: { ...scores }, ac: apply('ac', game.ac), speed: apply('speed', game.speed ?? 30), initiative: 0, saves: apply('saves', 0, -50), active, traits, changed: {} };
  for (const { key } of abilities) result.abilities[key] = apply(key as EffectStat, scores[key], 1, 30);
  result.initiative = apply('initiative', game.initiative ?? modifier(result.abilities.dex), -50);
  const before: Record<EffectStat, number> = { ...scores, ac: game.ac, speed: game.speed ?? 30, initiative: game.initiative ?? modifier(scores.dex), saves: 0 };
  const after: Record<EffectStat, number> = { ...result.abilities, ac: result.ac, speed: result.speed, initiative: result.initiative, saves: result.saves };
  for (const { value } of effectStats) if (after[value] !== before[value]) result.changed[value] = after[value] - before[value];
  return result;
}
