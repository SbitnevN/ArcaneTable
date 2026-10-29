import React, { useEffect, useState } from 'react';
import type { Command, Project, PublicCombat } from './contracts';
import { participantStats } from './combat-view';
import { CombatControls } from './combat-controls';

export function MasterCombat({ project, busy, command }: { project: Project; busy: boolean; command: (type: string, extra?: Partial<Command>) => void }) {
  const [sourceId, setSourceId] = useState('');
  const combat = project.combat;
  useEffect(() => { setSourceId(combat?.activeId || ''); }, [combat?.id, combat?.activeId]);
  if (!combat?.participants.length) return null;
  const source = combat.participants.find(item => item.id === sourceId) || combat.participants.find(item => item.id === combat.activeId) || combat.participants.find(item => item.side === 'enemy') || combat.participants[0];
  const view: PublicCombat = { name: combat.name, round: combat.round, running: combat.running, activeId: combat.activeId, events: combat.events, participants: combat.participants.map(item => ({ ...item, ...participantStats(project, item), portrait: item.characterId ? project.characters.find(character => character.id === item.characterId) : item.portrait })) };
  return <section className="master-battle player-app"><CombatControls combat={view} sourceId={source.id} onSource={setSourceId} canAct={!busy} busy={busy} master hiddenIds={combat.participants.filter(item => !item.visible).map(item => item.id)} onAct={async (sourceId, targetId, kind, amount) => { command(kind === 'damage' ? 'combat.damage' : 'combat.heal', { sourceId, targetId, amount }); }}/></section>;
}
