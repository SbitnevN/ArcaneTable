export { publicCombat } from '../src/combat-view.js';
import { participantStats } from '../src/combat-view.js';
import { randomUUID } from 'node:crypto';
import { characters, type Command, type Participant, type Project, type PublicCombat } from '../src/contracts.js';

function setHp(project: Project, participant: Participant, hp: number) {
  if (participant.characterId) project.games[participant.characterId].hp = hp; else participant.hp = hp;
}
export function combatCommand(project: Project, command: Command) {
  const archive = () => {
    if (!project.combat) return;
    if (project.encounters.length >= 100) throw new Error('Сначала удалите ненужное сохранённое столкновение');
    project.encounters = project.encounters.filter(item => item.id !== project.combat!.id);
    project.encounters.push(structuredClone(project.combat));
  };
  if (command.type === 'combat.load') {
    if (project.combat?.running) throw new Error('Сначала завершите текущий бой');
    const encounter = project.encounters.find(item => item.id === command.encounterId);
    if (!encounter) throw new Error('Столкновение не найдено');
    project.encounters = project.encounters.filter(item => item.id !== encounter.id); archive(); project.combat = structuredClone(encounter); return;
  }
  if (command.type === 'combat.archive.delete') { project.encounters = project.encounters.filter(item => item.id !== command.encounterId); return; }
  if (command.type === 'combat.create') {
    if (project.combat?.running) throw new Error('Сначала завершите текущий бой');
    const name = typeof command.name === 'string' ? command.name.trim() : '';
    if (!name || name.length > 100) throw new Error('Введите название боя');
    archive();
    project.combat = { id: randomUUID(), name, running: false, round: 1, activeId: null, approval: false, participants: [], pending: [], history: [], events: [] }; return;
  }
  const combat = project.combat;
  if (!combat) throw new Error('Сначала создайте столкновение');
  const log = (event: { label: string; targetId?: string; kind?: 'damage' | 'heal' | 'undo'; amount?: number }) => { combat.events.push({ id: randomUUID(), ...event }); if (combat.events.length > 200) combat.events.shift(); };
  const sort = () => [...combat.participants].sort((a, b) => b.initiative - a.initiative || a.id.localeCompare(b.id));
  const target = (id?: string) => { const item = combat.participants.find(item => item.id === id); if (!item) throw new Error('Участник не найден'); return item; };
  const amount = () => { if (!Number.isSafeInteger(command.amount) || command.amount! < 1 || command.amount! > 1000000) throw new Error('Укажите величину от 1 до 1000000'); return command.amount!; };
  const apply = (targetId: string, kind: string, value: number, source?: string) => {
    const item = target(targetId); const stats = participantStats(project, item);
    const hp = kind === 'damage' ? Math.max(0, stats.hp - value) : Math.min(stats.maxHp, stats.hp + value);
    combat.history.push({ targetId, before: stats.hp, after: hp }); if (combat.history.length > 100) combat.history.shift();
    setHp(project, item, hp);
    log({ targetId, kind: kind as 'damage' | 'heal', amount: value, label: `${source ? source + ' → ' : ''}${item.name}: ${kind === 'damage' ? 'урон' : 'лечение'} ${value}` });
  };
  switch (command.type) {
    case 'combat.add': {
      if (combat.participants.length >= 30) throw new Error('В столкновении уже 30 участников');
      if (command.characterId) {
        const character = project.characters.find(item => item.id === command.characterId);
        const game = project.games[command.characterId];
        if (!character || !game) throw new Error('Персонаж не найден');
        if (combat.participants.some(item => item.characterId === character.id)) throw new Error('Персонаж уже добавлен');
        combat.participants.push({ id: randomUUID(), name: character.name, side: 'ally', characterId: character.id, hp: game.hp, maxHp: game.maxHp, ac: game.ac, initiative: 0, visible: true, hideHp: false, hideAc: false, statuses: [] });
      } else {
        const template = project.monsters.find(m => m.id === command.monsterId);
        if (command.monsterId && !template) throw new Error('Монстр не найден');
        const value = template ? { name: template.name, maxHp: template.hp, ac: template.ac, portrait: template.portrait } : command.participant;
        if (!value || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 100) throw new Error('Введите имя противника');
        const maxHp = value.maxHp ?? 10; const ac = value.ac ?? 10; const initiative = value.initiative ?? 0;
        if (![maxHp, ac, initiative].every(Number.isSafeInteger) || maxHp < 1 || maxHp > 1000000 || ac < 0 || ac > 1000 || Math.abs(initiative) > 1000) throw new Error('Некорректные показатели противника');
        combat.participants.push({ id: randomUUID(), name: value.name.trim(), side: 'enemy', ...(template?.portrait ? { portrait: structuredClone(template.portrait) } : {}), hp: maxHp, maxHp, ac, initiative, visible: true, hideHp: true, hideAc: true, statuses: [] });
      }
      break;
    }
    case 'combat.remove': {
      const item = target(command.participantId);
      if (combat.running) throw new Error('Завершите бой перед удалением участников');
      combat.participants = combat.participants.filter(p => p.id !== item.id); combat.pending = combat.pending.filter(r => r.sourceId !== item.id && r.targetId !== item.id); break;
    }
    case 'combat.update': {
      const item = target(command.participantId); const value = command.participant;
      if (!value) throw new Error('Нет изменений участника');
      if (value.name !== undefined) { if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 100) throw new Error('Введите имя участника'); item.name = value.name.trim(); }
      if (value.initiative !== undefined) { if (!Number.isSafeInteger(value.initiative) || Math.abs(value.initiative) > 1000) throw new Error('Некорректная инициатива'); item.initiative = value.initiative; }
      for (const key of ['visible', 'hideHp', 'hideAc'] as const) if (value[key] !== undefined) { if (typeof value[key] !== 'boolean') throw new Error('Некорректная видимость'); item[key] = value[key]!; }
      if (value.statuses !== undefined) { if (!Array.isArray(value.statuses) || value.statuses.length > 15 || !value.statuses.every(value => typeof value === 'string' && value.length <= 100)) throw new Error('Некорректные состояния'); item.statuses = value.statuses; }
      break;
    }
    case 'combat.start':
      if (combat.running) throw new Error('Бой уже запущен');
      if (!combat.participants.length) throw new Error('Добавьте участников');
      combat.running = true; combat.round = 1; combat.activeId = sort()[0].id; log({ label: 'Бой начался' }); break;
    case 'combat.stop': combat.running = false; combat.pending = []; log({ label: 'Бой завершён' }); break;
    case 'combat.next': {
      if (!combat.running) throw new Error('Бой не запущен');
      const order = sort(); const index = order.findIndex(item => item.id === combat.activeId); const next = (index + 1) % order.length;
      if (next === 0) combat.round++; combat.activeId = order[next].id; break;
    }
    case 'combat.active': combat.activeId = target(command.participantId).id; break;
    case 'combat.mode': if (typeof command.approval !== 'boolean') throw new Error('Некорректный режим'); combat.approval = command.approval; break;
    case 'combat.damage': case 'combat.heal': apply(target(command.targetId).id, command.type === 'combat.damage' ? 'damage' : 'heal', amount()); break;
    case 'combat.request': {
      if (!combat.running) throw new Error('Бой ещё не начался');
      const source = combat.participants.find(item => item.characterId === command.characterId);
      const item = target(command.targetId);
      if (!source || source.id !== combat.activeId) throw new Error('Дождитесь хода своего персонажа');
      if (!item.visible) throw new Error('Цель недоступна');
      if (command.kind !== 'damage' && command.kind !== 'heal') throw new Error('Неизвестное действие');
      const value = amount();
      if (combat.approval) {
        if (combat.pending.some(request => request.sourceId === source.id)) throw new Error('Предыдущее действие ожидает решения мастера');
        combat.pending.push({ id: command.id, sourceId: source.id, targetId: item.id, kind: command.kind, amount: value });
      } else apply(item.id, command.kind, value, source.name);
      break;
    }
    case 'combat.approve': case 'combat.reject': {
      const request = combat.pending.find(item => item.id === command.requestId);
      if (!request) throw new Error('Запрос уже обработан');
      if (command.type === 'combat.approve') apply(request.targetId, request.kind, request.amount, target(request.sourceId).name);
      combat.pending = combat.pending.filter(item => item.id !== request.id); break;
    }
    case 'combat.undo': {
      const entry = combat.history.at(-1);
      if (!entry) throw new Error('Нет действия для отмены');
      const item = target(entry.targetId); const stats = participantStats(project, item);
      if (stats.hp !== entry.after) throw new Error('ХП уже изменены вне этого действия. Отмена недоступна');
      setHp(project, item, entry.before); combat.history.pop(); log({ label: `${item.name}: последнее изменение отменено`, targetId: item.id, kind: 'undo' }); break;
    }
    default: throw new Error('Неизвестная боевая команда');
  }
}
