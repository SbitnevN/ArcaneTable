import React, { useState } from 'react';
import { newId, type Command, type InventoryItem, type Project, type PublicLoot } from './contracts';
import type { PlayerPost } from './player-combat';
import { AddItemDialog, TileArt } from './inventory';
import { inventoryFrom, itemKindLabels } from './library';
import { Modal } from './ui';

function LootTiles({ pool, picked, onPick }: { pool: PublicLoot['pool']; picked: string | null; onPick?: (id: string) => void }) {
  if (!pool.length) return <p className="ui-empty">Добыча разобрана.</p>;
  return <div className="inventory-grid loot-grid">{pool.map(item => <button type="button" key={item.id} className={`inventory-slot filled rarity-${item.rarity || 'mundane'}${picked === item.id ? ' selected' : ''}`} title={item.name} disabled={!onPick} onClick={() => onPick?.(item.id)}><TileArt item={item}/>{item.quantity > 1 && <b className="inventory-count">{item.quantity}</b>}</button>)}</div>;
}

// Player view: heroes pick one stack each in initiative order; others watch whose turn it is.
export function PlayerLoot({ loot, characterId, busy, post }: { loot: PublicLoot; characterId: string; busy: boolean; post: PlayerPost }) {
  const [picked, setPicked] = useState<string | null>(null);
  const mine = loot.turn === characterId;
  const item = loot.pool.find(entry => entry.id === picked);
  const turnName = loot.order.find(entry => entry.characterId === loot.turn)?.name;
  return <section className={mine ? 'player-paper loot-panel my-turn' : 'player-paper loot-panel'}>
    <div className="loot-head"><span className="player-kicker">ДЕЛЁЖ ДОБЫЧИ</span><h2>{!loot.pool.length ? 'Всё разобрано' : mine ? 'Ваш выбор!' : `Выбирает: ${turnName || '…'}`}</h2></div>
    <ol className="loot-order">{loot.order.map(entry => <li key={entry.characterId} className={entry.characterId === loot.turn ? 'active' : ''}>{entry.name}</li>)}</ol>
    <LootTiles pool={loot.pool} picked={picked} onPick={mine ? setPicked : undefined}/>
    {mine && <div className="loot-actions">{item && <p><strong>{item.name}</strong>{item.quantity > 1 ? ` ×${item.quantity}` : ''}{item.description ? ` — ${item.description}` : ''}</p>}
      <button type="button" className="primary" disabled={busy || !item} onClick={() => { void post('/api/player/command', { id: newId(), type: 'player.loot', kind: 'take', itemId: item!.id }); setPicked(null); }}>Забрать</button>
      <button type="button" disabled={busy} onClick={() => void post('/api/player/command', { id: newId(), type: 'player.loot', kind: 'pass' })}>Пропустить ход</button></div>}
    {loot.log.length > 0 && <ul className="loot-log">{loot.log.slice().reverse().map((line, index) => <li key={index}>{line}</li>)}</ul>}
  </section>;
}

export function projectCatalog(project: Project): InventoryItem[] {
  return [...(project.items || []).map(item => inventoryFrom(item, item.id, 1, itemKindLabels[item.kind])), ...(project.weapons || []).map(weapon => inventoryFrom(weapon, weapon.id, 1, 'Оружие'))];
}

// Editable list of loot tiles for an enemy (encounter wizard and combat editor).
export function LootEditor({ project, value, onChange, busy }: { project: Project; value: InventoryItem[]; onChange: (value: InventoryItem[]) => void; busy: boolean }) {
  const [adding, setAdding] = useState(false);
  return <div className="loot-editor">
    {value.map(item => <span key={item.id} className="loot-chip"><span className="loot-chip-art"><TileArt item={item}/></span>{item.name}{item.quantity > 1 ? ` ×${item.quantity}` : ''}<button type="button" aria-label={`Убрать ${item.name}`} onClick={() => onChange(value.filter(entry => entry.id !== item.id))}>×</button></span>)}
    <button type="button" className="ui-button small" disabled={busy || value.length >= 50} onClick={() => setAdding(true)}>＋ Лут</button>
    {adding && <AddItemDialog allowEffects title="Добыча с противника" confirm="Добавить в лут" catalog={projectCatalog(project)} busy={busy} onClose={() => setAdding(false)} onAdd={item => { onChange([...value, item]); setAdding(false); }}/>}
  </div>;
}

// Master controls: start sharing, watch the turn, hand items out directly or finish.
export function MasterLoot({ project, command, busy }: { project: Project; command: (type: string, extra?: Partial<Command>) => void; busy: boolean }) {
  const combat = project.combat; const loot = combat?.loot;
  const [picked, setPicked] = useState<string | null>(null);
  const [giving, setGiving] = useState(false);
  if (!combat) return null;
  const enemiesWithLoot = combat.participants.filter(item => item.side === 'enemy' && item.loot?.length).length;
  if (!loot) return enemiesWithLoot ? <section className="editor-card loot-panel"><div className="section-heading"><h2>Добыча</h2><span>Лут у {enemiesWithLoot} противн.</span></div><p className="ui-note">{combat.running ? 'Делить можно добычу побеждённых (0 ХП) противников. После завершения боя — всех.' : 'Бой завершён: можно делить добычу всех противников.'}</p><button type="button" className="primary" disabled={busy} onClick={() => command('combat.loot.start')}>Начать делёж по инициативе</button></section> : null;
  const turnId = loot.order[loot.turn];
  const name = (id: string) => project.characters.find(item => item.id === id)?.name || 'Герой';
  const item = loot.pool.find(entry => entry.id === picked);
  return <section className="editor-card loot-panel">
    <div className="section-heading"><h2>Делёж добычи</h2><span>{loot.pool.length ? `Выбирает: ${name(turnId)}` : 'Всё разобрано'}</span></div>
    <ol className="loot-order">{loot.order.map((id, index) => <li key={id} className={index === loot.turn && loot.pool.length ? 'active' : ''}>{name(id)}</li>)}</ol>
    <LootTiles pool={loot.pool} picked={picked} onPick={setPicked}/>
    <div className="action-row">
      {loot.pool.length > 0 && <><button type="button" disabled={busy || !item} onClick={() => setGiving(true)}>Отдать выбранное…</button><button type="button" disabled={busy} onClick={() => command('combat.loot.pass', { characterId: turnId })}>Пропустить ход {name(turnId)}</button></>}
      <button type="button" className={loot.pool.length ? 'danger' : 'primary'} disabled={busy} onClick={() => command('combat.loot.end')}>{loot.pool.length ? 'Закончить делёж' : 'Готово'}</button>
    </div>
    {loot.log.length > 0 && <ul className="loot-log">{loot.log.slice().reverse().map((line, index) => <li key={index}>{line}</li>)}</ul>}
    {giving && item && <Modal title={`Отдать «${item.name}»`} subtitle="Без очереди" onClose={() => setGiving(false)}><div className="action-list">{loot.order.map(id => <button type="button" key={id} disabled={busy} onClick={() => { command('combat.loot.give', { itemId: item.id, characterId: id }); setGiving(false); setPicked(null); }}><strong>{name(id)}</strong></button>)}</div></Modal>}
  </section>;
}
