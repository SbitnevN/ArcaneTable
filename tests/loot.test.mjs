import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { Store } from '../build-desktop/backend/store.js';
import { createService } from '../build-desktop/backend/service.js';
import { importLss, exportLss } from '../build-desktop/backend/lss.js';
import { validateProject } from '../build-desktop/backend/archive.js';
import { publicCombat } from '../build-desktop/src/combat-view.js';
import { characters, validGame } from '../build-desktop/src/contracts.js';

const command = (type, projectId, extra = {}) => ({ id: randomUUID(), type, projectId, ...extra });
const tile = (name, quantity = 1, extra = {}) => ({ id: randomUUID(), name, icon: 'potion', quantity, description: '', kind: 'Зелья', ...extra });
async function fixture(fn) {
  const directory = mkdtempSync(join(tmpdir(), 'arcane-loot-'));
  const store = await Store.open(directory);
  try { await fn(store, directory); } finally { store.close(); rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}
function battle(store) {
  const projectId = store.state().activeId;
  store.execute(command('combat.create', projectId, { name: 'Склеп' }));
  store.execute(command('combat.add', projectId, { characterId: 'paladin' }));
  store.execute(command('combat.add', projectId, { characterId: 'tarkhun' }));
  store.execute(command('combat.add', projectId, { participant: { name: 'Гоблин', maxHp: 7, ac: 13 }, count: 2, loot: [tile('Зелье лечения'), tile('Медяки', 12, { icon: 'coins', kind: 'Сокровища' })] }));
  const combat = store.state().projects[0].combat;
  const [paladin, tarkhun] = combat.participants;
  store.execute(command('combat.update', projectId, { participantId: paladin.id, participant: { initiative: 5 } }));
  store.execute(command('combat.update', projectId, { participantId: tarkhun.id, participant: { initiative: 18 } }));
  return projectId;
}

test('Enemies carry their own loot copies and defeated ones drop it in initiative order', async () => fixture(store => {
  const projectId = battle(store);
  let combat = store.state().projects[0].combat;
  const goblins = combat.participants.filter(p => p.side === 'enemy');
  assert.equal(goblins.length, 2); assert.equal(goblins[0].loot.length, 2); assert.notEqual(goblins[0].loot[0].id, goblins[1].loot[0].id);
  store.execute(command('combat.start', projectId));
  assert.throws(() => store.execute(command('combat.loot.start', projectId)), /побеждённых/);
  store.execute(command('combat.damage', projectId, { targetId: goblins[0].id, amount: 7 }));
  store.execute(command('combat.loot.start', projectId));
  combat = store.state().projects[0].combat;
  assert.deepEqual([combat.loot.pool.length, combat.loot.order], [2, ['tarkhun', 'paladin']], 'only the defeated goblin drops loot; highest initiative chooses first');
  assert.equal(combat.participants.find(p => p.id === goblins[0].id).loot, undefined); assert.equal(combat.participants.find(p => p.id === goblins[1].id).loot.length, 2);
  const view = publicCombat(store.state().projects[0]);
  assert.equal(view.loot.turn, 'tarkhun'); assert.equal(JSON.stringify(view.loot).includes('sourceId'), false);
  const potion = combat.loot.pool[0].id;
  assert.throws(() => store.execute(command('combat.loot.take', projectId, { characterId: 'paladin', itemId: potion })), /другой герой/);
  store.execute(command('combat.loot.take', projectId, { characterId: 'tarkhun', itemId: potion }));
  store.execute(command('combat.loot.pass', projectId, { characterId: 'paladin' }));
  const coins = store.state().projects[0].combat.loot.pool[0].id;
  store.execute(command('combat.loot.give', projectId, { characterId: 'paladin', itemId: coins }));
  const project = store.state().projects[0];
  assert.deepEqual(project.games.tarkhun.items.map(i => [i.name, i.quantity]), [['Зелье лечения', 1]]);
  assert.deepEqual(project.games.paladin.items.map(i => [i.name, i.quantity]), [['Медяки', 12]]);
  assert.deepEqual(project.combat.loot.log, ['Тархун забирает «Зелье лечения»', 'Паладин пропускает', 'Паладин забирает «Медяки» ×12']);
  validateProject(structuredClone(project));
  store.execute(command('combat.loot.end', projectId));
  assert.equal(store.state().projects[0].combat.loot, null);
}));

test('Stopped fights share all remaining loot and stacks merge in the inventory', async () => fixture(store => {
  const projectId = battle(store);
  store.execute(command('combat.stop', projectId));
  store.execute(command('combat.loot.start', projectId));
  const loot = store.state().projects[0].combat.loot;
  assert.equal(loot.pool.length, 4);
  const potions = loot.pool.filter(i => i.name === 'Зелье лечения').map(i => i.id);
  store.execute(command('combat.loot.take', projectId, { characterId: 'tarkhun', itemId: potions[0] }));
  store.execute(command('combat.loot.give', projectId, { characterId: 'tarkhun', itemId: potions[1] }));
  assert.deepEqual(store.state().projects[0].games.tarkhun.items.map(i => [i.name, i.quantity]), [['Зелье лечения', 2]]);
  assert.equal(validGame({ ...store.state().projects[0].games.tarkhun, items: [{ ...tile('x'), quantity: 0 }] }), false);
}));

test('Players manage their tile inventory, see the item catalog and take loot only on their turn', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'arcane-loot-http-'));
  const service = await createService(directory);
  const server = createServer((req, res) => { void service.handle(req, res, () => { res.writeHead(404); res.end(); }); }); service.attach(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const store = service.store; const projectId = battle(store);
    store.execute(command('item.save', projectId, { libraryItem: { id: 'rope', name: 'Верёвка', kind: 'gear', rarity: 'mundane', attunement: false, price: 1, currency: 'gp', weight: '', icon: 'rope', description: 'Пеньковая.', effect: '', notes: 'СЕКРЕТ_МАСТЕРА', damage: [], conditions: [] } }));
    const grant = service.access.create('player', 'Телефон', 1, projectId); service.access.claim(grant.id, 'paladin', 'Игрок');
    const call = (path, body) => fetch(origin + path, { method: body ? 'POST' : 'GET', headers: { Origin: origin, Authorization: `Bearer ${grant.token}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json() }));
    const view = (await call('/api/player')).body;
    assert.deepEqual(view.catalog.map(i => [i.name, i.icon]), [['Верёвка', 'rope']]);
    assert.equal(JSON.stringify(view).includes('СЕКРЕТ_МАСТЕРА'), false);
    const items = [tile('Верёвка', 2, { icon: 'rope', sourceId: 'rope' })];
    assert.equal((await call('/api/player/command', { id: randomUUID(), type: 'player.update', sheet: { items, saves: ['str'], coins: { gp: 5 } } })).status, 200);
    let game = store.state().projects[0].games.paladin;
    assert.deepEqual([game.items[0].quantity, game.saves, game.coins.gp], [2, ['str'], 5]);
    store.execute(command('combat.stop', projectId)); store.execute(command('combat.loot.start', projectId));
    const itemId = store.state().projects[0].combat.loot.pool[0].id;
    assert.equal((await call('/api/player/command', { id: randomUUID(), type: 'player.loot', kind: 'take', itemId })).status, 400, 'Тархун ходит первым');
    store.execute(command('combat.loot.pass', projectId, { characterId: 'tarkhun' }));
    const taken = await call('/api/player/command', { id: randomUUID(), type: 'player.loot', kind: 'take', itemId });
    assert.equal(taken.status, 200); assert.equal(taken.body.combat.loot.turn, 'tarkhun');
    game = store.state().projects[0].games.paladin;
    assert.ok(game.items.some(i => i.name === 'Зелье лечения'));
  } finally { server.close(); service.close(); rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test('Inventory tiles round-trip through the LSS items block', () => {
  const game = { hp: 10, maxHp: 10, ac: 12, blocks: [], edition: '2024', level: 1, abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, items: [tile('Верёвка', 2), tile('Щит', 1, { equipped: true })] };
  const exported = exportLss({ ...characters[2], name: 'Тест' }, game);
  const back = importLss(exported).game;
  assert.deepEqual(back.items.map(i => [i.name, i.quantity, Boolean(i.equipped)]), [['Верёвка', 2, false], ['Щит', 1, true]]);
  assert.equal(back.blocks.some(b => b.id === 'items'), false);
});
