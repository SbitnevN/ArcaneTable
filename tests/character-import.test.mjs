import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { exportCharacterJson, parseCharacterJson } from '../build-desktop/src/character-import.js';
import { effectiveStats, blankItem } from '../build-desktop/src/library.js';
import { createService } from '../build-desktop/backend/service.js';

const hero = {
  format: 'arcane-character', version: 1, name: 'Торин', race: 'Дварф', class: 'Паладин', level: 5, edition: '2014',
  hp: 40, maxHp: 44, ac: 18, speed: 25, initiative: 0,
  abilities: { 'Сила': 16, dex: 10, con: 14, int: 8, wis: 12, cha: 16 },
  saves: ['wis', 'Харизма'], skills: ['Атлетика', 'Проницательность (эксперт)', 'Восприятие +4'], proficiencies: 'Все доспехи',
  attacks: [{ name: 'Длинный меч', type: 'ближняя', bonus: 6, reach: '5 фт.', damage: '1d8+3 рубящий' }, { name: 'Священное пламя', type: 'спасбросок', save: 'dex', dc: 13, damage: '1d8 излучение' }],
  features: [{ name: 'Божественное чувство', text: 'Чует нежить' }, 'Наложение рук: 25 хитов'],
  spells: ['Благословение', { name: 'Лечение ран' }], coins: '15 зм, 8 см',
  items: [
    { name: 'Кольчуга', type: 'доспех', equipped: true },
    { name: 'Зелье лечения', type: 'зелье', heal: '2d4+2', quantity: 2 },
    { name: 'Перчатки силы огра', type: 'чудесный', rarity: 'необычный', attunement: true, equipped: true, effects: ['Сила = 19'] },
    { name: 'Амулет стойкости', type: 'чудесный', equipped: true, effects: ['сопротивление огонь', 'тёмное зрение 60', { stat: 'ac', op: 'add', value: 1 }] },
    'Верёвка ×2'
  ],
  backstory: 'Сын кузнеца', secret: 'Боится высоты'
};

test('Arcane character JSON becomes a full sheet with items and effects', () => {
  const { character, game, items, warnings } = parseCharacterJson(hero);
  assert.equal(character.name, 'Торин'); assert.equal(character.caption, 'Дварф · Паладин');
  assert.equal(game.edition, '2014'); assert.equal(game.level, 5); assert.equal(game.hp, 40); assert.equal(game.maxHp, 44); assert.equal(game.ac, 18);
  assert.deepEqual(game.abilities, { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 16 });
  assert.deepEqual(game.saves, ['wis', 'cha']);
  assert.match(game.skills, /Атлетика \+6/); assert.match(game.skills, /Проницательность \+7/); assert.match(game.skills, /Восприятие \+4/); assert.match(game.skills, /Все доспехи/);
  assert.equal(game.attacks.length, 2); assert.deepEqual(game.attacks[0].damage, [{ dice: '1d8+3', type: 'рубящий' }]); assert.equal(game.attacks[1].kind, 'save'); assert.equal(game.attacks[1].save, 'dex');
  assert.deepEqual(game.features.map(f => f.name), ['Божественное чувство', 'Наложение рук']);
  assert.deepEqual(game.spells, ['Благословение', 'Лечение ран']); assert.deepEqual(game.coins, { gp: 15, sp: 8 });
  assert.deepEqual(game.items.map(i => [i.name, i.quantity, Boolean(i.equipped)]), [['Кольчуга', 1, true], ['Зелье лечения', 2, false], ['Перчатки силы огра', 1, true], ['Амулет стойкости', 1, true], ['Верёвка', 2, false]]);
  assert.deepEqual(items.map(i => i.name), ['Перчатки силы огра', 'Амулет стойкости'], 'only magic items join the library');
  assert.equal(game.items[2].sourceId, items[0].id); assert.equal(game.items[0].sourceId, undefined);
  assert.equal(game.blocks.find(b => b.kind === 'spoiler').text, 'Боится высоты');
  const stats = effectiveStats(game, items);
  assert.equal(stats.abilities.str, 19); assert.equal(stats.ac, 19); assert.equal(stats.traits.length, 2);
  assert.deepEqual(warnings, []);
});

test('Missing numbers are estimated with warnings; nameless input is rejected', () => {
  const { game, warnings } = parseCharacterJson({ name: 'Нова', level: 3, abilities: { con: 14, dex: 14 } }, { edition: '2024' });
  assert.equal(game.maxHp, 8 + 2 + 2 * 7); assert.equal(game.ac, 12); assert.equal(game.edition, '2024');
  assert.equal(warnings.length, 3);
  assert.throws(() => parseCharacterJson({ level: 3 }), /имени/);
  const odd = parseCharacterJson({ name: 'X', hp: 'много', maxHp: 0, ac: 99, level: 40, abilities: { str: 50, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } }).game;
  assert.deepEqual([odd.maxHp, odd.hp, odd.level, odd.abilities.str], [1, 1, 20, 30], 'out-of-range numbers are clamped');
});

test('Items already in the library are linked, not duplicated; export round-trips', () => {
  const gloves = { ...blankItem('gloves-lib', 'wondrous'), name: 'Перчатки силы огра', rarity: 'uncommon', effects: [{ stat: 'str', op: 'set', value: 19 }] };
  const first = parseCharacterJson(hero, { library: { items: [gloves], weapons: [] } });
  assert.equal(first.items.length, 1); assert.equal(first.game.items[2].sourceId, 'gloves-lib');
  const library = { items: [gloves, ...first.items], weapons: [] };
  const again = parseCharacterJson(JSON.parse(exportCharacterJson(first.character, first.game, library)), { library });
  assert.equal(again.items.length, 0, 'everything links back to the library');
  for (const key of ['hp', 'maxHp', 'ac', 'level', 'edition', 'speed', 'skills', 'spells']) assert.deepEqual(again.game[key], first.game[key], key);
  assert.deepEqual(again.game.abilities, first.game.abilities); assert.deepEqual(again.game.attacks.map(a => a.damage), first.game.attacks.map(a => a.damage));
  assert.deepEqual(effectiveStats(again.game, library.items).ac, effectiveStats(first.game, library.items).ac);
});

test('The import endpoint accepts our format and adds magic items to the library', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'arcane-character-import-'));
  const service = await createService(directory);
  const server = createServer((req, res) => { void service.handle(req, res, () => { res.writeHead(404); res.end(); }); }); service.attach(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: `Bearer ${service.master}`, Origin: origin, 'Content-Type': 'application/json' };
  try {
    const projectId = service.store.state().activeId; const before = service.store.state().projects[0].items?.length || 0;
    const response = await fetch(`${origin}/api/character/import?projectId=${projectId}`, { method: 'POST', headers, body: '```json\n' + JSON.stringify(hero) + '\n```' });
    assert.equal(response.status, 200);
    const project = (await response.json()).state.projects[0]; const id = project.selectedCharacter;
    assert.equal(project.characters.find(c => c.id === id).name, 'Торин');
    assert.equal(project.items.length, before + 2);
    assert.equal(effectiveStats(project.games[id], project.items).abilities.str, 19);
    assert.equal((await fetch(`${origin}/api/character/import?projectId=${projectId}`, { method: 'POST', headers, body: 'не json' })).status >= 400, true);
    // replace keeps the hero's id and portrait, swaps the sheet
    const image = project.characters.find(c => c.id === 'paladin').image;
    const replaced = await fetch(`${origin}/api/character/import?projectId=${projectId}&replace=paladin`, { method: 'POST', headers, body: readFileSync('tests/fixtures/lambert.arcane.json', 'utf8') });
    const after = (await replaced.json()).state.projects[0];
    assert.equal(after.characters.length, project.characters.length, 'no new hero');
    assert.equal(after.characters.find(c => c.id === 'paladin').name, 'Ламберт'); assert.equal(after.characters.find(c => c.id === 'paladin').image, image);
    assert.equal(after.games.paladin.spellSlots[0].max, 4); assert.ok(after.spells.some(spell => spell.name === 'Голод Хадара'));
  } finally { server.close(); service.close(); rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test('A full sheet with spell slots and spells missing from the SRD imports in one go (Ламберт)', () => {
  const { game, spells, items, weapons, warnings } = parseCharacterJson(JSON.parse(readFileSync('tests/fixtures/lambert.arcane.json', 'utf8')));
  assert.deepEqual(warnings, []);
  assert.deepEqual(game.spellSlots.slice(0, 4), [{ max: 4, used: 0 }, { max: 3, used: 0 }, { max: 2, used: 0 }, { max: 0, used: 0 }]);
  assert.deepEqual(spells.map(spell => [spell.name, spell.level]), [['Расщепление разума', 0], ['Лепка земли', 0], ['Формирование воды', 0], ['Руки Хадара', 1], ['Голод Хадара', 3]]);
  const hunger = spells.find(spell => spell.name === 'Голод Хадара');
  assert.equal(hunger.concentration, true); assert.equal(hunger.save, 'dex'); assert.equal(hunger.damage.length, 2); assert.deepEqual(hunger.conditions, ['ослеплён']);
  assert.equal(game.spells.length, 18); assert.equal(game.attacks.length, 5); assert.equal(game.features.length, 11);
  assert.ok(game.skills.includes('Убеждение +7')); assert.ok(game.skills.includes('Магия +5'));
  assert.equal(game.ac, 14); assert.equal(game.maxHp, 31); assert.deepEqual(game.coins, { gp: 25 });
  assert.equal(game.items.length, 16); assert.equal(items.length + weapons.length, 0, 'plain gear stays out of the library');
  assert.equal(game.items.find(item => item.name === 'Кинжал').icon, 'dagger');
  const again = parseCharacterJson(JSON.parse(exportCharacterJson(parseCharacterJson(JSON.parse(readFileSync('tests/fixtures/lambert.arcane.json', 'utf8'))).character, game, { items: [], weapons: [] }, spells)));
  assert.deepEqual(again.game.spellSlots, game.spellSlots); assert.equal(again.spells.length, 5, 'export carries the homebrew spells back');
});
