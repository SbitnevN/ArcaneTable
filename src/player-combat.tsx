import React from 'react';
import { newId, type PlayerView } from './contracts';
import { CombatControls } from './combat-controls';
export type PlayerPost = (path: string, value: unknown) => Promise<boolean>;
export function PlayerCombat({ view, busy, post }: { view: PlayerView; busy: boolean; post: PlayerPost }) {
  const combat = view.combat;
  if (!combat?.running || !view.own) return <section className="player-empty"><span aria-hidden="true">⚔</span><h2>Пока без сражений</h2><p>Когда мастер начнёт бой, здесь появятся карты участников.</p></section>;
  const source = combat.participants.find(item => item.characterId === view.own?.characterId);
  return <CombatControls combat={combat} sourceId={source?.id} canAct={Boolean(source && source.id === combat.activeId)} busy={busy} pending={view.pendingAction} onAct={(_, targetId, kind, amount) => post('/api/player/command', { id: newId(), type: 'player.action', targetId, kind, amount })}/>;
}
