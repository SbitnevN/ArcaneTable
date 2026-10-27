import type { Project, Participant, PublicCombat } from './contracts.js';

export function participantStats(project: Project, participant: Participant) {
  const game = participant.characterId ? project.games[participant.characterId] : undefined;
  return { hp: game?.hp ?? participant.hp, maxHp: game?.maxHp ?? participant.maxHp, ac: game?.ac ?? participant.ac };
}
export function publicCombat(project: Project): PublicCombat | null {
  const combat = project.combat;
  if (!combat) return null;
  const visible = combat.participants.filter(item => item.visible);
  const ids = new Set(visible.map(item => item.id));
  return { name: combat.name, running: combat.running, round: combat.round, activeId: combat.activeId && ids.has(combat.activeId) ? combat.activeId : null,
    participants: visible.map(item => {
      const stats = participantStats(project, item);
      return { ...(item.portrait ? { portrait: item.portrait } : {}), ...(item.characterId ? { portrait: project.characters.find(c => c.id === item.characterId) } : {}), id: item.id, name: item.name, side: item.side, ...(item.characterId ? { characterId: item.characterId } : {}), initiative: item.initiative, statuses: item.statuses,
        ...(!item.hideHp ? { hp: stats.hp, maxHp: stats.maxHp } : {}), ...(!item.hideAc ? { ac: stats.ac } : {}) };
    }), events: combat.events.filter(event => !event.targetId || ids.has(event.targetId)).slice(-15).map(event => ({ ...event })) };
}
