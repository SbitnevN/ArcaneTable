import React from 'react';
import { characters, type PublicParticipant } from './contracts';

// Trading-card stat plate: «HP/max ◆ AC»; the HP number turns amber, then red, as the hero is hurt.
export function CardVitals({ hp, maxHp, ac }: { hp?: number; maxHp?: number; ac?: number }) {
  const known = hp !== undefined && maxHp !== undefined && maxHp > 0;
  const ratio = known ? Math.max(0, Math.min(1, hp / maxHp)) : 1;
  const tone = hp === undefined ? 'hidden' : ratio > .5 ? 'good' : ratio > .25 ? 'hurt' : ratio > 0 ? 'low' : 'down';
  return <div className={`card-vitals tone-${tone}`}>
    <div className="vital vital-hp" role="meter" aria-label={hp === undefined ? 'Хиты скрыты' : known ? `Хиты: ${hp} из ${maxHp}` : `Хиты: ${hp}`} aria-valuemin={0} aria-valuemax={maxHp ?? hp ?? 0} aria-valuenow={hp ?? 0} title={known ? `${hp} из ${maxHp}` : undefined}>
      <span className="vital-num">{hp ?? '?'}</span>{known && <small className="vital-max">/{maxHp}</small>}
    </div>
    <div className="vital vital-ac" aria-label={ac === undefined ? 'Класс доспеха скрыт' : `Класс доспеха: ${ac}`}><span className="vital-num">{ac ?? '?'}</span></div>
  </div>;
}

export function TableCard({ item, active = false }: { item: PublicParticipant; active?: boolean }) {
  const character = item.portrait || characters.find(character => character.id === item.characterId);
  return <div className={`battle-card ${active ? 'is-active' : ''}`} data-participant-id={item.id} aria-label={`${item.name}${active ? ', сейчас ходит' : ''}`}>
    <div className="battle-portrait">{character ? <img draggable={false} className="portrait" src={character.image} width={character.width} height={character.height} alt={item.name}/> : <div className="enemy-portrait"><span aria-hidden="true">⚔</span><strong>{item.name}</strong></div>}
      <CardVitals hp={item.hp} maxHp={item.maxHp} ac={item.ac}/>
    </div><strong className="battle-name">{item.name}</strong>{item.statuses.length > 0 && <span className="battle-statuses">{item.statuses.join(' · ')}</span>}
  </div>;
}
