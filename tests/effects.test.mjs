import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { effectiveStats, effectText, parseEffect, validItem, blankItem, inventoryFrom } from '../build-desktop/src/library.js';
import { parseItemJson } from '../build-desktop/src/item-import.js';
import { createService } from '../build-desktop/backend/service.js';

test('Effect rules parse from the block-like text form', () => {
  assert.deepEqual(parseEffect('персонаж -> получает -> ловкость -> +2 -> макс 21'), { stat: 'dex', op: 'add', value: 2, max: 21 });
  assert.deepEqual(parseEffect('персонаж → становится → сила → 19'), { stat: 'str', op: 'set', value: 19 });
  assert.deepEqual(parseEffect('Сила = 21'), { stat: 'str', op: 'set', value: 21 });
  assert.deepEqual(parseEffect('КД +1'), { stat: 'ac', op: 'add', value: 1 });
  assert.deepEqual(parseEffect('dex +2 max 20'), { stat: 'dex', op: 'add', value: 2, max: 20 });
  assert.deepEqual(parseEffect('Спасброски +1'), { stat: 'saves', op: 'add', value: 1 });
  assert.equal(parseEffect('просто текст'), null);
  assert.equal(parseEffect('Сила = 99'), null, 'out of range');
  assert.equal(effectText({ stat: 'dex', op: 'add', value: 2, max: 21 }), 'Ловкость +2 (макс. 21)');
  assert.deepEqual(parseEffect('фиксирует силу 8'), { stat: 'str', op: 'fix', value: 8 });
  assert.deepEqual(parseEffect('скорость не выше 20'), { stat: 'speed', op: 'cap', value: 20 });
  assert.deepEqual(parseEffect('скорость ×2'), { stat: 'speed', op: 'mul', value: 2 });
  assert.deepEqual(parseEffect('Сопротивление: огонь'), { trait: 'resist', what: 'огонь' });
  assert.deepEqual(parseEffect('иммунитет к отравлен'), { trait: 'condition', what: 'отравлен' });
  assert.deepEqual(parseEffect('иммунитет яд'), { trait: 'immune', what: 'яд' });
  assert.deepEqual(parseEffect('преимущество на спасброски Ловкости'), { trait: 'advantage', what: 'спасброски Ловкости' });
  assert.deepEqual(parseEffect('тёмное зрение 120'), { trait: 'sense', what: 'Тёмное зрение', value: 120 });
  assert.equal(effectText({ trait: 'resist', what: 'огонь' }), 'Сопротивление: огонь');
});

test('Only equipped items change the effective stats; caps and «becomes» rules follow 5e', () => {
  const ring = { ...blankItem('ring', 'ring'), name: 'Кольцо защиты', effects: [{ stat: 'ac', op: 'add', value: 1 }, { stat: 'saves', op: 'add', value: 1 }] };
  const belt = { ...blankItem('belt', 'wondrous'), name: 'Пояс', effects: [{ stat: 'str', op: 'set', value: 21 }] };
  const stone = { ...blankItem('stone', 'wondrous'), name: 'Камень', effects: [{ stat: 'dex', op: 'add', value: 2, max: 20 }] };
  const game = { ac: 15, speed: 30, abilities: { str: 23, dex: 19, con: 10, int: 10, wis: 10, cha: 10 }, items: [inventoryFrom(ring, 'a'), inventoryFrom(belt, 'b'), { ...inventoryFrom(stone, 'c'), equipped: true }] };
  let stats = effectiveStats(game);
  assert.deepEqual([stats.ac, stats.abilities.dex, stats.abilities.str, stats.initiative], [15, 20, 23, 5], 'only the stone is equipped; dex capped at 20');
  game.items = game.items.map(item => ({ ...item, equipped: true }));
  stats = effectiveStats(game);
  assert.deepEqual([stats.ac, stats.saves, stats.abilities.str], [16, 1, 23], 'belt never lowers a higher score');
  assert.deepEqual(stats.changed, { dex: 1, ac: 1, initiative: 1, saves: 1 }, 'initiative follows the boosted dexterity');
  game.abilities.str = 12;
  assert.equal(effectiveStats(game).abilities.str, 21);
  assert.equal(effectiveStats(game, [{ id: 'ring', effects: [{ stat: 'ac', op: 'add', value: 3 }] }]).ac, 18, 'library edits win over the copy in the inventory');
  assert.equal(validItem({ ...ring, effects: [{ stat: 'luck', op: 'add', value: 1 }] }), false);
  const curse = { ac: 10, speed: 30, abilities: { str: 16 }, items: [{ id: 'x', name: 'Проклятый пояс', icon: '', quantity: 1, description: '', kind: '', equipped: true, effects: [{ stat: 'str', op: 'add', value: 4 }, { stat: 'str', op: 'fix', value: 8 }, { stat: 'speed', op: 'mul', value: 2 }, { stat: 'speed', op: 'cap', value: 50 }, { trait: 'resist', what: 'огонь' }] }] };
  const cursed = effectiveStats(curse);
  assert.deepEqual([cursed.abilities.str, cursed.speed, cursed.traits.length], [8, 50, 1], 'fix wins last, multiply then cap');
  assert.equal(validItem({ ...ring, effects: [{ trait: 'resist', what: 'лазер' }] }), false, 'unknown damage type');
  assert.equal(validItem({ ...ring, effects: [{ stat: 'speed', op: 'mul', value: 9 }] }), false, 'multiplier range');
  const [imported] = parseItemJson([{ name: 'Плащ', type: 'чудесный', effects: ['КД +1', { stat: 'speed', op: 'add', value: 10 }, 'чепуха'] }]).items;
  assert.deepEqual(imported.effects, [{ stat: 'ac', op: 'add', value: 1 }, { stat: 'speed', op: 'add', value: 10 }]);
});

test('Cards show the effective AC and players may give effects to their own items', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'arcane-effects-'));
  const service = await createService(directory);
  const server = createServer((req, res) => { void service.handle(req, res, () => { res.writeHead(404); res.end(); }); }); service.attach(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const store = service.store; const projectId = store.state().activeId;
    const ring = { ...blankItem('ring-of-protection', 'ring'), name: 'Кольцо защиты', effects: [{ stat: 'ac', op: 'add', value: 1 }] };
    store.execute({ id: randomUUID(), type: 'item.save', projectId, libraryItem: ring });
    const grant = service.access.create('player', 'Телефон', 1, projectId); service.access.claim(grant.id, 'paladin', 'Игрок');
    const base = store.state().projects[0].games.paladin.ac;
    const player = body => fetch(origin + '/api/player/command', { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${grant.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: randomUUID(), type: 'player.update', ...body }) });
    const forged = { id: 'forged', name: 'Самодельный амулет', icon: '', quantity: 1, description: '', kind: 'Чудесные предметы', equipped: true, effects: [{ stat: 'ac', op: 'add', value: 10 }] };
    assert.equal((await player({ sheet: { items: [{ ...inventoryFrom(ring, 'r1'), equipped: true }, forged] } })).status, 200);
    const game = store.state().projects[0].games.paladin;
    assert.equal(game.ac, base, 'stored AC stays the base value');
    assert.deepEqual(game.items.find(item => item.id === 'forged').effects, [{ stat: 'ac', op: 'add', value: 10 }], 'own item effects are kept');
    store.execute({ id: randomUUID(), type: 'character.select', projectId, characterId: 'paladin' }); store.execute({ id: randomUUID(), type: 'project.live', projectId });
    assert.equal(store.publicView().party.find(item => item.characterId === 'paladin').ac, base + 11, 'table card shows the ring and the own amulet');
  } finally { server.close(); service.close(); rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
