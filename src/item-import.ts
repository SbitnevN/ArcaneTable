import { newId, type DamagePart, type Item, type ItemKind, type Rarity, type Weapon } from './contracts.js';
import { blankItem, blankWeapon, conditions as conditionList, itemKindLabels, parseEffect, validDice, validEffect, validItem, validWeapon, weaponProperties } from './library.js';
import type { Effect } from './contracts.js';

// Effects come as structured objects (our export) or short rules like «Ловкость +2 макс 20».
function effects(value: unknown): Effect[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[;\n]/) : [];
  return list.map(entry => typeof entry === 'string' ? parseEffect(entry) : entry && typeof entry === 'object' ? ('stat' in entry && !('op' in entry) ? { ...entry, op: 'add' } : entry) as Effect : null).filter((entry): entry is Effect => Boolean(entry) && validEffect(entry)).slice(0, 20);
}

// Lenient JSON import for items generated elsewhere (another AI, a spreadsheet): Russian or English values are accepted.
const kindWords: [RegExp, ItemKind | 'weapon'][] = [
  [/^(weapon|оруж|меч|топор|лук|кинжал|арбалет)/i, 'weapon'], [/^(armou?r|shield|доспех|брон|щит)/i, 'armor'], [/^(potion|зель|эликсир)/i, 'potion'], [/^(scroll|свит)/i, 'scroll'],
  [/^(ring|кольц)/i, 'ring'], [/^(wand|staff|rod|жезл|посох|палоч)/i, 'wand'], [/^(wondrous|чудес|магич|артефакт)/i, 'wondrous'], [/^(ammo|ammunition|боепр|стрел|болт)/i, 'ammo'],
  [/^(tool|инстр)/i, 'tool'], [/^(gear|equipment|снаряж|прочее)/i, 'gear'], [/^(food|еда|припас|провиз|напит)/i, 'food'], [/^(treasure|gem|сокров|драгоц|монет)/i, 'treasure']
];
const rarityWords: [RegExp, Rarity][] = [[/^(mundane|обычн|немагич)/i, 'mundane'], [/^(common|прост)/i, 'common'], [/^(uncommon|необычн)/i, 'uncommon'], [/^(very[ -]?rare|очень)/i, 'very-rare'], [/^(rare|редк)/i, 'rare'], [/^(legendary|легенд)/i, 'legendary'], [/^(artifact|артефакт)/i, 'artifact']];
const currencyWords: Record<string, Item['currency']> = { cp: 'cp', 'мм': 'cp', sp: 'sp', 'см': 'sp', ep: 'ep', 'эм': 'ep', gp: 'gp', 'зм': 'gp', pp: 'pp', 'пм': 'pp' };
const armorWords: [RegExp, NonNullable<Item['armorType']>][] = [[/^(light|лёгк|легк)/i, 'light'], [/^(medium|средн)/i, 'medium'], [/^(heavy|тяж)/i, 'heavy'], [/^(shield|щит)/i, 'shield']];
const str = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : typeof value === 'number' ? String(value).slice(0, max) : '';
const int = (value: unknown, min: number, max: number) => { const n = Math.floor(Number(value)); return Number.isFinite(n) && value !== '' && value !== null && value !== undefined ? Math.max(min, Math.min(max, n)) : undefined; };
const pick = <T,>(value: unknown, words: [RegExp, T][]) => { const text = str(value, 60); return text ? words.find(([pattern]) => pattern.test(text))?.[1] : undefined; };

export function parseDamage(value: unknown): DamagePart[] {
  const parts: DamagePart[] = [];
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/\s*(?:\+\s*(?=\d+[dк])|,|;)\s*/) : [];
  for (const entry of list.slice(0, 10)) {
    if (entry && typeof entry === 'object') { const dice = str((entry as { dice?: unknown }).dice, 50).replace(/к/gi, 'd'); if (validDice(dice)) parts.push({ dice, type: str((entry as { type?: unknown }).type, 50) }); continue; }
    const match = /^(\d+[dк]\d+(?:\s*[+-]\s*\d+)?)\s*(.*)$/i.exec(str(entry, 100));
    if (match) { const dice = match[1].replace(/к/gi, 'd').replace(/\s+/g, ''); if (validDice(dice)) parts.push({ dice, type: match[2].slice(0, 50) }); }
  }
  return parts;
}
function price(raw: Record<string, unknown>) {
  const text = str(raw.price ?? raw.cost ?? raw['цена'], 50);
  const match = /^([\d\s.,]+)\s*(мм|см|эм|зм|пм|cp|sp|ep|gp|pp)?/i.exec(text);
  const amount = match ? Number(match[1].replace(/\s/g, '').replace(',', '.')) : 0;
  const currency = currencyWords[str(raw.currency ?? raw['валюта'], 5).toLowerCase()] || (match?.[2] ? currencyWords[match[2].toLowerCase()] : undefined) || 'gp';
  return { price: Number.isFinite(amount) && amount >= 0 ? Math.min(1000000000, Math.round(amount * 100) / 100) : 0, currency };
}
const strings = (value: unknown, allowed?: string[]) => (Array.isArray(value) ? value : typeof value === 'string' ? value.split(/\s*[,;]\s*/) : []).map(item => str(item, 100)).filter(Boolean).filter(item => !allowed || allowed.includes(item.toLowerCase())).map(item => item.toLowerCase()).slice(0, 20);

export type ImportResult = { items: Item[]; weapons: Weapon[]; errors: string[] };
export function parseItemJson(input: unknown, source = 'файл'): ImportResult {
  const list = Array.isArray(input) ? input : input && typeof input === 'object' && Array.isArray((input as { items?: unknown }).items) ? (input as { items: unknown[] }).items : input && typeof input === 'object' ? [input] : [];
  const result: ImportResult = { items: [], weapons: [], errors: [] };
  if (!list.length) result.errors.push(`${source}: нет предметов — ожидается объект, массив или { "items": [...] }`);
  list.slice(0, 2000).forEach((value, index) => {
    const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
    const label = `${source} #${index + 1}`;
    const name = str(raw.name ?? raw['название'], 100);
    if (!name) { result.errors.push(`${label}: нет названия`); return; }
    const kind = pick(raw.kind ?? raw.type ?? raw.category ?? raw['тип'] ?? raw['категория'], kindWords) || (raw.damage && (raw.properties || raw.range) ? 'weapon' : 'gear');
    const { price: amount, currency } = price(raw);
    const description = str(raw.description ?? raw['описание'], 3000);
    const effect = str(raw.effect ?? raw['эффект'], 20000);
    if (kind === 'weapon') {
      const weapon: Weapon = { ...blankWeapon(newId()), name, category: /simple|прост/i.test(str(raw.category ?? raw.weaponCategory, 30)) ? 'simple' : /magic|магич|особ/i.test(str(raw.category ?? raw.weaponCategory, 30)) ? 'magic' : 'martial',
        range: /ranged|дальн|стрел/i.test(str(raw.range, 30)) || /лук|арбалет|bow/i.test(name) ? 'ranged' : 'melee', damage: parseDamage(raw.damage ?? raw['урон']), properties: strings(raw.properties ?? raw['свойства'], weaponProperties),
        ...(str(raw.versatile, 50) && validDice(str(raw.versatile, 50).replace(/к/gi, 'd')) ? { versatile: str(raw.versatile, 50).replace(/к/gi, 'd') } : {}), ...(str(raw.distance, 200) ? { distance: str(raw.distance, 200) } : {}),
        ...(str(raw.mastery, 200) ? { mastery: str(raw.mastery, 200) } : {}), ...(int(raw.bonus, 0, 10) ? { bonus: int(raw.bonus, 0, 10) } : {}), ...(str(raw.weight, 200) ? { weight: str(raw.weight, 200) } : {}),
        ...(amount ? { cost: `${amount} ${({ cp: 'мм', sp: 'см', ep: 'эм', gp: 'зм', pp: 'пм' })[currency]}` } : {}), conditions: strings(raw.conditions ?? raw['состояния'], conditionList), effect, description };
      if (validWeapon(weapon)) result.weapons.push(weapon); else result.errors.push(`${label} «${name}»: не прошло проверку`);
      return;
    }
    const item: Item = { ...blankItem(newId(), kind), name, rarity: pick(raw.rarity ?? raw['редкость'], rarityWords) || 'mundane', attunement: Boolean(raw.attunement ?? raw['настройка']), price: amount, currency,
      weight: str(raw.weight ?? raw['вес'], 100), icon: /^[a-z-]{1,40}$/.test(str(raw.icon, 40)) ? str(raw.icon, 40) : '', description, effect, notes: str(raw.notes ?? raw['заметки'], 10000),
      damage: parseDamage(raw.damage ?? raw['урон']), conditions: strings(raw.conditions ?? raw['состояния'], conditionList) };
    const heal = str(raw.heal ?? raw['лечение'], 50).replace(/к/gi, 'd').replace(/\s+/g, '');
    if (heal && validDice(heal)) item.heal = heal;
    const extra: Partial<Item> = { charges: int(raw.charges ?? raw['заряды'], 0, 1000), ac: int(raw.ac ?? raw['кд'], 0, 50), strength: int(raw.strength, 0, 30), quantity: int(raw.quantity ?? raw['количество'], 1, 10000), spell: str(raw.spell ?? raw['заклинание'], 200) || undefined, armorType: pick(raw.armorType ?? raw['типДоспеха'], armorWords) };
    if (raw.stealth !== undefined) extra.stealth = Boolean(raw.stealth);
    const rules = effects(raw.effects ?? raw['эффекты']); if (rules.length) extra.effects = rules;
    for (const [key, value] of Object.entries(extra)) if (value !== undefined) Object.assign(item, { [key]: value });
    if (validItem(item)) result.items.push(item); else result.errors.push(`${label} «${name}»: не прошло проверку`);
  });
  return result;
}

// Same shape the importer reads, so exported files can be edited and imported back.
export function exportItemJson(items: Item[], weapons: Weapon[]) {
  return JSON.stringify({ items: [
    ...items.map(({ id: _id, artwork: _art, kind, ...item }) => ({ ...item, type: itemKindLabels[kind], damage: item.damage.map(part => `${part.dice} ${part.type}`.trim()).join(' + ') || undefined })),
    ...weapons.map(({ id: _id, damage: parts, ...weapon }) => ({ ...weapon, type: 'Оружие', damage: parts.map(part => `${part.dice} ${part.type}`.trim()).join(' + ') }))
  ] }, null, 2);
}

export const itemJsonPrompt = `Сгенерируй предметы для D&D 5e в формате JSON — массив объектов. Поля (необязательные можно пропускать):
{
  "name": "Название",                       // обязательно
  "type": "оружие | доспех | зелье | свиток | кольцо | жезл | чудесный | боеприпасы | инструмент | снаряжение | еда | сокровище",
  "rarity": "обычный | простой | необычный | редкий | очень редкий | легендарный | артефакт",
  "attunement": true,                        // требует настройки
  "price": 500, "currency": "зм",            // мм, см, эм, зм, пм
  "weight": "3 фнт.",
  "description": "Короткое описание для игроков",
  "effect": "Правила и эффект",
  "damage": "1d8 рубящий + 1d6 огонь",       // урон кубами
  "heal": "2d4+2",                           // для зелий
  "conditions": ["отравлен"],                // ослеплён, очарован, оглушён, испуган, схвачен, недееспособен, невидим, парализован, окаменён, отравлен, сбит с ног, опутан, ошеломлён, без сознания, истощение
  "ac": 16, "armorType": "лёгкий | средний | тяжёлый | щит", "strength": 13, "stealth": true,   // для доспехов
  "charges": 7, "spell": "Огненный шар", "quantity": 20,
  "properties": ["фехтовальное", "универсальное"], "range": "ближний | дальний", "distance": "80/320 фт.", "versatile": "1d10", "bonus": 1,   // для оружия
  "effects": ["Ловкость +2 макс 20", "КД +1", "Сила = 19", "фиксирует силу 8", "скорость ×2", "скорость не выше 20", "сопротивление огонь", "иммунитет яд", "иммунитет к отравлен", "преимущество на спасброски Ловкости", "тёмное зрение 60"],   // пока экипирован
  "icon": "sword"                            // необязательно: sword, axe, bow, dagger, crossbow, mace, armor, shield, helmet, cloak, boots, gloves, potion, vial, flask, scroll, book, orb, ring, amulet, wand, staff, gem, crown, ammo, tools, backpack, rope, torch, lantern, food, bag, coins, chest, mug, meat, key, map, clothes, bedroll, waterskin, tinderbox, gaming, instrument, holy-symbol, quiver, collar, manacles, ember, keyring, pickaxe, shiv, blanket, bottle, letter, ticket
}
Ответь только JSON без пояснений.`;
