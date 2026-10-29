import React, { useEffect, useState } from 'react';
import type { Ability } from './contracts';
import { abilities, modifier, signed, skills, parseSkills, composeSkills } from './library';
export { skills, parseSkills, composeSkills, skillBonus } from './library';

export const languages = ['Общий', 'Гоблинский', 'Дварфийский', 'Эльфийский', 'Великаний', 'Гномий', 'Драконий', 'Орочий', 'Полуросликов', 'Бездны', 'Инфернальный', 'Небесный', 'Глубинная речь', 'Первичный', 'Сильван', 'Подземный', 'Воровской жаргон', 'Друидический'];
const tokens = (value: string) => value.split(/s*[,;]s*/).map(item => item.trim()).filter(Boolean);

export function SkillsEditor({ value, scores, pb, onChange, extraLabel = 'Прочие владения и бонусы' }: { value: string; scores: Record<string, number>; pb: number; onChange: (value: string) => void; extraLabel?: string }) {
  const [state, setState] = useState(() => parseSkills(value, scores, pb));
  const composed = composeSkills(state.profs, state.extra, scores, pb);
  // Recompute the stored text when abilities or proficiency bonus change elsewhere in the sheet.
  useEffect(() => { if (composed !== value) onChange(composed); }, [composed]);
  const cycle = (id: string) => setState(current => { const next = { ...current.profs }; const level = next[id] || 0; if (level === 2) delete next[id]; else next[id] = (level + 1) as 1 | 2; return { ...current, profs: next }; });
  return <div className="skills-editor">
    <div className="skills-grid">{skills.map(skill => { const level = state.profs[skill.id] || 0; return <button type="button" key={skill.id} className={`skill-toggle level-${level}`} aria-pressed={level > 0} title={level === 2 ? 'Компетентность' : level === 1 ? 'Владение' : 'Нет владения'} onClick={() => cycle(skill.id)}>
      <span className="skill-dots" aria-hidden="true"><i/><i/></span><span className="skill-name">{skill.label}</span><small>{abilities.find(a => a.key === skill.ability)?.short}</small><b>{signed(modifier(scores[skill.ability] ?? 10) + pb * level)}</b>
    </button>; })}</div>
    <p className="ui-note small">Нажатие: владение → компетентность → без владения. Бонус считается сам.</p>
    <label className="ui-field"><span className="ui-label">{extraLabel}</span><input value={state.extra} maxLength={1000} placeholder="Например: лёгкие доспехи, щиты, воровские инструменты" onChange={e => setState(current => ({ ...current, extra: e.target.value }))}/></label>
  </div>;
}

const senseKinds: { id: string; label: string; en: RegExp; ru: RegExp }[] = [
  { id: 'darkvision', label: 'Тёмное зрение', en: /darkvision (\d+)/i, ru: /тёмное зрение (\d+)/i },
  { id: 'blindsight', label: 'Слепое зрение', en: /blindsight (\d+)/i, ru: /слепое зрение (\d+)/i },
  { id: 'tremorsense', label: 'Чувство вибрации', en: /tremorsense (\d+)/i, ru: /чувство вибрации (\d+)/i },
  { id: 'truesight', label: 'Истинное зрение', en: /truesight (\d+)/i, ru: /истинное зрение (\d+)/i }
];
function parseSenses(value: string) {
  const ranges: Record<string, number> = {}; const rest: string[] = [];
  for (const token of tokens(value)) {
    const kind = senseKinds.find(item => item.en.test(token) || item.ru.test(token));
    if (kind) ranges[kind.id] = Number((kind.en.exec(token) || kind.ru.exec(token))![1]);
    else if (!/passive perception|пассивное восприятие/i.test(token)) rest.push(token);
  }
  return { ranges, extra: rest.join(', ') };
}
export function SensesEditor({ value, passive, onChange }: { value: string; passive: number; onChange: (value: string) => void }) {
  const [state, setState] = useState(() => parseSenses(value));
  const composed = [...senseKinds.filter(kind => state.ranges[kind.id]).map(kind => `${kind.label.toLowerCase()} ${state.ranges[kind.id]} фт.`), ...tokens(state.extra), `пассивное Восприятие ${passive}`].join(', ');
  useEffect(() => { if (composed !== value) onChange(composed); }, [composed]);
  return <div className="senses-editor">
    {senseKinds.map(kind => <label className="ui-field" key={kind.id}><span className="ui-label">{kind.label}, фт.</span><input type="number" min={0} max={1000} step={5} value={state.ranges[kind.id] || ''} placeholder="—" onChange={e => setState(current => ({ ...current, ranges: { ...current.ranges, [kind.id]: Math.max(0, Number(e.target.value) || 0) } }))}/></label>)}
    <label className="ui-field"><span className="ui-label">Пассивное Восприятие</span><output className="readonly-tile">{passive}</output></label>
  </div>;
}

export function TokenPicker({ label, value, options, onChange, placeholder = 'Своё значение…' }: { label: string; value: string; options: string[]; onChange: (value: string) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  const list = tokens(value);
  const has = (item: string) => list.some(token => token.toLowerCase() === item.toLowerCase());
  const toggle = (item: string) => onChange((has(item) ? list.filter(token => token.toLowerCase() !== item.toLowerCase()) : [...list, item]).join(', '));
  const custom = list.filter(token => !options.some(option => option.toLowerCase() === token.toLowerCase()));
  return <div className="token-picker"><span className="ui-label">{label}</span>
    <div className="chip-row">{options.map(option => <button type="button" key={option} className={has(option) ? 'chip active' : 'chip'} aria-pressed={has(option)} onClick={() => toggle(option)}>{option}</button>)}
      {custom.map(token => <span key={token} className="chip custom">{token}<button type="button" aria-label={`Убрать ${token}`} onClick={() => toggle(token)}>×</button></span>)}
      <form className="token-add" onSubmit={e => { e.preventDefault(); const next = draft.trim(); if (next && !has(next)) onChange([...list, next.slice(0, 200)].join(', ')); setDraft(''); }}><input aria-label={`${label}: своё`} value={draft} maxLength={200} placeholder={placeholder} onChange={e => setDraft(e.target.value)}/></form>
    </div>
  </div>;
}
