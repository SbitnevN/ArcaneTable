import { useEffect, useState } from 'react';

// Russian presentation of SRD spells: names from public/references/spells-ru.json, parameters by rules,
// full descriptions from translations the master imported (/api/spell-texts).
export type SpellTexts = Record<string, { name?: string; text: string }>;
type Api = <T>(path: string, options?: RequestInit) => Promise<T>;
let api: Api | null = null;
let names: Promise<Record<string, string>> | null = null;
let texts: Promise<SpellTexts> | null = null;
const listeners = new Set<() => void>();
export function registerSpellApi(value: Api) { api = value; }
export async function postSpellTexts(value: SpellTexts) {
  if (!api) throw new Error('Нет связи с сервером');
  await api<SpellTexts>('/api/spell-texts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texts: value }) });
}
export function reloadSpellTexts() { texts = null; for (const listener of listeners) listener(); }
function loadNames() { return names ??= fetch('/references/spells-ru.json').then(r => r.ok ? r.json() : { names: {} }).then(value => value.names || {}).catch(() => ({})); }
function loadTexts() { return texts ??= (api ? api<SpellTexts>('/api/spell-texts') : Promise.resolve({})).catch(() => ({})); }
export const spellKey = (edition: string, name: string) => `${edition}:${name}`;

export function useSpellRu() {
  const [state, setState] = useState<{ names: Record<string, string>; texts: SpellTexts }>({ names: {}, texts: {} });
  useEffect(() => {
    let active = true;
    const load = () => void Promise.all([loadNames(), loadTexts()]).then(([n, t]) => { if (active) setState({ names: n, texts: t }); });
    load(); listeners.add(load);
    return () => { active = false; listeners.delete(load); };
  }, []);
  return {
    ...state,
    name: (edition: string, english: string) => state.texts[spellKey(edition, english)]?.name || state.names[english] || english,
    text: (edition: string, english: string) => state.texts[spellKey(edition, english)]?.text
  };
}

const schools: Record<string, string> = { abjuration: 'ограждение', conjuration: 'вызов', divination: 'прорицание', enchantment: 'очарование', evocation: 'воплощение', illusion: 'иллюзия', necromancy: 'некромантия', transmutation: 'преобразование' };
export const schoolRu = (value = '') => schools[value.toLowerCase()] || value;
const units = (value: string) => value
  .replace(/(\d+)-foot/gi, '$1 фт.').replace(/(\d+)\s*feet/gi, '$1 футов').replace(/(\d+)\s*foot/gi, '$1 фут').replace(/(\d+)\s*miles?/gi, '$1 миль')
  .replace(/radius/gi, 'радиус').replace(/hemisphere/gi, 'полусфера').replace(/sphere/gi, 'сфера').replace(/cone/gi, 'конус').replace(/cube/gi, 'куб').replace(/line/gi, 'линия');
export function rangeRu(value = '') {
  return units(value.replace(/^Self/i, 'На себя').replace(/^Touch/i, 'Касание').replace(/^Sight/i, 'В пределах видимости').replace(/^Unlimited/i, 'Без ограничений').replace(/^Special/i, 'Особая'));
}
export function castingRu(value = '') {
  return value.replace(/^1 action|^Action/i, '1 действие').replace(/^1 bonus action|^Bonus Action/i, '1 бонусное действие').replace(/^1 reaction|^Reaction/i, '1 реакция')
    .replace(/,? which you take.*$/i, '').replace(/ or Ritual/i, ' или ритуал').replace(/ or 8 hours/i, ' или 8 часов').replace(/\(Overgrowth\) or$/i, '')
    .replace(/(\d+) minutes?/gi, (_, n) => `${n} ${Number(n) === 1 ? 'минута' : 'минут'}`).replace(/(\d+) hours?/gi, (_, n) => `${n} ${Number(n) === 1 ? 'час' : Number(n) < 5 ? 'часа' : 'часов'}`).trim();
}
export function durationRu(value = '') {
  return value.replace(/\.$/, '').replace(/^Instantaneous/i, 'Мгновенная').replace(/^Until dispelled or triggered/i, 'Пока не рассеется или не сработает').replace(/^Until dispelled/i, 'Пока не рассеется').replace(/^Special/i, 'Особая')
    .replace(/^Concentration,? up to/i, 'Концентрация, вплоть до').replace(/^Up to/i, 'Вплоть до').replace(/one minute/i, '1 минута')
    .replace(/(\d+) rounds?/gi, (_, n) => `${n} ${Number(n) === 1 ? 'раунд' : Number(n) < 5 ? 'раунда' : 'раундов'}`).replace(/(\d+) minutes?/gi, (_, n) => `${n} ${Number(n) === 1 ? 'минута' : 'минут'}`)
    .replace(/(\d+) hours?/gi, (_, n) => `${n} ${Number(n) === 1 ? 'час' : Number(n) < 5 ? 'часа' : 'часов'}`).replace(/(\d+) days?/gi, (_, n) => `${n} ${Number(n) === 1 ? 'день' : Number(n) < 5 ? 'дня' : 'дней'}`);
}
export function componentsRu(value = '') {
  return value.replace(/\bV\b/g, 'В').replace(/\bS\b/g, 'С').replace(/\bM\b/g, 'М');
}
const classes: Record<string, string> = { bard: 'Бард', cleric: 'Жрец', druid: 'Друид', paladin: 'Паладин', ranger: 'Следопыт', sorcerer: 'Чародей', warlock: 'Колдун', wizard: 'Волшебник', artificer: 'Изобретатель' };
export const classesRu = (value = '') => value.split(/\s*,\s*/).map(item => item.trim()).filter(Boolean).map(item => classes[item.toLowerCase()] || item).join(', ');
// LSS stores spells as English slugs («cure-wounds»): show them under their Russian name when one is known.
export function spellLabel(value: string, names: Record<string, string>) {
  if (names[value]) return names[value];
  const english = Object.keys(names).find(key => key.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') === value);
  return english ? names[english] : value;
}

export const spellTranslatePrompt = `Переведи описания заклинаний D&D на русский язык. Вход — JSON-массив объектов { "key", "name", "text" } (text на английском).
Верни JSON-массив в том же порядке: [{ "key": "<тот же key без изменений>", "name": "<русское название>", "text": "<перевод text>" }].
Правила: не меняй key; сохраняй числа, кубы (8d6) и абзацы; термины D&D переводи принятыми словами (saving throw — спасбросок, Dexterity — Ловкость, hit points — хиты, spell slot — ячейка заклинаний, concentration — концентрация, at higher levels — на больших уровнях). Ответь только JSON.`;
