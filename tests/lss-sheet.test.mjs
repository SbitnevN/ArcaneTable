import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import { importLss, exportLss } from '../build-desktop/backend/lss.js';
import { characters, validGame } from '../build-desktop/src/contracts.js';

const example = JSON.parse(readFileSync(new URL('./fixtures/lss-example.json', import.meta.url), 'utf8'));
const validate = new Ajv({ strict: false }).compile(JSON.parse(readFileSync(new URL('./fixtures/lss-schema.json', import.meta.url), 'utf8')));
const outer = () => ({ jsonType: 'character', version: '2', edition: '2014', data: JSON.stringify(example) });
const inner = value => JSON.parse(value.data);

test('LSS saves, skills, weapons, initiative and coins import into the sheet', () => {
  const { game } = importLss(outer());
  assert.ok(validGame(game));
  assert.deepEqual(game.saves, ['con', 'wis']);
  assert.equal(game.skills, 'Атлетика +3, История +2, Проницательность +5, Убеждение +3');
  assert.deepEqual(game.coins, { cp: 0, sp: 8, ep: 0, gp: 15, pp: 0 });
  assert.equal(game.initiative, undefined, 'null initiative means «use Dexterity»');
  const [mace, crossbow] = game.attacks;
  assert.deepEqual([mace.name, mace.kind, mace.bonus, mace.damage], ['Булава', 'melee', 3, [{ dice: '1d6+1', type: 'дробящий' }]]);
  assert.deepEqual([crossbow.kind, crossbow.bonus, crossbow.damage[0].dice, crossbow.effect], ['ranged', 2, '1d8', 'перезарядка, боеприпасы (80/320 фт.)']);
});

test('Sheet edits round-trip through LSS without touching untouched weapons', () => {
  const { character, game } = importLss(outer());
  const edited = structuredClone(game);
  edited.saves = ['str', 'wis'];
  edited.skills = 'Атлетика +5, Скрытность +6';
  edited.initiative = 4;
  edited.coins = { ...game.coins, gp: 99 };
  edited.features = [{ id: 'f', name: 'Второе дыхание', text: 'Восстановить 1d10+уровень ХП.' }];
  edited.attacks = [game.attacks[0], { id: 'flame', name: 'Пылающий меч', kind: 'melee', bonus: 7, reach: '5 фт.', damage: [{ dice: '1d8+4', type: 'рубящий' }, { dice: '1d6', type: 'огонь' }], conditions: [], effect: 'Светится' }];
  const exported = exportLss(character, edited); const data = inner(exported);
  assert.ok(validate(data), JSON.stringify(validate.errors));
  assert.deepEqual(data.weaponsList[0], example.weaponsList[0], 'unchanged weapon keeps its LSS formula');
  assert.deepEqual(data.weaponsList[1], { id: 'flame', name: { value: 'Пылающий меч' }, dmg: { value: '1к8+4' }, ability: 'none', isProf: false, modBonus: { value: 7 }, dmgType: { value: 'рубящий' }, notes: { value: '5 фт. · +1d6 огонь · Светится' }, notesVisibility: true });
  assert.equal(data.skills.athletics.isProf, 2); assert.equal(data.skills.stealth.customModifier, 6); assert.equal(data.skills.history.isProf, false);
  assert.deepEqual([data.saves.str.isProf, data.saves.con.isProf], [true, false]);
  assert.deepEqual([data.vitality.initiative, data.coins.gp], [{ value: '4' }, { value: 99 }]);
  assert.match(JSON.stringify(data.text.features), /Второе дыхание/);
  const back = importLss(exported).game;
  for (const key of ['saves', 'skills', 'initiative', 'coins']) assert.deepEqual(back[key], edited[key], key);
  assert.deepEqual(back.attacks.map(a => [a.id, a.name, a.bonus, a.reach, a.damage, a.effect]), edited.attacks.map(a => [a.id, a.name, a.bonus, a.reach, a.damage, a.effect]));
});

test('A sheet made in Arcane Table exports every field into a valid LSS file', () => {
  const game = { hp: 12, maxHp: 12, ac: 16, blocks: [], edition: '2024', level: 3, abilities: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 13 }, saves: ['str', 'con'], skills: 'Атлетика +5', initiative: 1, coins: { gp: 40 },
    attacks: [{ id: 'axe', name: 'Секира', kind: 'melee', bonus: 5, reach: '', damage: [{ dice: '1d12+3', type: 'рубящий' }], conditions: [], effect: '' }], features: [{ id: 'rage', name: 'Ярость', text: '2 раза в день.' }] };
  const data = inner(exportLss({ ...characters[2], name: 'Грог' }, game));
  assert.ok(validate(data), JSON.stringify(validate.errors));
  const back = importLss({ jsonType: 'character', version: '2', edition: '2024', data: JSON.stringify(data) }).game;
  assert.deepEqual([back.saves, back.skills, back.initiative, back.coins.gp, back.attacks[0].damage[0].dice, back.attacks[0].bonus], [['str', 'con'], 'Атлетика +5', 1, 40, '1d12+3', 5]);
});
