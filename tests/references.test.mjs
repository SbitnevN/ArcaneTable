import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../build-desktop/backend/store.js';
import { importLss, exportLss } from '../build-desktop/backend/lss.js';
import { lssSpells } from '../build-desktop/src/data/lss-spells.js';

const catalog = JSON.parse(readFileSync('public/references/catalog.json','utf8'));
test('Offline catalogs retain source hashes and valid spell/monster metadata for both editions', () => {
  for (const source of catalog.sources) assert.equal(createHash('sha256').update(readFileSync(`public/references/srd-${source.edition}.pdf`)).digest('hex'),source.sha256);
  const entries = catalog.entries;
  for (const edition of ['2014','2024']) {
    const spells = entries.filter(e => e.kind === 'spells' && e.edition === edition); const monsters = entries.filter(e => e.kind === 'monsters' && e.edition === edition);
    assert.ok(spells.length > 300); assert.ok(monsters.length > 300);
    assert.ok(spells.every(e => Number.isInteger(e.level) && e.level >= 0 && e.level <= 9 && e.school && e.castingTime && e.range && e.duration && e.text.length > 30),spells.filter(e => !e.school || !e.castingTime || !e.range || !e.duration).map(e => e.name).join(','));
    assert.ok(monsters.every(e => Number.isInteger(e.hp) && e.hp > 0 && e.hp <= 1000000 && Number.isInteger(e.ac) && e.ac > 0 && e.ac <= 30 && e.cr && e.type && e.text.length > 50));
    assert.equal(new Set([...spells,...monsters].map(e => e.id)).size,spells.length+monsters.length);
  }
  const goblin = entries.find(e => e.edition === '2014' && e.name === 'Goblin' && e.kind === 'monsters'); assert.equal(goblin.hp,7); assert.equal(goblin.ac,15); assert.equal(goblin.cr,'1/4');
  const goblin24 = entries.find(e => e.edition === '2024' && e.name === 'Goblin Warrior' && e.kind === 'monsters'); assert.equal(goblin24.hp,10); assert.equal(goblin24.ac,15);
  assert.equal(entries.find(e => e.name === 'Fireball' && e.edition === '2014').level,3);
  assert.equal(entries.find(e => e.name === 'Fireball' && e.edition === '2024').level,3);
});

test('Monster templates stay independent from encounter instances and from each other', async () => {
  const directory = mkdtempSync(join(tmpdir(),'arcane-monsters-')); const store = await Store.open(directory);
  try {
    const projectId = store.state().activeId; const run = (type,extra={}) => store.execute({ id:randomUUID(),type,projectId,...extra });
    const monster = { id:randomUUID(),name:'Гоблин',edition:'2014',hp:7,ac:15,type:'Small humanoid',cr:'1/4',speed:'30 ft.',abilities:{ str:8,dex:14,con:10,int:10,wis:8,cha:8 },description:'Свои способности',source:'SRD 5.1' };
    run('monster.save',{ monster }); run('combat.create',{ name:'Засада' }); run('combat.add',{ monsterId:monster.id }); run('combat.add',{ monsterId:monster.id });
    let project = store.state().projects[0]; const [a,b] = project.combat.participants; run('combat.damage',{ targetId:a.id,amount:3 });
    run('monster.save',{ monster:{ ...monster,hp:25,description:'Обновлённый шаблон' } }); project = store.state().projects[0];
    assert.equal(project.monsters[0].hp,25); assert.equal(project.combat.participants.find(p => p.id === a.id).hp,4); assert.equal(project.combat.participants.find(p => p.id === b.id).hp,7);
    assert.equal(project.combat.participants.find(p => p.id === a.id).maxHp,7);
    assert.throws(() => run('monster.save',{ monster:{ ...monster,hp:-5 } }));
    run('monster.delete',{ monsterId:monster.id }); assert.equal(store.state().projects[0].combat.participants.length,2);
  } finally { store.close(); rmSync(directory,{ recursive:true,force:true,maxRetries:5,retryDelay:100 }); }
});

test('LSS spell IDs map to stable slugs across edition changes while unchanged exports preserve IDs', () => {
  const example = JSON.parse(readFileSync('tests/fixtures/lss-example.json','utf8'));
  const oldId = Object.entries(lssSpells['2014']).find(([,slug]) => slug === 'fireball')[0];
  const currentId = Object.entries(lssSpells['2024']).find(([,slug]) => slug === 'fireball')[0];
  const original = { jsonType:'character',edition:'2014',data:JSON.stringify(example),spells:{ mode:'cards',prepared:[oldId],book:[oldId],granted:[{ id:oldId,source:'test' }] } };
  const { character,game } = importLss(original); assert.deepEqual(game.spells,['fireball']); assert.equal(exportLss(character,game).spells.prepared[0],oldId);
  game.edition = '2024'; const result = exportLss(character,game); assert.deepEqual(result.spells.prepared,['fireball']); assert.deepEqual(result.spells.book,['fireball']); assert.equal(result.spells.granted[0].id,currentId);
});
