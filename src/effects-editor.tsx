import React, { useState } from 'react';
import type { Effect, EffectStat, StatEffect, TraitEffect } from './contracts';
import { effectRange, effectSentence, effectStats, effectText, isStatEffect, parseEffect, statOps, traitKinds, traitOptions } from './library';

type Group = 'number' | 'defense' | 'luck' | 'sense';
const groupOf = (effect: Effect): Group => isStatEffect(effect) ? 'number' : traitKinds.find(item => item.value === effect.trait)!.group;
const groups: { value: Group; label: string; title: string; make: () => Effect }[] = [
  { value: 'number', label: 'Число', title: 'Меняет характеристику, КД, скорость…', make: () => ({ stat: 'str', op: 'add', value: 1 }) },
  { value: 'defense', label: 'Защита', title: 'Сопротивление, иммунитет, уязвимость', make: () => ({ trait: 'resist', what: 'огонь' }) },
  { value: 'luck', label: 'Удача', title: 'Преимущество или помеха', make: () => ({ trait: 'advantage', what: 'спасброски Ловкости' }) },
  { value: 'sense', label: 'Чувство', title: 'Тёмное зрение и другие', make: () => ({ trait: 'sense', what: 'Тёмное зрение', value: 60 }) }
];
const presets: { label: string; effect: Effect }[] = [
  { label: 'КД +1', effect: { stat: 'ac', op: 'add', value: 1 } },
  { label: 'Спасброски +1', effect: { stat: 'saves', op: 'add', value: 1 } },
  { label: 'Ловкость +2, макс. 20', effect: { stat: 'dex', op: 'add', value: 2, max: 20 } },
  { label: 'Сила не ниже 19', effect: { stat: 'str', op: 'set', value: 19 } },
  { label: 'Скорость ×2', effect: { stat: 'speed', op: 'mul', value: 2 } },
  { label: 'Проклятие: Сила ровно 8', effect: { stat: 'str', op: 'fix', value: 8 } },
  { label: 'Сопротивление огню', effect: { trait: 'resist', what: 'огонь' } },
  { label: 'Не боится испуга', effect: { trait: 'condition', what: 'испуган' } },
  { label: 'Тёмное зрение 60', effect: { trait: 'sense', what: 'Тёмное зрение', value: 60 } }
];
const isAbility = (stat: EffectStat) => stat.length === 3;
// Sensible starting value when the verb of a number block changes.
function startValue(stat: EffectStat, op: StatEffect['op']) {
  if (op === 'add') return 1;
  if (op === 'mul') return 2;
  if (stat === 'speed') return 30;
  if (stat === 'ac') return op === 'cap' ? 20 : 15;
  if (stat === 'initiative' || stat === 'saves') return op === 'cap' ? 5 : 0;
  return op === 'fix' ? 10 : op === 'cap' ? 20 : 19;
}
const clamp = (value: number, [min, max]: number[]) => Math.max(min, Math.min(max, Math.round(value) || 0));

function Stepper({ value, min, max, onChange, prefix = '', label }: { value: number; min: number; max: number; onChange: (value: number) => void; prefix?: string; label: string }) {
  return <span className="fx-stepper"><button type="button" aria-label={`${label}: меньше`} disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
    <label><span aria-hidden="true">{prefix}</span><input aria-label={label} type="number" min={min} max={max} value={value} onChange={e => onChange(clamp(Number(e.target.value), [min, max]))}/></label>
    <button type="button" aria-label={`${label}: больше`} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button></span>;
}

// One rule as a chain of puzzle pieces: Персонаж → глагол → цель → значение (→ предел).
function EffectBlock({ effect, index, onChange, onRemove, onMove }: { effect: Effect; index: number; onChange: (effect: Effect) => void; onRemove: () => void; onMove?: (step: number) => void }) {
  const group = groupOf(effect);
  const verb = isStatEffect(effect) ? `stat:${effect.op}` : `trait:${effect.trait}`;
  function setVerb(next: string) {
    const [kind, name] = next.split(':');
    if (kind === 'stat') { const stat = isStatEffect(effect) ? effect.stat : 'str'; const op = name as StatEffect['op']; onChange({ stat, op, value: startValue(stat, op) }); return; }
    const trait = name as TraitEffect['trait']; const options = traitOptions(trait);
    const what = !isStatEffect(effect) && options.includes(effect.what) ? effect.what : options[0];
    onChange(trait === 'sense' ? { trait, what, value: !isStatEffect(effect) && effect.value ? effect.value : 60 } : { trait, what });
  }
  return <div className={`fx-block fx-${group}`}>
    <span className="fx-index" aria-hidden="true">{index + 1}</span>
    <div className="fx-chain">
      <span className="fx-piece fx-subject">Персонаж</span>
      <select className="fx-piece fx-verb" aria-label="Что происходит" value={verb} onChange={e => setVerb(e.target.value)}>
        <optgroup label="Числа">{statOps.map(op => <option key={op.value} value={`stat:${op.value}`}>{op.label}</option>)}</optgroup>
        <optgroup label="Защита">{traitKinds.filter(item => item.group === 'defense').map(item => <option key={item.value} value={`trait:${item.value}`}>{item.label}</option>)}</optgroup>
        <optgroup label="Удача">{traitKinds.filter(item => item.group === 'luck').map(item => <option key={item.value} value={`trait:${item.value}`}>{item.label}</option>)}</optgroup>
        <optgroup label="Чувства">{traitKinds.filter(item => item.group === 'sense').map(item => <option key={item.value} value={`trait:${item.value}`}>{item.label}</option>)}</optgroup>
      </select>
      {isStatEffect(effect) ? <>
        <select className="fx-piece fx-target" aria-label="Что меняется" value={effect.stat} onChange={e => { const stat = e.target.value as EffectStat; onChange({ ...effect, stat, value: clamp(effect.value, effectRange(stat, effect.op)), ...(effect.max !== undefined ? { max: Math.min(effect.max, effectRange(stat, 'fix')[1]) } : {}) }); }}>{effectStats.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
        <Stepper label="Значение" prefix={effect.op === 'mul' ? '×' : ''} value={effect.value} min={effectRange(effect.stat, effect.op)[0]} max={effectRange(effect.stat, effect.op)[1]} onChange={value => onChange({ ...effect, value })}/>
        {effect.op === 'add' && (effect.max === undefined
          ? <button type="button" className="fx-piece fx-ghost" onClick={() => onChange({ ...effect, max: isAbility(effect.stat) ? 20 : effectRange(effect.stat, 'fix')[1] })}>＋ предел</button>
          : <span className="fx-piece fx-cap">макс.<Stepper label="Предел" value={effect.max} min={0} max={effectRange(effect.stat, 'fix')[1]} onChange={max => onChange({ ...effect, max })}/><button type="button" className="fx-x" aria-label="Убрать предел" onClick={() => { const next = { ...effect }; delete next.max; onChange(next); }}>×</button></span>)}
      </> : <>
        <select className="fx-piece fx-target" aria-label="К чему" value={effect.what} onChange={e => onChange({ ...effect, what: e.target.value })}>{traitOptions(effect.trait).map(option => <option key={option} value={option}>{option}</option>)}</select>
        {effect.trait === 'sense' && <><Stepper label="Дальность" value={effect.value ?? 60} min={5} max={1000} onChange={value => onChange({ ...effect, value })}/><span className="fx-unit">фт.</span></>}
      </>}
    </div>
    <p className="fx-say">{effectSentence(effect)}</p>
    <div className="fx-tools">
      {onMove && <><button type="button" aria-label="Выше" onClick={() => onMove(-1)}>↑</button><button type="button" aria-label="Ниже" onClick={() => onMove(1)}>↓</button></>}
      <button type="button" className="fx-remove" aria-label="Удалить блок" onClick={onRemove}>×</button>
    </div>
  </div>;
}

export function EffectsEditor({ value, onChange }: { value: Effect[]; onChange: (value: Effect[]) => void }) {
  const [rule, setRule] = useState('');
  const [error, setError] = useState('');
  const full = value.length >= 20;
  const add = (effect: Effect) => { if (!full) onChange([...value, structuredClone(effect)]); };
  const move = (index: number, step: number) => { const next = [...value]; const target = index + step; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; onChange(next); };
  function addRule() {
    const effect = parseEffect(rule);
    if (!effect) { setError('Не понял правило. Примеры: «персонаж → получает → ловкость → +2 → макс 21», «фиксирует силу 8», «сопротивление огонь», «тёмное зрение 60»'); return; }
    add(effect); setRule(''); setError('');
  }
  return <div className="effects-editor">
    <div className="fx-stack">
      <div className="fx-hat"><span>Когда предмет экипирован</span><small>{value.length ? `${value.length} ${value.length === 1 ? 'блок' : value.length < 5 ? 'блока' : 'блоков'}` : 'пока ничего не происходит'}</small></div>
      {value.map((effect, index) => <EffectBlock key={index} index={index} effect={effect} onChange={next => onChange(value.map((item, i) => i === index ? next : item))} onRemove={() => onChange(value.filter((_, i) => i !== index))} onMove={value.length > 1 ? step => move(index, step) : undefined}/>)}
      {!value.length && <p className="fx-empty">Добавьте блок ниже: например «Персонаж → получает → КД → +1».</p>}
    </div>
    <div className="fx-palette">
      <span className="ui-label">Новый блок</span>
      <div className="fx-palette-row">{groups.map(group => <button type="button" key={group.value} className={`fx-new fx-${group.value}`} title={group.title} disabled={full} onClick={() => add(group.make())}>＋ {group.label}</button>)}</div>
      <span className="ui-label">Готовые</span>
      <div className="fx-presets">{presets.map(preset => <button type="button" key={preset.label} className={`fx-preset fx-${groupOf(preset.effect)}`} disabled={full} onClick={() => add(preset.effect)} title={effectText(preset.effect)}>{preset.label}</button>)}</div>
    </div>
    <div className="inline-form effect-rule"><input aria-label="Правило текстом" value={rule} maxLength={200} placeholder="или текстом: персонаж -> получает -> ловкость -> +2 -> макс 21" onChange={e => { setRule(e.target.value); setError(''); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRule(); } }}/><button type="button" className="ui-button small" disabled={!rule.trim() || full} onClick={addRule}>Добавить</button></div>
    {error && <span className="ui-error" role="alert">{error}</span>}
  </div>;
}
