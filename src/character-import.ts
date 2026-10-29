import { characters, newId, validGame, type Ability, type Action, type Block, type Character, type Effect, type Feature, type Game, type InventoryItem, type Item, type Spell, type SpellSlot, type Weapon } from './contracts.js';
import { parseDamage, parseItemJson } from './item-import.js';
import { blankSpell, composeSkills, conditions as conditionList, inventoryFrom, itemEffects, itemKindLabels, modifier, parseSkills, proficiency, rarities, skills, validAction, validDice, validFeature, validSpell, type Profs } from './library.js';

// «Arcane character» JSON: one hero with stats, attacks, spells and items (with effects), written by hand or by an AI.
export const characterFormat = 'arcane-character';
type Raw = Record<string, unknown>;
const object = (value: unknown): Raw => value && typeof value === 'object' && !Array.isArray(value) ? value as Raw : {};
const str = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : typeof value === 'number' ? String(value).slice(0, max) : '';
const int = (value: unknown) => { const n = typeof value === 'string' ? Number.parseInt(value.replace('−', '-'), 10) : Number(value); return Number.isFinite(n) && value !== '' && value !== null && value !== undefined ? Math.round(n) : undefined; };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const field = (raw: Raw, ...keys: string[]) => keys.map(key => raw[key]).find(value => value !== undefined && value !== null && value !== '');
const list = (value: unknown) => Array.isArray(value) ? value : typeof value === 'string' ? value.split(/\s*[;\n]\s*|,\s*(?![^(]*\))/).filter(Boolean) : [];
const abilityWords: [Ability, RegExp][] = [['str', /^(str|сил)/i], ['dex', /^(dex|лов)/i], ['con', /^(con|тел)/i], ['int', /^(int|инт)/i], ['wis', /^(wis|мдр|мудр)/i], ['cha', /^(cha|хар)/i]];
const abilityOf = (value: unknown) => { const text = str(value, 40); return text ? abilityWords.find(([, pattern]) => pattern.test(text))?.[0] : undefined; };
const actionWords: [RegExp, Action['kind']][] = [[/^(melee|ближн|вблиз|рукопаш)/i, 'melee'], [/^(ranged|дальн|стрел)/i, 'ranged'], [/^(spell|заклин|магич)/i, 'spell'], [/^(save|спас)/i, 'save'], [/^(other|особ|прочее)/i, 'other']];

function abilities(value: unknown, warnings: string[]) {
  const scores: Record<Ability, number> = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  const found = new Set<Ability>();
  for (const [key, raw] of Object.entries(object(value))) {
    const ability = abilityOf(key); const score = int(typeof raw === 'object' ? object(raw).score ?? object(raw).value : raw);
    if (ability && score !== undefined) { scores[ability] = clamp(score, 1, 30); found.add(ability); }
  }
  if (found.size < 6) warnings.push(`Не все характеристики указаны: недостающие равны 10 (${abilityWords.filter(([key]) => !found.has(key)).map(([key]) => key.toUpperCase()).join(', ')}).`);
  return scores;
}
// Skills arrive as names («Атлетика», «Скрытность (эксперт)») or ready bonuses («Восприятие +5»).
function skillText(value: unknown, extra: unknown, scores: Record<string, number>, pb: number) {
  const profs: Profs = {}; const rest: string[] = []; const bonuses: string[] = [];
  for (const entry of list(value).slice(0, 60)) {
    const token = str(typeof entry === 'object' ? object(entry).name : entry, 100);
    const expert = /\((эксперт|экспертиза|expert(ise)?)\)|\s(×2|x2)$/i.test(token);
    const name = token.replace(/\s*\((эксперт|экспертиза|expert(ise)?|владение|proficient)\)|\s(×2|x2)$/gi, '').trim().toLowerCase();
    const skill = skills.find(item => [item.label, item.en].some(label => label.toLowerCase() === name));
    const level = expert || typeof entry === 'object' && /expert|эксперт/i.test(str(object(entry).level, 30)) ? 2 : 1;
    if (skill) profs[skill.id] = Math.max(profs[skill.id] || 0, level) as 1 | 2;
    else if (/[+−-]\d+$/.test(token)) bonuses.push(token); else if (token) rest.push(token);
  }
  const parsed = parseSkills(bonuses.join(', '), scores, pb);
  return composeSkills({ ...parsed.profs, ...profs }, [parsed.extra, ...rest, ...list(extra).map(item => str(item, 200))].filter(Boolean).join(', '), scores, pb).slice(0, 2000);
}
function attacks(value: unknown, warnings: string[]): Action[] {
  return list(value).slice(0, 60).flatMap((entry, index) => {
    const raw = object(entry); const name = str(field(raw, 'name', 'название'), 200) || (typeof entry === 'string' ? str(entry, 200) : '');
    if (!name) return [];
    const kindText = str(field(raw, 'type', 'kind', 'тип'), 40);
    const save = abilityOf(field(raw, 'save', 'спасбросок'));
    const kind = actionWords.find(([pattern]) => pattern.test(kindText))?.[1] || (save ? 'save' : /\d+\s*\/\s*\d+/.test(str(raw.reach ?? raw.distance, 100)) ? 'ranged' : 'melee');
    const bonus = int(field(raw, 'bonus', 'attackBonus', 'бонус')); const dc = int(field(raw, 'dc', 'сл'));
    const action: Action = { id: newId(), name, kind, ...(bonus !== undefined ? { bonus: clamp(bonus, -50, 50) } : {}), ...(dc !== undefined ? { dc: clamp(dc, 0, 50) } : {}), ...(save ? { save } : {}),
      reach: str(field(raw, 'reach', 'distance', 'range', 'дистанция', 'досягаемость'), 200), damage: parseDamage(field(raw, 'damage', 'урон')),
      ...(save ? { onSave: /half|полов/i.test(str(field(raw, 'onSave', 'приУспехе'), 40)) ? 'half' as const : 'none' as const } : {}), conditions: [], effect: str(field(raw, 'effect', 'description', 'эффект', 'описание'), 20000) };
    if (validAction(action)) return [action];
    warnings.push(`Атака #${index + 1} «${name}» пропущена: проверьте бонус, СЛ и урон.`); return [];
  });
}
function features(value: unknown): Feature[] {
  return list(value).slice(0, 100).flatMap(entry => {
    const raw = object(entry); const line = typeof entry === 'string' ? entry : '';
    const split = /^([^:.]{1,200})[:.]\s*(.*)$/s.exec(line);
    const feature = { id: newId(), name: str(field(raw, 'name', 'название'), 200) || str(split?.[1] ?? line, 200), text: str(field(raw, 'text', 'description', 'описание', 'effect'), 20000) || str(split?.[2] ?? '', 20000) };
    return feature.name && validFeature(feature) ? [feature] : [];
  });
}
const spellNames = (value: unknown) => [...new Set(list(value).map(entry => str(typeof entry === 'object' ? object(entry).name ?? object(entry)['название'] : entry, 500)).filter(Boolean))].slice(0, 1000);
function coins(value: unknown) {
  const result: Partial<Record<'cp' | 'sp' | 'ep' | 'gp' | 'pp', number>> = {};
  const words: Record<string, keyof typeof result> = { cp: 'cp', 'мм': 'cp', sp: 'sp', 'см': 'sp', ep: 'ep', 'эм': 'ep', gp: 'gp', 'зм': 'gp', pp: 'pp', 'пм': 'pp' };
  const add = (key: string, amount: unknown) => { const coin = words[key.toLowerCase()]; const n = int(amount); if (coin && n !== undefined) result[coin] = clamp((result[coin] || 0) + n, 0, 100000000); };
  if (typeof value === 'string') for (const match of value.matchAll(/(\d[\d\s]*)\s*(мм|см|эм|зм|пм|cp|sp|ep|gp|pp)/gi)) add(match[2], match[1].replace(/\s/g, ''));
  else for (const [key, amount] of Object.entries(object(value))) add(key, amount);
  return result;
}
function notes(raw: Raw): Block[] {
  const blocks: Block[] = [];
  const add = (title: string, text: string, secret = false) => { if (text && blocks.length < 50) blocks.push({ id: newId(), kind: secret ? 'spoiler' : 'text', title: title.slice(0, 500) || 'Заметка', text: text.slice(0, 50000) }); };
  add('История', str(field(raw, 'backstory', 'история', 'biography'), 50000));
  add('Внешность', str(field(raw, 'appearance', 'внешность'), 50000));
  add('Характер', str(field(raw, 'personality', 'характер'), 50000));
  for (const entry of list(field(raw, 'notes', 'заметки'))) {
    if (typeof entry === 'string') { add('Заметка', str(entry, 50000)); continue; }
    const note = object(entry); add(str(field(note, 'title', 'заголовок', 'name'), 500), str(field(note, 'text', 'текст'), 50000), Boolean(note.secret ?? note['секрет']));
  }
  add('Тайна', str(field(raw, 'secret', 'тайна'), 50000), true);
  return blocks;
}

// Slots as { "1": 4, "2": 3 }, [4, 3, 2] or [{ "max": 4, "used": 1 }]; index 0 is the 1st circle.
function spellSlots(value: unknown): SpellSlot[] | undefined {
  const entries: [number, unknown][] = Array.isArray(value) ? value.map((entry, index) => [index + 1, entry]) : Object.entries(object(value)).map(([key, entry]) => [Number.parseInt(key, 10), entry]);
  const slots: SpellSlot[] = Array.from({ length: 9 }, () => ({ max: 0, used: 0 }));
  for (const [level, entry] of entries) {
    if (!Number.isInteger(level) || level < 1 || level > 9) continue;
    const max = clamp(int(typeof entry === 'object' && entry ? object(entry).max ?? object(entry).total : entry) ?? 0, 0, 20);
    slots[level - 1] = { max, used: clamp(int(typeof entry === 'object' && entry ? object(entry).used : 0) ?? 0, 0, max) };
  }
  return slots.some(slot => slot.max) ? slots : undefined;
}
const attackWords: [RegExp, Spell['attack']][] = [[/^(none|нет|без)/i, 'none'], [/^(melee|ближн|рукопаш)/i, 'melee'], [/^(ranged|дальн)/i, 'ranged'], [/^(save|спас)/i, 'save'], [/^(auto|авто|попад)/i, 'auto']];
// Spells the SRD does not have (or the master's homebrew), described by the AI: they join «Мои заклинания» of the project.
function homebrewSpells(value: unknown, edition: '2014' | '2024', warnings: string[]): Spell[] {
  return list(value).slice(0, 100).flatMap((entry, index) => {
    const raw = object(entry); const name = str(field(raw, 'name', 'название'), 200);
    if (!name) return [];
    const save = abilityOf(field(raw, 'save', 'спасбросок'));
    const attack = attackWords.find(([pattern]) => pattern.test(str(field(raw, 'attack', 'атака', 'type'), 30)))?.[1] || (save ? 'save' : 'none');
    const heal = str(field(raw, 'heal', 'лечение'), 50).replace(/к/gi, 'd').replace(/\s+/g, '');
    const spell: Spell = { ...blankSpell(newId(), edition), name, level: clamp(int(field(raw, 'level', 'круг', 'уровень')) ?? 0, 0, 9), school: str(field(raw, 'school', 'школа'), 500),
      castingTime: str(field(raw, 'castingTime', 'time', 'время'), 500) || '1 действие', range: str(field(raw, 'range', 'дистанция'), 500), components: str(field(raw, 'components', 'компоненты'), 500), duration: str(field(raw, 'duration', 'длительность'), 500) || 'Мгновенная',
      concentration: Boolean(field(raw, 'concentration', 'концентрация')), ritual: Boolean(field(raw, 'ritual', 'ритуал')), attack, ...(save ? { save } : { save: undefined }), damage: parseDamage(field(raw, 'damage', 'урон')),
      ...(heal && validDice(heal) ? { heal } : {}), onSave: /half|полов/i.test(str(field(raw, 'onSave', 'приУспехе'), 40)) ? 'half' : 'none', higher: str(field(raw, 'higher', 'наБольшихКругах'), 2000),
      conditions: list(field(raw, 'conditions', 'состояния')).map(item => str(item, 100).toLowerCase()).filter(item => conditionList.includes(item)).slice(0, 20),
      effect: str(field(raw, 'effect', 'эффект'), 20000), description: str(field(raw, 'description', 'описание'), 100000), classes: str(field(raw, 'classes', 'классы'), 500), source: 'Из импорта персонажа' };
    if (attack !== 'save') { delete spell.save; delete spell.onSave; }
    if (validSpell(spell)) return [spell];
    warnings.push(`Заклинание #${index + 1} «${name}» пропущено: проверьте круг и урон.`); return [];
  });
}

// Same spell format on its own: an array of spells or { "spells": [...] }.
export function parseSpellJson(input: unknown, edition: '2014' | '2024' = '2024') {
  const warnings: string[] = [];
  const spells = homebrewSpells(Array.isArray(input) ? input : object(input).spells ?? [input], edition, warnings);
  return { spells, warnings };
}

export type LibrarySeed = { items: Item[]; weapons: Weapon[] };
export type CharacterImport = { character: Character; game: Game; items: Item[]; weapons: Weapon[]; spells: Spell[]; warnings: string[] };
const magical = (item: Item | Weapon) => 'kind' in item ? item.rarity !== 'mundane' || Boolean(item.effects?.length) || item.attunement : item.category === 'magic' || Boolean(item.bonus);

// Items reuse the item importer; magic ones (rarity, effects, bonus) also join the project library so their effects stay editable in one place.
function inventory(value: unknown, library: LibrarySeed, warnings: string[]) {
  const tiles: InventoryItem[] = []; const items: Item[] = []; const weapons: Weapon[] = [];
  const known = (name: string) => [...library.items, ...library.weapons, ...items, ...weapons].find(entry => entry.name.trim().toLowerCase() === name.trim().toLowerCase());
  list(value).slice(0, 300).forEach((entry, index) => {
    const raw = typeof entry === 'string' ? { name: entry.replace(/\s*×\s*\d+$/, '') } : object(entry);
    const parsed = parseItemJson(raw, `Предмет #${index + 1}`);
    const source: Item | Weapon | undefined = parsed.items[0] || parsed.weapons[0];
    if (!source) { warnings.push(...parsed.errors); return; }
    const quantity = clamp(int(field(raw, 'quantity', 'count', 'количество')) ?? int(typeof entry === 'string' ? /×\s*(\d+)$/.exec(entry)?.[1] : undefined) ?? ('kind' in source ? source.quantity : undefined) ?? 1, 1, 100000);
    const equipped = Boolean(field(raw, 'equipped', 'экипирован', 'надето'));
    const existing = known(source.name);
    const linked = existing || (magical(source) ? source : undefined);
    if (linked && !existing) ('kind' in linked ? items : weapons).push(linked as never);
    const tile = inventoryFrom(linked || source, newId(), quantity, 'kind' in source ? itemKindLabels[source.kind] : 'Оружие');
    if (!linked) { delete tile.sourceId; if ('kind' in source && source.effects?.length) tile.effects = structuredClone(source.effects); }
    if (equipped) tile.equipped = true;
    tiles.push(tile);
  });
  return { tiles, items, weapons };
}

export function parseCharacterJson(input: unknown, options: { edition?: '2014' | '2024'; library?: LibrarySeed } = {}): CharacterImport {
  const root = object(input); const raw = object(root.character ?? input);
  const name = str(field(raw, 'name', 'имя'), 100);
  if (!name) throw new Error('В JSON персонажа нет имени (поле "name")');
  const warnings: string[] = [];
  const editionText = str(field(raw, 'edition', 'редакция') ?? root.edition, 10);
  const edition = editionText.includes('2014') ? '2014' : editionText.includes('2024') ? '2024' : options.edition || '2024';
  const level = clamp(int(field(raw, 'level', 'уровень')) ?? 1, 1, 20); const pb = proficiency(level);
  const scores = abilities(field(raw, 'abilities', 'stats', 'характеристики'), warnings);
  const maxHp = clamp(int(field(raw, 'maxHp', 'hpMax', 'максХп', 'хитыМакс')) ?? int(field(raw, 'hp', 'хиты')) ?? Math.max(1, 8 + modifier(scores.con) + (level - 1) * (5 + modifier(scores.con))), 1, 1000000);
  if (field(raw, 'maxHp', 'hpMax', 'hp', 'хиты', 'максХп', 'хитыМакс') === undefined) warnings.push(`Хиты не указаны: рассчитано ${maxHp} по уровню и Телосложению.`);
  const hp = clamp(int(field(raw, 'hp', 'хиты')) ?? maxHp, 0, maxHp);
  const acValue = int(field(raw, 'ac', 'кд', 'armorClass'));
  if (acValue === undefined) warnings.push('КД не указан: взят 10 + модификатор Ловкости.');
  const library = options.library || { items: [], weapons: [] };
  const gear = inventory(field(raw, 'items', 'inventory', 'equipment', 'предметы', 'инвентарь'), library, warnings);
  const className = str(field(raw, 'class', 'className', 'класс'), 200); const race = str(field(raw, 'race', 'species', 'раса', 'вид'), 200);
  const initiative = int(field(raw, 'initiative', 'инициатива'));
  const speed = int(field(raw, 'speed', 'скорость'));
  const saves = [...new Set(list(field(raw, 'saves', 'savingThrows', 'спасброски')).map(abilityOf).filter((key): key is Ability => Boolean(key)))];
  const game: Game = { hp, maxHp, ac: clamp(acValue ?? 10 + modifier(scores.dex), 0, 1000), blocks: notes(raw), edition, level, race, className, speed: clamp(speed ?? 30, 0, 10000), abilities: scores,
    ...(initiative !== undefined && initiative !== modifier(scores.dex) ? { initiative: clamp(initiative, -50, 50) } : {}), saves,
    skills: skillText(field(raw, 'skills', 'навыки'), field(raw, 'proficiencies', 'владения'), scores, pb), attacks: attacks(field(raw, 'attacks', 'атаки'), warnings), features: features(field(raw, 'features', 'traits', 'умения', 'черты')),
    spells: spellNames(field(raw, 'spells', 'заклинания')), spellBook: spellNames(field(raw, 'spellBook', 'книгаЗаклинаний')), ...(spellSlots(field(raw, 'spellSlots', 'ячейки')) ? { spellSlots: spellSlots(field(raw, 'spellSlots', 'ячейки')) } : {}), coins: coins(field(raw, 'coins', 'money', 'монеты')), items: gear.tiles,
    inventory: str(field(raw, 'inventoryNotes', 'заметкиИнвентаря'), 100000) };
  if (!validGame(game)) throw new Error('Персонаж не прошёл проверку: проверьте уровень, хиты, КД и характеристики');
  const caption = str(field(raw, 'caption', 'подпись'), 200) || [race, className].filter(Boolean).join(' · ') || 'Импортированный герой';
  const subtitle = str(field(raw, 'motto', 'subtitle', 'девиз'), 200) || `Уровень ${level} · D&D ${edition}`;
  return { character: { ...characters[2], id: newId(), name, caption, subtitle }, game, items: gear.items, weapons: gear.weapons, spells: homebrewSpells(field(raw, 'homebrewSpells', 'customSpells', 'своиЗаклинания'), edition, warnings), warnings };
}

export const isLssJson = (value: unknown) => object(value).jsonType === 'character';

// Same shape the importer reads: export, edit by hand or in an AI chat, import back.
export function exportCharacterJson(character: Character, game: Game, library: LibrarySeed, projectSpells: Spell[] = []) {
  const sources = [...library.items, ...library.weapons];
  const effectsOf = (item: InventoryItem): Effect[] => itemEffects(item, library.items);
  const kindOf = (item: InventoryItem) => { const source = sources.find(entry => entry.id === item.sourceId); return source && 'kind' in source ? itemKindLabels[source.kind] : source ? 'оружие' : item.kind; };
  const profs = parseSkills(game.skills || '', game.abilities || {}, proficiency(game.level || 1));
  return JSON.stringify({ format: characterFormat, version: 1,
    name: character.name, caption: character.caption, motto: character.subtitle, edition: game.edition || '2024', race: game.race || '', class: game.className || '', level: game.level || 1,
    hp: game.hp, maxHp: game.maxHp, ac: game.ac, speed: game.speed ?? 30, ...(game.initiative !== undefined ? { initiative: game.initiative } : {}),
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...game.abilities }, saves: game.saves || [],
    skills: skills.filter(skill => profs.profs[skill.id]).map(skill => profs.profs[skill.id] === 2 ? `${skill.label} (эксперт)` : skill.label), proficiencies: profs.extra,
    attacks: (game.attacks || []).map(({ id: _id, conditions: _conditions, damage, ...action }) => ({ ...action, damage: damage.map(part => `${part.dice} ${part.type}`.trim()).join(' + ') })),
    features: (game.features || []).map(({ name, text }) => ({ name, text })), spells: game.spells || [], spellBook: game.spellBook || [],
    ...(game.spellSlots?.some(slot => slot.max) ? { spellSlots: Object.fromEntries(game.spellSlots.flatMap((slot, index) => slot.max ? [[String(index + 1), slot.used ? slot : slot.max]] : [])) } : {}),
    homebrewSpells: projectSpells.filter(spell => [...(game.spells || []), ...(game.spellBook || [])].some(name => name.trim().toLowerCase() === spell.name.trim().toLowerCase()))
      .map(({ id: _id, source: _source, damage, ...spell }) => ({ ...spell, damage: damage.map(part => `${part.dice} ${part.type}`.trim()).join(' + ') })),
    coins: game.coins || {},
    items: (game.items || []).map(item => ({ name: item.name, type: kindOf(item), ...(item.rarity ? { rarity: rarities.find(entry => entry.value === item.rarity)?.label } : {}), quantity: item.quantity, ...(item.equipped ? { equipped: true } : {}), ...(item.icon ? { icon: item.icon } : {}), description: item.description, ...(effectsOf(item).length ? { effects: effectsOf(item) } : {}) })),
    inventoryNotes: game.inventory || '', notes: game.blocks.map(block => ({ title: block.title, text: block.text, ...(block.kind === 'spoiler' ? { secret: true } : {}) }))
  }, null, 2);
}

export const characterJsonPrompt = `Создай персонажа D&D 5e в формате JSON для приложения Arcane Table. Поля, которые не нужны, можно пропустить:
{
  "format": "arcane-character", "version": 1,
  "name": "Имя",                                   // обязательно
  "race": "Дварф", "class": "Паладин (клятва преданности)", "level": 5, "edition": "2024",
  "motto": "Короткий девиз для карточки",
  "hp": 44, "maxHp": 44, "ac": 18, "speed": 25, "initiative": 0,
  "abilities": { "str": 16, "dex": 10, "con": 14, "int": 8, "wis": 12, "cha": 16 },   // базовые значения, без бонусов предметов
  "saves": ["wis", "cha"],                         // спасброски с владением: str, dex, con, int, wis, cha
  "skills": ["Атлетика", "Убеждение", "Проницательность (эксперт)"],   // навыки с владением; (эксперт) — двойное
  "proficiencies": "Все доспехи, щиты, простое и воинское оружие",
  "attacks": [
    { "name": "Длинный меч", "type": "ближняя", "bonus": 6, "reach": "5 фт.", "damage": "1d8+3 рубящий" },
    { "name": "Священное пламя", "type": "спасбросок", "save": "dex", "dc": 13, "damage": "1d8 излучение", "effect": "Без укрытия" }
  ],                                               // type: ближняя | дальняя | заклинание | спасбросок | особое
  "features": [{ "name": "Божественное чувство", "text": "Что делает умение" }],
  "spells": ["Благословение", "Лечение ран"],      // подготовленные
  "spellBook": [],                                 // книга заклинаний (для волшебника)
  "spellSlots": { "1": 4, "2": 2 },                // ячейки заклинаний по кругам
  "homebrewSpells": [                              // только заклинания, которых нет в SRD 5.1 / 5.2 (их описание нужно приложению)
    { "name": "Расщепление разума", "level": 0, "school": "очарование", "castingTime": "1 действие", "range": "60 футов", "components": "В",
      "duration": "1 раунд", "attack": "спасбросок", "save": "int", "damage": "1d6 психический", "onSave": "нет урона",
      "effect": "При провале цель вычитает 1d4 из следующего спасброска до конца вашего следующего хода.", "higher": "Урон растёт на 1d6 на 5, 11 и 17 уровнях.", "classes": "Чародей, Колдун, Волшебник" }
  ],                                               // attack: нет | ближняя | дальняя | спасбросок | авто; concentration, ritual, heal, conditions — по желанию
  "coins": { "gp": 15, "sp": 8 },                  // cp, sp, ep, gp, pp
  "items": [
    { "name": "Кольчуга", "type": "доспех", "equipped": true },
    { "name": "Зелье лечения", "type": "зелье", "heal": "2d4+2", "quantity": 2 },
    { "name": "Перчатки силы огра", "type": "чудесный", "rarity": "необычный", "attunement": true, "equipped": true,
      "description": "Короткое описание", "effects": ["Сила = 19"] }
  ],
  "backstory": "История героя", "appearance": "Внешность", "personality": "Характер",
  "notes": [{ "title": "Цели", "text": "..." }],
  "secret": "Тайна, которую видит только мастер"
}
Предметы ("items") поддерживают все поля формата предметов: type (оружие | доспех | зелье | свиток | кольцо | жезл | чудесный | боеприпасы | инструмент | снаряжение | еда | сокровище),
rarity (обычный | простой | необычный | редкий | очень редкий | легендарный | артефакт), attunement, price, weight, description, effect, damage, heal, ac, charges, quantity, equipped, icon.
"effects" — правила, которые действуют, пока предмет экипирован ("equipped": true). Каждое правило — строка:
  числа: "Ловкость +2 макс 20", "КД +1", "спасброски +1", "инициатива +2", "скорость +10", "Сила = 19" (не ниже), "фиксирует силу 8", "скорость ×2", "скорость не выше 20";
  защита: "сопротивление огонь", "иммунитет яд", "уязвимость холод", "иммунитет к отравлен";
  удача: "преимущество на спасброски Ловкости", "помеха на проверки Скрытности";
  чувства: "тёмное зрение 60", "слепое зрение 10", "чувство вибрации 30", "истинное зрение 120".
Типы урона: колющий, рубящий, дробящий, огонь, холод, электричество, звук, кислота, яд, некротический, излучение, силовое поле, психический.
Названия заклинаний пиши по-русски, как в русском SRD. В "homebrewSpells" описывай механику своими словами коротко и точно.
Бонусы предметов не добавляй к "abilities" и "ac" — приложение само применит "effects" экипированных предметов. Остальное (доспех, щит) учитывай в "ac".
Ответь только JSON без пояснений.`;
