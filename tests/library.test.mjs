import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../build-desktop/backend/store.js';
import { readProjectArchive, writeProjectArchive, validateProject } from '../build-desktop/backend/archive.js';
import { averageDice, parseStatblock, parseSpellDamage, blankSpell, blankWeapon, blankItem, validItem, validSpell, validWeapon } from '../build-desktop/src/library.js';
import { publicShop } from '../build-desktop/src/shop-view.js';
import { validMonster, validGame } from '../build-desktop/src/contracts.js';

const command = (type, projectId, extra = {}) => ({ id: randomUUID(), type, projectId, ...extra });
async function fixture(fn) {
  const directory = mkdtempSync(join(tmpdir(), 'arcane-library-'));
  const store = await Store.open(directory);
  try { await fn(store, directory); } finally { store.close(); rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}
const catalog = JSON.parse(readFileSync('public/references/catalog.json', 'utf8')).entries;
const monster = (extra = {}) => ({ id: 'ogre', name: 'Огр', edition: '2024', hp: 68, ac: 11, type: 'Большой великан', cr: '2', speed: '40 фт.', abilities: { str: 19, dex: 8, con: 16, int: 5, wis: 7, cha: 7 }, description: '', source: 'Мастерский', ...extra });

test('Dice averages and SRD statblocks turn into editable attacks, saves and traits', () => {
  assert.equal(averageDice('2d6+3'), 10); assert.equal(averageDice('1d8 − 1'), 3); assert.equal(averageDice('5'), 5); assert.equal(averageDice('d20'), 10); assert.equal(averageDice('2к6'), null);
  const orc = parseStatblock(catalog.find(e => e.kind === 'monsters' && e.name === 'Orc' && e.edition === '2014').text, randomUUID);
  assert.deepEqual(orc.actions.map(a => [a.name, a.kind, a.bonus, a.damage[0].dice, a.damage[0].type]), [['Greataxe', 'melee', 5, '1d12+3', 'рубящий'], ['Javelin', 'melee', 5, '1d6+3', 'колющий']]);
  assert.deepEqual([orc.size, orc.hpDice, orc.traits[0].name], ['Средний', '2d8+6', 'Aggressive']);
  const dragon = parseStatblock(catalog.find(e => e.kind === 'monsters' && e.name === 'Adult Red Dragon' && e.edition === '2024').text, randomUUID);
  const breath = dragon.actions.find(a => a.name === 'Fire Breath');
  assert.deepEqual([breath.kind, breath.dc, breath.save, breath.onSave, breath.recharge, breath.damage[0].dice], ['save', 21, 'dex', 'half', 'Recharge 5–6', '17d6']);
  assert.ok(dragon.traits.some(t => t.name.startsWith('Legendary Resistance')) && dragon.legendary.length === 3);
  let parsedAll = 0;
  for (const entry of catalog.filter(e => e.kind === 'monsters')) { const value = { ...monster({ id: 'x', name: entry.name }), ...parseStatblock(entry.text, randomUUID) }; if (validMonster(value)) parsedAll++; }
  assert.equal(parsedAll, catalog.filter(e => e.kind === 'monsters').length, 'every SRD monster copy passes validation');
  const fireball = parseSpellDamage(catalog.find(e => e.kind === 'spells' && e.name === 'Fireball').text);
  assert.deepEqual([fireball.attack, fireball.save, fireball.onSave, fireball.damage[0].dice], ['save', 'dex', 'half', '8d6']);
});

test('Monster, spell and weapon libraries validate structured fields and survive a project archive', async () => fixture(async (store, directory) => {
  const projectId = store.state().activeId;
  const detailed = monster({ size: 'Большой', saves: { str: 6 }, traits: [{ id: 't', name: 'Мощь', text: 'Тяжёлый.' }], actions: [{ id: 'a', name: 'Дубина', kind: 'melee', bonus: 6, reach: '5 фт.', damage: [{ dice: '2d8+4', type: 'дробящий' }], conditions: ['сбит с ног'], effect: '' }] });
  store.execute(command('monster.save', projectId, { monster: detailed }));
  assert.equal(store.state().projects[0].monsters[0].actions[0].damage[0].dice, '2d8+4');
  assert.throws(() => store.execute(command('monster.save', projectId, { monster: monster({ actions: [{ id: 'a', name: 'x', kind: 'laser', damage: [], effect: '' }] }) })), /шаблон/);
  assert.throws(() => store.execute(command('monster.save', projectId, { monster: monster({ saves: { luck: 3 } }) })), /шаблон/);
  const spell = { ...blankSpell('fire'), name: 'Огненный шар', level: 3, damage: [{ dice: '8d6', type: 'огонь' }], conditions: ['сбит с ног'], higher: '+1d6 за круг' };
  const weapon = { ...blankWeapon('sword'), name: 'Пылающий клинок', bonus: 2, properties: ['универсальное'], versatile: '1d10', damage: [{ dice: '1d8', type: 'рубящий' }, { dice: '1d6', type: 'огонь' }] };
  assert.ok(validSpell(spell) && validWeapon(weapon));
  assert.equal(validSpell({ ...spell, level: 10 }), false); assert.equal(validWeapon({ ...weapon, bonus: 99 }), false);
  store.execute(command('spell.save', projectId, { spell })); store.execute(command('weapon.save', projectId, { weapon }));
  store.execute(command('spell.save', projectId, { spell: { ...spell, name: 'Огненный шар+' } }));
  assert.deepEqual([store.state().projects[0].spells.length, store.state().projects[0].spells[0].name], [1, 'Огненный шар+']);
  assert.throws(() => store.execute(command('weapon.save', projectId, { weapon: { ...weapon, name: '' } })), /оружие/);
  const game = store.state().projects[0].games.paladin;
  assert.ok(validGame({ ...game, attacks: detailed.actions, features: detailed.traits, saves: ['str', 'cha'], initiative: 2, skills: 'Атлетика +5' }));
  assert.equal(validGame({ ...game, saves: ['luck'] }), false);
  store.execute(command('character.update', projectId, { characterId: 'paladin', game: { ...game, attacks: detailed.actions, saves: ['wis'] } }));
  const project = store.state().projects[0];
  const file = join(directory, 'project.zip');
  await writeProjectArchive(project, directory, resolve('public'), file);
  const target = mkdtempSync(join(tmpdir(), 'arcane-library-restore-'));
  try {
    const restored = (await readProjectArchive(file, target)).project;
    assert.deepEqual([restored.spells[0].name, restored.weapons[0].versatile, restored.monsters[0].traits[0].name, restored.games.paladin.attacks[0].name], ['Огненный шар+', '1d10', 'Мощь', 'Дубина']);
    const legacy = structuredClone(restored); delete legacy.spells; delete legacy.weapons; validateProject(legacy);
    assert.deepEqual([legacy.spells, legacy.weapons], [[], []]);
  } finally { rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  store.execute(command('spell.delete', projectId, { itemId: 'fire' })); store.execute(command('weapon.delete', projectId, { itemId: 'sword' }));
  assert.deepEqual([store.state().projects[0].spells.length, store.state().projects[0].weapons.length], [0, 0]);
}));

test('Bestiary adds several numbered enemies with a statblock source that stays private', async () => fixture(store => {
  const projectId = store.state().activeId;
  store.execute(command('monster.save', projectId, { monster: monster() }));
  store.execute(command('combat.create', projectId, { name: 'Мост' }));
  store.execute(command('combat.add', projectId, { monsterId: 'ogre', count: 2 }));
  store.execute(command('combat.add', projectId, { participant: { name: 'Orc', maxHp: 15, ac: 13, source: 'srd-2014-monsters-162' }, count: 3 }));
  store.execute(command('combat.add', projectId, { monsterId: 'ogre' }));
  const combat = store.state().projects[0].combat;
  assert.deepEqual(combat.participants.map(p => [p.name, p.source]), [['Огр 1', 'ogre'], ['Огр 2', 'ogre'], ['Orc 1', 'srd-2014-monsters-162'], ['Orc 2', 'srd-2014-monsters-162'], ['Orc 3', 'srd-2014-monsters-162'], ['Огр 3', 'ogre']]);
  assert.throws(() => store.execute(command('combat.add', projectId, { monsterId: 'ogre', count: 11 })), /от 1 до 10/);
  assert.throws(() => store.execute(command('combat.add', projectId, { participant: { name: 'X', source: '../../etc' } })), /источник/);
  store.execute(command('combat.update', projectId, { participantId: combat.participants[0].id, participant: { visible: true } }));
  store.execute(command('project.live', projectId)); store.execute(command('combat.start', projectId));
  const view = JSON.stringify(store.publicView());
  assert.equal(view.includes('srd-2014-monsters-162') || view.includes('"source"'), false, 'statblock links never reach the shared screen');
}));

test('Migration 12 adds empty spell and weapon libraries to old projects', async () => fixture(store => {
  const project = store.state().projects[0];
  assert.deepEqual([project.spells, project.weapons], [[], []]);
}));

test('Project edition drives every hero sheet and new heroes', async () => fixture(store => {
  const projectId = store.state().activeId;
  assert.equal(store.state().projects[0].edition, '2024');
  store.execute(command('project.edition', projectId, { name: '2014' }));
  store.execute(command('character.create', projectId, { name: 'Новичок' }));
  const project = store.state().projects[0];
  assert.equal(project.edition, '2014');
  assert.ok(Object.values(project.games).every(game => game.edition === '2014'));
  assert.throws(() => store.execute(command('project.edition', projectId, { name: '5e' })), /2014 или 2024/);
}));

test('Items library fills shops with copies that keep icon, price and artwork but hide notes', async () => fixture(async (store, directory) => {
  const projectId = store.state().activeId;
  const potion = { ...blankItem('heal', 'potion'), name: 'Зелье лечения', rarity: 'common', price: 50, heal: '2d4+2', icon: 'potion', description: 'Красный флакон.', notes: 'СЕКРЕТ' };
  assert.ok(validItem(potion)); assert.equal(validItem({ ...potion, kind: 'laser' }), false); assert.equal(validItem({ ...potion, price: -1 }), false);
  store.execute(command('item.save', projectId, { libraryItem: potion }));
  store.execute(command('item.artwork', projectId, { itemId: 'heal' }), undefined, undefined, { image: '/media/0f0f0f0f-0000-4000-8000-000000000000.png', width: 64, height: 64 });
  store.execute(command('weapon.save', projectId, { weapon: { ...blankWeapon('bow'), name: 'Длинный лук', range: 'ranged', cost: '50 зм' } }));
  const shopId = store.state().projects[0].shops[0].id;
  store.execute(command('shop.item.import', projectId, { shopId, itemId: 'heal', amount: 3 }));
  store.execute(command('shop.item.import', projectId, { shopId, itemId: 'bow', amount: -1 }));
  assert.throws(() => store.execute(command('shop.item.import', projectId, { shopId, itemId: 'nope' })), /не найден/);
  const items = store.state().projects[0].shops[0].items.slice(-2);
  assert.deepEqual(items.map(i => [i.name, i.category, i.price, i.currency, i.stock, i.icon, i.sourceId]), [['Зелье лечения', 'Зелья', 50, 'gp', 3, 'potion', 'heal'], ['Длинный лук', 'Оружие', 50, 'gp', null, 'bow', 'bow']]);
  assert.equal(items[0].artwork.image, '/media/0f0f0f0f-0000-4000-8000-000000000000.png');
  store.execute(command('shop.show', projectId, { shopId }));
  const view = JSON.stringify(publicShop(store.state().projects[0]));
  assert.ok(view.includes('"icon":"potion"')); assert.equal(view.includes('СЕКРЕТ') || view.includes('sourceId'), false);
  store.execute(command('item.save', projectId, { libraryItem: { ...potion, price: 70 } }));
  assert.equal(store.state().projects[0].items[0].artwork.image, '/media/0f0f0f0f-0000-4000-8000-000000000000.png', 'editing keeps the uploaded artwork');
  validateProject(structuredClone(store.state().projects[0]));
  store.execute(command('item.delete', projectId, { itemId: 'heal' }));
  assert.equal(store.state().projects[0].items.length, 0);
}));
