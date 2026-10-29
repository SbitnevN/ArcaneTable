import type { Project, Participant, PublicCombat, PublicParticipant } from './contracts.js';
import { effectiveStats } from './library.js';

// Armour class shown on cards includes equipped item effects; stored values stay the hero's base.
export const heroAc = (project: Project, characterId: string) => effectiveStats(project.games[characterId], project.items || []).ac;

export function publicParty(project: Project): PublicParticipant[] {
  return project.characters.filter(character => !character.offstage).map(character => ({ id: character.id, characterId: character.id, portrait: character, name: character.name, side: 'ally', initiative: 0, statuses: [], hp: project.games[character.id].hp, maxHp: project.games[character.id].maxHp, ac: heroAc(project, character.id) }));
}

export function participantStats(project: Project, participant: Participant) {
  const game = participant.characterId ? project.games[participant.characterId] : undefined;
  return { hp: game?.hp ?? participant.hp, maxHp: game?.maxHp ?? participant.maxHp, ac: game ? heroAc(project, participant.characterId!) : participant.ac };
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
    }), events: combat.events.filter(event => (!event.targetId || ids.has(event.targetId)) && (!event.sourceId || ids.has(event.sourceId))).slice(-15).map(event => ({ ...event })),
    loot: combat.loot ? { pool: combat.loot.pool.map(({ sourceId: _source, ...item }) => item), order: combat.loot.order.map(characterId => ({ characterId, name: project.characters.find(item => item.id === characterId)?.name || 'Герой' })), turn: combat.loot.pool.length ? combat.loot.order[combat.loot.turn] ?? null : null, log: combat.loot.log.slice(-8) } : null };
}
