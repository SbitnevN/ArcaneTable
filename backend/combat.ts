export { publicCombat } from '../src/combat-view.js';
import { participantStats } from '../src/combat-view.js';
import { randomUUID } from 'node:crypto';
import { stackInto, validInventoryItem } from '../src/library.js';
import { characters, type InventoryItem, type Command, type Participant, type Project, type PublicCombat } from '../src/contracts.js';

function lootList(value: unknown): InventoryItem[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50 || !value.every(validInventoryItem)) throw new Error('Некорректная добыча');
  return structuredClone(value);
}
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
  const log = (event: { label: string; sourceId?: string; targetId?: string; kind?: 'damage' | 'heal' | 'undo'; amount?: number }) => { combat.events.push({ id: randomUUID(), at: Date.now(), ...event }); if (combat.events.length > 200) combat.events.shift(); };
  const sort = () => [...combat.participants].sort((a, b) => b.initiative - a.initiative || a.id.localeCompare(b.id));
  const target = (id?: string) => { const item = combat.participants.find(item => item.id === id); if (!item) throw new Error('Участник не найден'); return item; };
  const amount = () => { if (!Number.isSafeInteger(command.amount) || command.amount! < 1 || command.amount! > 1000000) throw new Error('Укажите величину от 1 до 1000000'); return command.amount!; };
  const apply = (targetId: string, kind: string, value: number, source?: Participant) => {
    const item = target(targetId); const stats = participantStats(project, item);
    const hp = kind === 'damage' ? Math.max(0, stats.hp - value) : Math.min(stats.maxHp, stats.hp + value);
    combat.history.push({ targetId, before: stats.hp, after: hp }); if (combat.history.length > 100) combat.history.shift();
    setHp(project, item, hp);
    log({ ...(source ? { sourceId: source.id } : {}), targetId, kind: kind as 'damage' | 'heal', amount: value, label: `${source ? source.name + ' → ' : ''}${item.name}: ${kind === 'damage' ? 'урон' : 'лечение'} ${value}` });
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
        const count = command.count ?? 1;
        if (!Number.isSafeInteger(count) || count < 1 || count > 10) throw new Error('Можно добавить от 1 до 10 противников');
        if (combat.participants.length + count > 30) throw new Error('В столкновении может быть не больше 30 участников');
        const source = template ? template.id : command.participant?.source;
        if (source !== undefined && (typeof source !== 'string' || !/^[\w-]{1,100}$/.test(source))) throw new Error('Некорректный источник противника');
        const base = value.name.trim();
        const taken = combat.participants.filter(item => item.name === base || item.name.startsWith(`${base} `)).length;
        const loot = lootList(command.loot ?? template?.loot);
        for (let index = 0; index < count; index++) {
          const name = count > 1 || taken ? `${base} ${taken + index + 1}`.slice(0, 100) : base;
          combat.participants.push({ id: randomUUID(), name, side: 'enemy', ...(template?.portrait ? { portrait: structuredClone(template.portrait) } : {}), ...(source ? { source } : {}), hp: maxHp, maxHp, ac, initiative, visible: true, hideHp: true, hideAc: true, statuses: [], ...(loot.length ? { loot: loot.map(item => ({ ...item, id: randomUUID() })) } : {}) });
        }
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
    case 'combat.damage': case 'combat.heal': apply(target(command.targetId).id, command.type === 'combat.damage' ? 'damage' : 'heal', amount(), command.sourceId ? target(command.sourceId) : combat.activeId ? target(combat.activeId) : undefined); break;
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
      } else apply(item.id, command.kind, value, source);
      break;
    }
    case 'combat.approve': case 'combat.reject': {
      const request = combat.pending.find(item => item.id === command.requestId);
      if (!request) throw new Error('Запрос уже обработан');
      if (command.type === 'combat.approve') apply(request.targetId, request.kind, request.amount, target(request.sourceId));
      combat.pending = combat.pending.filter(item => item.id !== request.id); break;
    }
    case 'combat.undo': {
      const entry = combat.history.at(-1);
      if (!entry) throw new Error('Нет действия для отмены');
      const item = target(entry.targetId); const stats = participantStats(project, item);
      if (stats.hp !== entry.after) throw new Error('ХП уже изменены вне этого действия. Отмена недоступна');
      setHp(project, item, entry.before); combat.history.pop(); log({ label: `${item.name}: последнее изменение отменено`, targetId: item.id, kind: 'undo' }); break;
    }
    case 'combat.loot.set': {
      const enemy = target(command.participantId);
      enemy.loot = lootList(command.loot); if (!enemy.loot.length) delete enemy.loot; break;
    }
    case 'combat.loot.start': {
      // Defeated enemies drop their loot; once the fight is stopped every enemy's loot is shared.
      const pool = combat.participants.filter(item => item.side === 'enemy' && (!combat.running || participantStats(project, item).hp === 0)).flatMap(item => item.loot || []);
      const order = sort().filter(item => item.side === 'ally' && item.characterId && project.games[item.characterId]).map(item => item.characterId!);
      if (!pool.length) throw new Error(combat.running ? 'У побеждённых противников нет добычи' : 'У противников нет добычи');
      if (!order.length) throw new Error('В бою нет героев, которые могут забрать добычу');
      for (const item of combat.participants) if (item.side === 'enemy' && (!combat.running || participantStats(project, item).hp === 0)) delete item.loot;
      combat.loot = { pool: pool.map(item => ({ ...structuredClone(item), id: randomUUID() })), order, turn: 0, log: [] }; break;
    }
    case 'combat.loot.take': case 'combat.loot.give': case 'combat.loot.pass': {
      const loot = combat.loot; if (!loot) throw new Error('Дележ добычи не начат');
      const characterId = command.characterId || '';
      if (command.type !== 'combat.loot.give' && loot.order[loot.turn] !== characterId) throw new Error('Сейчас выбирает другой герой');
      const name = (id: string) => project.characters.find(item => item.id === id)?.name || 'Герой';
      if (command.type === 'combat.loot.pass') loot.log.push(`${name(characterId)} пропускает`);
      else {
        const index = loot.pool.findIndex(item => item.id === command.itemId);
        const game = project.games[characterId];
        if (index < 0 || !game) throw new Error('Предмет или герой не найдены');
        const [item] = loot.pool.splice(index, 1);
        game.items = stackInto(game.items || [], { ...item, id: randomUUID(), equipped: undefined });
        if (game.items.length > 300) throw new Error('Инвентарь героя переполнен');
        loot.log.push(`${name(characterId)} забирает «${item.name}»${item.quantity > 1 ? ` ×${item.quantity}` : ''}`);
      }
      if (loot.log.length > 50) loot.log.shift();
      if (command.type !== 'combat.loot.give') loot.turn = (loot.turn + 1) % loot.order.length;
      break;
    }
    case 'combat.loot.end': combat.loot = null; break;
    default: throw new Error('Неизвестная боевая команда');
  }
}
