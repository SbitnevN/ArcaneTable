import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { parseItemJson, exportItemJson } from '../build-desktop/src/item-import.js';
import { Store } from '../build-desktop/backend/store.js';
import { createService } from '../build-desktop/backend/service.js';

const command = (type, projectId, extra = {}) => ({ id: randomUUID(), type, projectId, ...extra });
const generated = [
  { name: 'Пламенный клинок', type: 'оружие', rarity: 'редкий', damage: '1d8 рубящий + 1d6 огонь', price: '500 зм', properties: ['универсальное', 'неизвестное'], versatile: '1к10', bonus: 1 },
  { name: 'Зелье великана', type: 'Potion', rarity: 'uncommon', heal: '4к4+4', price: 150, currency: 'gp', conditions: ['отравлен', 'летает'] },
  { name: 'Латы предков', type: 'доспех', armorType: 'тяжёлый', ac: 18, strength: 15, stealth: true, price: '1 500 зм', icon: 'armor' },
  { name: 'Странный камень', description: 'Тёплый на ощупь' },
  { type: 'зелье', price: 5 },
  { name: 'Стрелы', type: 'боеприпасы', quantity: 20, price: '1 зм' }
];

test('Generated JSON is parsed leniently into library items and weapons', () => {
  const result = parseItemJson(generated, 'nn.json');
  assert.deepEqual(result.errors, ['nn.json #5: нет названия']);
  assert.equal(result.weapons.length, 1);
  const [blade] = result.weapons;
  assert.deepEqual([blade.damage, blade.properties, blade.versatile, blade.bonus, blade.cost], [[{ dice: '1d8', type: 'рубящий' }, { dice: '1d6', type: 'огонь' }], ['универсальное'], '1d10', 1, '500 зм']);
  const byName = Object.fromEntries(result.items.map(item => [item.name, item]));
  assert.deepEqual([byName['Зелье великана'].kind, byName['Зелье великана'].rarity, byName['Зелье великана'].heal, byName['Зелье великана'].conditions], ['potion', 'uncommon', '4d4+4', ['отравлен']]);
  assert.deepEqual([byName['Латы предков'].armorType, byName['Латы предков'].ac, byName['Латы предков'].price, byName['Латы предков'].stealth], ['heavy', 18, 1500, true]);
  assert.deepEqual([byName['Странный камень'].kind, byName['Странный камень'].rarity], ['gear', 'mundane']);
  assert.equal(byName['Стрелы'].quantity, 20);
  assert.equal(parseItemJson({ items: [{ name: 'Один' }] }).items.length, 1, '{ items: [...] } wrapper');
  assert.equal(parseItemJson({ name: 'Одиночный' }).items.length, 1, 'single object');
  const again = parseItemJson(JSON.parse(exportItemJson(result.items, result.weapons)), 'export');
  assert.deepEqual([again.items.length, again.weapons.length, again.errors], [result.items.length, 1, []], 'exported files import back');
});

test('Bulk import is all-or-nothing and the spell translation store is shared but master-only to write', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'arcane-import-'));
  const service = await createService(directory);
  const server = createServer((req, res) => { void service.handle(req, res, () => { res.writeHead(404); res.end(); }); }); service.attach(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const store = service.store; const projectId = store.state().activeId;
    const { items, weapons } = parseItemJson(generated);
    store.execute(command('library.import', projectId, { libraryItems: items, weapons }));
    let project = store.state().projects[0];
    assert.deepEqual([project.items.length, project.weapons.length], [4, 1]);
    assert.ok(project.items.every(item => !items.some(source => source.id === item.id)), 'imported entries get fresh ids');
    assert.throws(() => store.execute(command('library.import', projectId, { libraryItems: [...items, { ...items[0], kind: 'laser' }] })), /не прошли проверку/);
    project = store.state().projects[0]; assert.equal(project.items.length, 4, 'nothing imported from a bad batch');
    const master = (path, body) => fetch(origin + path, { method: body ? 'POST' : 'GET', headers: { Origin: origin, Authorization: `Bearer ${service.master}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json() }));
    assert.equal((await master('/api/spell-texts', { texts: { '2024:Fireball': { name: 'Огненный шар', text: 'Яркая вспышка' } } })).status, 200);
    assert.equal((await master('/api/spell-texts', { texts: { 'Fireball': { text: 'x' } } })).status, 400);
    const grant = service.access.create('player', 'Телефон', 1, projectId); service.access.claim(grant.id, 'paladin', 'Игрок');
    const player = (path, body) => fetch(origin + path, { method: body ? 'POST' : 'GET', headers: { Origin: origin, Authorization: `Bearer ${grant.token}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json() }));
    assert.deepEqual((await player('/api/spell-texts')).body, { '2024:Fireball': { name: 'Огненный шар', text: 'Яркая вспышка' } });
    assert.equal((await player('/api/spell-texts', { texts: { '2024:Shield': { text: 'взлом' } } })).status, 403);
    assert.deepEqual(JSON.parse(readFileSync(join(directory, 'spell-texts.json'), 'utf8')), { '2024:Fireball': { name: 'Огненный шар', text: 'Яркая вспышка' } });
  } finally { server.close(); service.close(); rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test('Every SRD spell has a Russian name', () => {
  const catalog = JSON.parse(readFileSync('public/references/catalog.json', 'utf8')).entries.filter(entry => entry.kind === 'spells');
  const names = JSON.parse(readFileSync('public/references/spells-ru.json', 'utf8')).names;
  assert.deepEqual(catalog.filter(entry => !names[entry.name]).map(entry => entry.name), []);
});
