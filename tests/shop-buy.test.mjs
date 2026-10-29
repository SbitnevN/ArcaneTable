import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { coinTotal, payCoins, priceInCopper } from '../build-desktop/src/shop-view.js';
import { blankItem } from '../build-desktop/src/library.js';
import { createService } from '../build-desktop/backend/service.js';

test('Paying keeps the hero\'s own coins where possible and gives change', () => {
  assert.equal(priceInCopper(0.5, 'gp', 3), 150);
  assert.deepEqual(payCoins({ gp: 32 }, 500), { pp: 0, gp: 27, ep: 0, sp: 0, cp: 0 });
  assert.deepEqual(payCoins({ gp: 1 }, 1), { pp: 0, gp: 0, ep: 0, sp: 9, cp: 9 }, 'a gold coin is broken into change');
  assert.deepEqual(payCoins({ pp: 1, sp: 3 }, 25), { pp: 1, gp: 0, ep: 0, sp: 0, cp: 5 });
  assert.equal(payCoins({ sp: 4 }, 50), null, 'not enough money');
  for (const [coins, cost] of [[{ pp: 2, gp: 3, ep: 1, sp: 7, cp: 9 }, 1234], [{ cp: 500 }, 499], [{ ep: 3 }, 120]]) assert.equal(coinTotal(payCoins(coins, cost)), coinTotal(coins) - cost);
});

test('A player buys from the shop on air into the inventory', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'arcane-shop-buy-'));
  const service = await createService(directory);
  const server = createServer((req, res) => { void service.handle(req, res, () => { res.writeHead(404); res.end(); }); }); service.attach(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const store = service.store; const projectId = store.state().activeId;
    const run = (type, extra = {}) => store.execute({ id: randomUUID(), type, projectId, ...extra });
    run('item.save', { libraryItem: { ...blankItem('ring-lib', 'ring'), name: 'Кольцо защиты', rarity: 'rare', price: 20, effects: [{ stat: 'ac', op: 'add', value: 1 }] } });
    const shopId = store.state().projects[0].shops[0].id;
    run('shop.item.import', { shopId, itemId: 'ring-lib', amount: 1 });
    run('character.update', { characterId: 'paladin', game: { ...store.state().projects[0].games.paladin, coins: { gp: 80 }, items: [] } });
    const grant = service.access.create('player', 'Телефон', 1, projectId); service.access.claim(grant.id, 'paladin', 'Игрок');
    const buy = body => fetch(origin + '/api/player/command', { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${grant.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: randomUUID(), type: 'player.buy', shopId, ...body }) });
    const potion = store.state().projects[0].shops[0].items.find(item => item.name === 'Зелье лечения');
    assert.equal((await buy({ itemId: potion.id, amount: 1 })).status, 400, 'the shop is closed until shown');
    run('shop.show', { shopId });
    const view = await (await fetch(origin + '/api/player', { headers: { Authorization: `Bearer ${grant.token}` } })).json();
    assert.equal(view.shop.items.length, store.state().projects[0].shops[0].items.length, 'the phone lists the whole assortment');
    assert.equal((await buy({ itemId: potion.id, amount: 2 })).status, 400, 'two potions cost 100 gp');
    assert.equal((await buy({ itemId: potion.id, amount: 1 })).status, 200);
    const ring = store.state().projects[0].shops[0].items.find(item => item.sourceId === 'ring-lib');
    assert.equal((await buy({ itemId: ring.id })).status, 200);
    assert.equal((await buy({ itemId: ring.id })).status, 400, 'sold out');
    const game = store.state().projects[0].games.paladin;
    assert.deepEqual(game.coins, { pp: 0, gp: 10, ep: 0, sp: 0, cp: 0 }, '80 gp − 50 − 20');
    assert.deepEqual(game.items.map(item => [item.name, item.quantity, item.sourceId || '']), [['Зелье лечения', 1, ''], ['Кольцо защиты', 1, 'ring-lib']]);
    assert.deepEqual(store.state().projects[0].shops[0].items.filter(item => item.id === potion.id || item.id === ring.id).map(item => item.stock), [2, 0]);
  } finally { server.close(); service.close(); rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
