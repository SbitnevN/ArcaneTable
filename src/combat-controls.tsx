import React, { useEffect, useRef, useState } from 'react';
import type { PublicCombat } from './contracts';
import { TableCard } from './table-card';
import { CombatEffects } from './combat-effects';

export function CombatControls({ combat, sourceId, canAct, busy, pending = false, master = false, hiddenIds = [], onSource, onAct }: {
  combat: PublicCombat; sourceId?: string; canAct: boolean; busy: boolean; pending?: boolean; master?: boolean; hiddenIds?: string[];
  onSource?: (id: string) => void; onAct: (sourceId: string, targetId: string, kind: 'damage' | 'heal', amount: number) => Promise<boolean | void>;
}) {
  const [targetId, setTargetId] = useState('');
  const [amount, setAmount] = useState('1');
  const [kind, setKind] = useState<'damage' | 'heal'>('damage');
  const [notice, setNotice] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const source = combat.participants.find(item => item.id === sourceId);
  const target = combat.participants.find(item => item.id === targetId);
  const validAmount = Number.isSafeInteger(Number(amount)) && Number(amount) >= 1 && Number(amount) <= 1000000;
  useEffect(() => { setTargetId(''); setNotice(''); }, [sourceId]);
  async function act() {
    if (!canAct || busy || pending || !source || !target || !validAmount) return;
    if (await onAct(source.id, target.id, kind, Number(amount))) setNotice(`${kind === 'damage' ? 'Урон' : 'Лечение'}: ${target.name} · ${amount}`);
  }
  return <div className={`player-combat ${master ? 'master-combat-controls' : ''}`} ref={root}>
    <div className="player-section-heading"><div><span className="player-kicker">{master ? 'ПУЛЬТ БОЯ' : 'СТОЛКНОВЕНИЕ'}</span><h1>{combat.name}</h1></div><span className="player-round">Раунд {combat.round}</span></div>
    {master && <section className="combat-source-picker"><h2>Кто действует</h2><div>{combat.participants.map(item => <button type="button" key={item.id} data-source-id={item.id} aria-pressed={sourceId === item.id} onClick={() => onSource?.(item.id)}><TableCard item={item}/>{hiddenIds.includes(item.id) && <small>Скрыт</small>}</button>)}</div></section>}
    <p className="player-battle-help">{master ? 'Выберите участника сверху, затем коснитесь карты цели.' : 'Коснитесь карты цели.'} Союзники тоже могут быть целью.</p>
    <div className="player-target-columns">{(['ally', 'enemy'] as const).map(side => <section className={`player-target-side side-${side}`} key={side}><h2>{side === 'ally' ? 'Союзники' : 'Противники'}<span>{combat.participants.filter(item => item.side === side).length}</span></h2><div className="player-target-list">{combat.participants.filter(item => item.side === side).map(item => <button type="button" key={item.id} data-target-id={item.id} aria-label={`Выбрать цель: ${item.name}`} aria-pressed={targetId === item.id} className={`player-target ${targetId === item.id ? 'is-selected' : ''}`} onClick={() => { setTargetId(item.id); setNotice(''); }}><TableCard item={item} active={item.id === combat.activeId}/><span className="target-choice">{targetId === item.id ? 'Цель выбрана' : hiddenIds.includes(item.id) ? 'Скрыт от игроков' : item.id === sourceId ? 'Источник действия' : 'Выбрать'}</span></button>)}</div>{!combat.participants.some(item => item.side === side) && <p className="player-empty-side">Нет открытых карт</p>}</section>)}</div>
    <section className="player-action-dock" aria-label="Действие персонажа"><div className="player-action-top">{source && <div className="combat-source-card"><TableCard item={source} active={canAct}/></div>}<div className="player-action-copy"><span className="player-kicker">{source ? `${source.name} → ЦЕЛЬ` : 'ВЫБРАННАЯ ЦЕЛЬ'}</span><strong data-selected-target={target?.id || ''}>{target?.name || 'Коснитесь карты на столе'}</strong><span>{pending ? 'Мастер рассматривает действие' : !source ? 'Мастер ещё не добавил героя в бой' : !canAct ? 'Действие доступно после передачи инициативы' : 'Укажите результат броска и примените действие'}</span></div></div><div className="player-action-controls"><div className="player-action-kind" aria-label="Тип действия"><button type="button" aria-pressed={kind === 'damage'} onClick={() => setKind('damage')}>⚔ Урон</button><button type="button" aria-pressed={kind === 'heal'} onClick={() => setKind('heal')}>✚ Лечение</button></div><label>Величина<input aria-label={master ? 'Величина действия мастера' : 'Величина действия игрока'} type="number" inputMode="numeric" min="1" max="1000000" step="1" value={amount} onChange={e => setAmount(e.target.value)}/></label><button type="button" className="player-apply-action" disabled={!canAct || busy || pending || !source || !target || !validAmount} onClick={() => void act()}>{busy ? 'Отправка…' : kind === 'damage' ? 'Нанести урон' : 'Лечить'}</button></div><p className="player-action-status" role="status">{pending ? 'Запрос ожидает решения мастера.' : notice || (target?.side === 'ally' && kind === 'damage' ? 'Урон будет нанесён союзнику.' : 'Выберите цель и примените действие кнопкой.')}</p></section>
    {!master && <details className="player-battle-log"><summary>Последние события</summary>{combat.events.slice(-8).map(item => <p key={item.id}>{item.label}</p>)}</details>}
    <CombatEffects surface={root} combat={combat}/>
  </div>;
}
