import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import Ajv from 'ajv';
import { importLss, exportLss } from '../build-desktop/backend/lss.js';
import { Store } from '../build-desktop/backend/store.js';

const example = JSON.parse(readFileSync(new URL('./fixtures/lss-example.json', import.meta.url), 'utf8'));
const schema = JSON.parse(readFileSync(new URL('./fixtures/lss-schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv({ strict: false });
const validate = ajv.compile(schema);
const outer = () => ({ jsonType: 'character', version: '2', edition: '2014', sheetEdition: '2024', data: JSON.stringify(example), spells: { mode: 'cards', prepared: ['bless'], book: ['bless','cure-wounds'], pending: [{ slug: 'test', list: 'cleric' }] }, disabledBlocks: { 'notes-right': ['traits'] }, futureExtension: { test: 'keep' } });

test('Official LSS example imports bonuses, shield, sheet fields and exports unchanged inner document', () => {
  const original = outer(); const { character, game } = importLss(original);
  assert.equal(character.name, 'Сестра Иоланда'); assert.equal(game.maxHp, 27); assert.equal(game.hp, 24); assert.equal(game.ac, 13);
  assert.equal(game.abilities.wis, 16); assert.equal(game.edition, '2014'); assert.deepEqual(game.spellBook, ['bless','cure-wounds']);
  const exported = exportLss(character, game);
  assert.deepEqual(JSON.parse(exported.data), example); assert.deepEqual(exported, original);
  assert.ok(validate(JSON.parse(exported.data)), JSON.stringify(validate.errors));
});

test('LSS manual overrides survive reimport without double-counting items; unknown data is preserved', () => {
  const original = outer(); const { character, game } = importLss(original);
  game.hp = 19; game.maxHp = 40; game.ac = 21; game.abilities.str = 18; game.abilities.dex = 14;
  game.race = 'Эльф'; game.level = 7; game.spells = ['bless','guidance']; game.inventory += '\nВерёвка';
  const result = exportLss({ ...character, name: 'Новое имя' }, game);
  const data = JSON.parse(result.data);
  assert.ok(validate(data), JSON.stringify(validate.errors));
  assert.deepEqual(data.weaponsList, example.weaponsList); assert.deepEqual(data.resources, example.resources); assert.deepEqual(data.text.traits, example.text.traits);
  assert.deepEqual(result.futureExtension, original.futureExtension); assert.deepEqual(result.spells.pending, original.spells.pending);
  const roundtrip = importLss(result);
  for (const key of ['hp','maxHp','ac','race','level','inventory','abilities','spells','spellBook']) assert.deepEqual(roundtrip.game[key], game[key], key);
  assert.equal(roundtrip.character.name, 'Новое имя');
});

test('Fresh characters produce valid LSS exports; malformed and executable formulas are rejected safely', () => {
  const game = { hp: 10, maxHp: 12, ac: 15, blocks: [{ id: 'note', title: 'Тайна', kind: 'spoiler', text: 'Текст' }], edition: '2024', level: 2 };
  const result = exportLss({ id: 'hero', name: 'Герой' }, game);
  assert.ok(validate(JSON.parse(result.data)), JSON.stringify(validate.errors));
  const imported = importLss(result); assert.equal(imported.game.ac, 15); assert.equal(imported.game.hp, 10);
  assert.throws(() => importLss({ jsonType: 'character', data: '{' })); assert.throws(() => importLss({}));
  const malicious = structuredClone(example); malicious.vitality.ac.value = 'globalThis.ARCANE_EXECUTED=1';
  const safe = importLss(malicious); assert.equal(globalThis.ARCANE_EXECUTED, undefined); assert.ok(safe.warnings.some(w => w.includes('формула')));
});

test('Custom characters are independent per project, imported atomically and restored from SQLite', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'arcane-characters-')); const store = await Store.open(directory);
  try {
    const projectId = store.state().activeId;
    const run = (type, extra = {}) => store.execute({ id: randomUUID(), type, projectId, ...extra });
    run('character.create', { name: 'Герой' }); let project = store.state().projects[0]; const custom = project.selectedCharacter;
    assert.equal(project.characters.length, 4); assert.equal(project.games[custom].hp, 10);
    run('character.metadata', { characterId: custom, character: { name: 'Арагорн' } });
    const imported = importLss(outer()); store.execute({ id: randomUUID(), type: 'character.import', projectId }, undefined, undefined, undefined, imported);
    project = store.state().projects[0]; assert.equal(project.selectedCharacter, imported.character.id); assert.equal(project.characters.length, 5);
    assert.equal(project.games[custom].hp, 10); assert.equal(project.games[imported.character.id].hp, 24);
    run('project.duplicate'); const copy = store.state().projects[1];
    store.execute({ id: randomUUID(), type: 'character.metadata', projectId: copy.id, characterId: custom, character: { name: 'Другой' } });
    assert.equal(store.state().projects[0].characters.find(c => c.id === custom).name, 'Арагорн');
    const reopened = await Store.open(directory); try { assert.deepEqual(reopened.state(), store.state()); } finally { reopened.close(); }
    assert.throws(() => run('character.import'));
    run('character.delete', { characterId: custom }); assert.ok(!store.state().projects[0].games[custom]);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
