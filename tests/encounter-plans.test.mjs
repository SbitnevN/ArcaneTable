import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../build-desktop/backend/store.js';
import { planDifficulty } from '../build-desktop/src/difficulty.js';

async function fixture(fn) {
  const directory = mkdtempSync(join(tmpdir(), 'arcane-plans-'));
  const store = await Store.open(directory);
  try { await fn(store, directory); } finally { store.close(); rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}
const plan = (extra = {}) => ({ id: 'barracks', name: ' Драка в бараке ', note: 'Делят пайку', sceneId: 'test-scene', enemies: [{ id: 'g', name: 'Гоблин', hp: 7, ac: 15, count: 3, cr: '1/4', loot: [] }], ...extra });

test('A plan keeps enemies without heroes and starts as a combat with the chosen heroes', async () => fixture(async store => {
  const projectId = store.state().activeId;
  const run = (type, extra = {}) => store.execute({ id: randomUUID(), type, projectId, ...extra });
  const project = () => store.state().projects[0];
  run('plan.save', { plan: plan() });
  assert.equal(project().plans.length, 1); assert.equal(project().plans[0].name, 'Драка в бараке');
  run('monster.save', { monster: { id: 'tikhon', name: 'Тихон Лом', edition: '2014', hp: 85, ac: 15, type: 'гуманоид', cr: '6', speed: '25 фт.', abilities: { str: 20, dex: 12, con: 20, int: 11, wis: 13, cha: 16 }, description: '', source: 'Тюрьма', loot: [] } });
  run('plan.save', { plan: plan({ enemies: [...plan().enemies, { id: 't', name: 'Тихон Лом', hp: 85, ac: 15, count: 1, monsterId: 'tikhon', loot: [] }] }) });
  assert.equal(project().plans.length, 1, 'saving the same id updates the plan');
  run('combat.create', { name: 'Старый бой' });
  run('plan.start', { planId: 'barracks', heroes: ['paladin', 'tarkhun'] });
  const combat = project().combat;
  assert.equal(combat.name, 'Драка в бараке'); assert.equal(combat.running, false);
  assert.deepEqual(combat.participants.filter(p => p.side === 'ally').map(p => p.characterId).sort(), ['paladin', 'tarkhun']);
  assert.deepEqual(combat.participants.filter(p => p.side === 'enemy').map(p => p.name), ['Гоблин 1', 'Гоблин 2', 'Гоблин 3', 'Тихон Лом']);
  assert.equal(combat.participants.find(p => p.name === 'Тихон Лом').source, 'tikhon');
  assert.equal(project().sceneId, 'test-scene');
  assert.deepEqual(project().encounters.map(item => item.name), ['Старый бой'], 'the previous combat is put aside');
  assert.equal(project().plans.length, 1, 'the plan stays for the next time');
  run('combat.start');
  assert.throws(() => run('plan.start', { planId: 'barracks', heroes: [] }), /завершите текущий бой/);
  assert.throws(() => run('plan.save', { plan: plan({ id: 'bad', enemies: [{ id: 'x', name: '', hp: 1, ac: 1, count: 1, loot: [] }] }) }), /Некорректная заготовка/);
  run('plan.delete', { planId: 'barracks' }); assert.equal(project().plans.length, 0);
}));

test('Difficulty follows the 2014 thresholds and the number of enemies', () => {
  const project = { monsters: [{ id: 'm', cr: '6', xp: 2300 }], games: Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f'].map(id => [id, { level: 6 }])) };
  const heroes = ['a', 'b', 'c', 'd', 'e', 'f'];
  const one = planDifficulty(project, plan({ enemies: [{ id: 'x', name: 'Тихон', hp: 85, ac: 15, count: 1, monsterId: 'm', loot: [] }] }), heroes);
  assert.equal(one.adjusted, 1150); assert.equal(one.label, 'пустяк', 'one CR 6 enemy vs six level 6 heroes is below easy (1800), ×0.5 for a big party');
  const three = planDifficulty(project, plan({ enemies: [{ id: 'x', name: 'Тихон', hp: 85, ac: 15, count: 3, monsterId: 'm', loot: [] }] }), heroes);
  assert.equal(three.adjusted, 10350); assert.equal(three.label, 'смертельно');
  assert.equal(planDifficulty(project, plan(), []), null, 'no heroes, no verdict');
  assert.equal(planDifficulty(project, plan({ enemies: [{ id: 'q', name: 'Кто-то', hp: 5, ac: 10, count: 1, loot: [] }] }), heroes), null, 'unknown danger, no verdict');
});
