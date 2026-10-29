import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../build-desktop/backend/store.js';

async function fixture(fn) {
  const directory = mkdtempSync(join(tmpdir(), 'arcane-combat-'));
  const store = await Store.open(directory);
  try { await fn(store, directory); } finally { store.close(); rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}
function setup(store) {
  const projectId = store.state().activeId;
  const run = (type, extra = {}) => store.execute({ id: randomUUID(), type, projectId, ...extra });
  run('combat.create', { name: 'Засада' });
  run('combat.add', { characterId: 'paladin' });
  run('combat.add', { participant: { name: 'Гоблин', maxHp: 37, ac: 19, initiative: 7 } });
  const combat = () => store.state().projects[0].combat;
  const hero = combat().participants.find(item => item.characterId === 'paladin');
  const enemy = combat().participants.find(item => item.side === 'enemy');
  run('combat.update', { participantId: hero.id, participant: { initiative: 15 } });
  return { run, combat, projectId, hero, enemy };
}
test('Initiative advances turns and rounds and restores combat after reopening', async () => fixture(async (store, directory) => {
  const { run, combat, hero, enemy } = setup(store);
  run('combat.start'); assert.equal(combat().activeId, hero.id); assert.equal(combat().round, 1);
  run('combat.next'); assert.equal(combat().activeId, enemy.id);
  run('combat.next'); assert.equal(combat().activeId, hero.id); assert.equal(combat().round, 2);
  assert.throws(() => run('combat.start'));
  assert.throws(() => run('combat.remove', { participantId: enemy.id }));
  const restored = await Store.open(directory);
  try { assert.deepEqual(restored.state().projects[0].combat, combat()); } finally { restored.close(); }
}));
test('Damage/healing clamp HP, hero sheets stay consistent and Undo refuses stale values', async () => fixture(store => {
  const { run, combat, projectId, hero, enemy } = setup(store);
  run('combat.damage', { targetId: enemy.id, amount: 99 }); assert.equal(combat().participants.find(p => p.id === enemy.id).hp, 0);
  run('combat.undo'); assert.equal(combat().participants.find(p => p.id === enemy.id).hp, 37);
  run('combat.heal', { targetId: enemy.id, amount: 99 }); assert.equal(combat().participants.find(p => p.id === enemy.id).hp, 37);
  run('combat.damage', { targetId: hero.id, amount: 3 }); assert.equal(store.state().projects[0].games.paladin.hp, 7);
  run('combat.undo'); assert.equal(store.state().projects[0].games.paladin.hp, 10);
  run('combat.damage', { targetId: hero.id, amount: 2 });
  store.execute({ id: randomUUID(), type: 'character.update', projectId, characterId: 'paladin', game: { hp: 6, maxHp: 10, ac: 10, blocks: [] } });
  assert.throws(() => run('combat.undo'));
  assert.throws(() => run('combat.damage', { targetId: hero.id, amount: -2 }));
}));
test('Approval does not apply damage before confirmation and duplicate commands never apply twice', async () => fixture(store => {
  const { run, combat, projectId, hero, enemy } = setup(store);
  run('combat.start'); run('combat.mode', { approval: true });
  const request = { id: randomUUID(), type: 'combat.request', projectId, characterId: 'paladin', targetId: enemy.id, kind: 'damage', amount: 12 };
  store.execute(request); store.execute(request);
  assert.equal(combat().pending.length, 1); assert.equal(combat().participants.find(p => p.id === enemy.id).hp, 37);
  const approval = { id: randomUUID(), type: 'combat.approve', projectId, requestId: request.id };
  store.execute(approval); store.execute(approval);
  assert.equal(combat().participants.find(p => p.id === enemy.id).hp, 25); assert.equal(combat().pending.length, 0);
  assert.throws(() => run('combat.approve', { requestId: request.id }));
  run('combat.active', { participantId: enemy.id });
  assert.throws(() => store.execute({ ...request, id: randomUUID() }));
  run('combat.active', { participantId: hero.id }); run('combat.mode', { approval: false });
  store.execute({ ...request, id: randomUUID() }); assert.equal(combat().participants.find(p => p.id === enemy.id).hp, 13);
}));
test('Hidden enemies and exact secret HP/AC never enter display serialization', async () => fixture(store => {
  const { run, combat, projectId, enemy } = setup(store);
  run('combat.add', { participant: { name: 'СЕКРЕТНЫЙ ВРАГ', maxHp: 513, ac: 39 } });
  const hidden = combat().participants.at(-1);
  run('combat.update', { participantId: hidden.id, participant: { visible: false } });
  run('combat.damage', { targetId: hidden.id, amount: 10 });
  run('combat.start'); run('project.live');
  const view = store.publicView();
  assert.equal(view.combat.participants.length, 2);
  const publicEnemy = view.combat.participants.find(item => item.id === enemy.id);
  assert.ok(!Object.hasOwn(publicEnemy, 'hp')); assert.ok(!Object.hasOwn(publicEnemy, 'maxHp')); assert.ok(!Object.hasOwn(publicEnemy, 'ac'));
  assert.ok(!JSON.stringify(view).includes('СЕКРЕТНЫЙ')); assert.ok(!Object.hasOwn(view.combat, 'history')); assert.ok(!Object.hasOwn(view.combat, 'pending'));
  run('combat.update', { participantId: enemy.id, participant: { hideHp: false, hideAc: false } });
  assert.equal(store.publicView().combat.participants.find(item => item.id === enemy.id).hp, 37);
}));
test('Prepared encounters are archived and can be reopened without losing participants', async () => fixture(store => {
  const { run, combat } = setup(store);
  const firstId = combat().id;
  run('combat.create', { name: 'Второй бой' });
  assert.equal(store.state().projects[0].encounters[0].participants.length, 2);
  run('combat.load', { encounterId: firstId });
  assert.equal(combat().name, 'Засада'); assert.equal(combat().participants.length, 2);
  assert.equal(store.state().projects[0].encounters[0].name, 'Второй бой');
}));

test('Actions keep their actual source through approval and hide events from hidden attackers', async () => fixture(store => {
  const { run, combat, hero, enemy, projectId } = setup(store);
  run('combat.start');
  run('combat.damage', { sourceId: enemy.id, targetId: hero.id, amount: 2 });
  let event = combat().events.at(-1);
  assert.equal(event.sourceId, enemy.id); assert.equal(event.targetId, hero.id); assert.ok(event.at > 0);
  assert.equal(store.publicView().combat.events.at(-1).sourceId, enemy.id);
  const before = combat();
  assert.throws(() => run('combat.damage', { sourceId: 'missing', targetId: hero.id, amount: 2 }));
  assert.deepEqual(combat(), before);
  run('combat.mode', { approval: true });
  const requestId = randomUUID();
  store.execute({ id: requestId, type: 'combat.request', projectId, characterId: hero.characterId, targetId: enemy.id, kind: 'damage', amount: 1 });
  run('combat.active', { participantId: enemy.id });
  run('combat.approve', { requestId });
  event = combat().events.at(-1); assert.equal(event.sourceId, hero.id);
  run('combat.update', { participantId: enemy.id, participant: { visible: false } });
  const serialized = JSON.stringify(store.publicView().combat);
  assert.ok(!serialized.includes(enemy.id)); assert.ok(!serialized.includes(enemy.name));
}));

test('Starting combat publishes its project, replaces a shop and preserves the table background', async () => fixture(store => {
  const { run, projectId } = setup(store);
  const initial = store.state().projects[0];
  run('shop.show', { shopId: initial.shops[0].id });
  store.execute({ id: randomUUID(), type: 'project.create', name: 'Другой эфир' });
  const otherId = store.state().activeId;
  store.execute({ id: randomUUID(), type: 'project.live', projectId: otherId });
  assert.equal(store.publicView().projectName, 'Другой эфир');
  run('combat.start');
  assert.equal(store.state().liveId, projectId);
  assert.equal(store.publicView().combat.running, true);
  assert.equal(store.publicView().shop, null);
  assert.equal(store.publicView().scene.id, initial.sceneId);
  assert.ok(!Object.hasOwn(store.publicView(), 'party'));
  run('combat.stop');
  const party = store.publicView().party;
  assert.equal(party.length, initial.characters.length);
  assert.ok(party.every(item => item.side === 'ally' && !Object.hasOwn(item, 'blocks') && item.maxHp === initial.games[item.characterId].maxHp), 'the hand shows an HP bar, so max HP is public; sheet blocks are not');
}));
