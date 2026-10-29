import React, { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { CombatEvent, PublicCombat, PublicParticipant } from './contracts';
import { TableCard } from './table-card';

type Box = { x: number; y: number; width: number; height: number };
type Effect = { event: CombatEvent; source?: PublicParticipant; from?: Box; to: Box; target: HTMLElement; sourceElement?: HTMLElement };
const box = (element: HTMLElement): Box => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };

export function CombatEffects({ surface, combat }: { surface: RefObject<HTMLDivElement | null>; combat?: PublicCombat | null }) {
  const seen = useRef<Set<string> | null>(null);
  const [effects, setEffects] = useState<Effect[]>([]);
  useEffect(() => {
    if (!combat) { seen.current = null; return; }
    if (!seen.current) { seen.current = new Set(combat.events.map(event => event.id)); return; }
    const fresh = combat.events.filter(event => !seen.current!.has(event.id));
    seen.current = new Set(combat.events.map(event => event.id));
    const root = surface.current;
    if (!root || !root.getClientRects().length) return;
    for (const event of fresh) {
      if (!event.targetId || !event.kind || !event.at || Date.now() - event.at > 5000) continue;
      const find = (id: string) => root.querySelector<HTMLElement>(`[data-participant-id="${CSS.escape(id)}"] .battle-portrait`);
      const target = find(event.targetId);
      if (!target || !target.getBoundingClientRect().width) continue;
      const source = combat.participants.find(item => item.id === event.sourceId);
      const sourceElement = source ? find(source.id) : null;
      setEffects(current => [...current, { event, source, ...(sourceElement ? { from: box(sourceElement), sourceElement } : {}), to: box(target), target }]);
    }
  }, [combat?.events, surface]);
  return createPortal(<div className="combat-fx-layer" aria-hidden="true">{effects.map(effect => <ActionEffect key={effect.event.id} effect={effect} onFinish={() => setEffects(current => current.filter(item => item !== effect))}/>)}</div>, document.body);
}

function ActionEffect({ effect, onFinish }: { effect: Effect; onFinish: () => void }) {
  const flyer = useRef<HTMLDivElement>(null);
  const heal = effect.event.kind !== 'damage';
  const [impact, setImpact] = useState(heal || !effect.from);
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animations: Animation[] = [];
    let impactTimer: ReturnType<typeof setTimeout> | undefined;
    const duration = heal ? 1800 : 1100;
    const finish = setTimeout(onFinish, reduce ? 200 : duration);
    if (!heal && !reduce) {
      const { from, to, sourceElement, target } = effect;
      if (from && flyer.current) {
        const dx = to.x + to.width / 2 - from.x - from.width / 2;
        const dy = to.y + to.height / 2 - from.y - from.height / 2;
        const lift = Math.max(35, from.height * .32);
        const tilt = dx < 0 ? -9 : 9;
        sourceElement?.classList.add('combat-source-away');
        animations.push(flyer.current.animate([
          { transform: 'translate(0,0) scale(1) rotate(0deg)', offset: 0 },
          { transform: `translate(${-dx * .07}px,${-lift}px) scale(1.16) rotate(${-tilt}deg)`, offset: .2 },
          { transform: `translate(${dx}px,${dy}px) scale(1.04) rotate(${tilt}deg)`, offset: .49 },
          { transform: `translate(${dx * .88}px,${dy * .88 - 14}px) scale(1.08) rotate(${-tilt / 2}deg)`, offset: .61 },
          { transform: 'translate(0,0) scale(1) rotate(0deg)', offset: 1 }
        ], { duration: 1050, easing: 'cubic-bezier(.3,.05,.25,1)', fill: 'forwards' }));
      }
      impactTimer = setTimeout(() => {
        setImpact(true);
        animations.push(target.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(9px,3px) rotate(3deg)' }, { transform: 'translate(-6px,-2px) rotate(-2deg)' }, { transform: 'translate(0,0)' }], { duration: 280 }));
      }, effect.from ? 480 : 0);
    }
    return () => { clearTimeout(finish); clearTimeout(impactTimer); animations.forEach(animation => animation.cancel()); effect.sourceElement?.classList.remove('combat-source-away'); };
  }, []);
  return <>
    {!heal && effect.from && effect.source && <div ref={flyer} className="combat-flying-card" data-fx-source={effect.source.id} data-fx-destination={effect.event.targetId} style={{ left: effect.from.x, top: effect.from.y, width: effect.from.width, height: effect.from.height }}><TableCard item={effect.source}/></div>}
    {impact && <div className={heal ? 'combat-heal-aura' : 'combat-strike'} data-fx-target={effect.event.targetId} style={{ left: effect.to.x, top: effect.to.y, width: effect.to.width, height: effect.to.height }}>
      {heal ? <><i className="aura-bloom"/><i className="aura-ring ring-one"/><i className="aura-ring ring-two"/>{Array.from({ length: 10 }, (_, index) => <i className="aura-spark" key={index} style={{ '--spark-x': `${12 + (index * 23 % 78)}%`, '--spark-delay': `${index * 65}ms` } as React.CSSProperties}/> )}</> : <><i className="strike-burst"/><i className="strike-slash"/></>}
      {effect.event.amount !== undefined && <strong className="combat-fx-amount">{heal ? '+' : '−'}{effect.event.amount}</strong>}
    </div>}
  </>;
}
