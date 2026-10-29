import { makeShop, shopCommand } from './shop.js';
import { publicShop } from '../src/shop-view.js';
import { validateProject } from './archive.js';
import { combatCommand, publicCombat } from './combat.js';
import { validItem, validSpell, validWeapon } from '../src/library.js';
import { heroAc, publicParty } from '../src/combat-view.js';
import initSqlJs, { type Database } from 'sql.js';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { characters, defaultIcons, upgradeIcons, resolvePlaylist, spotifyUri,defaultLayout, defaultHandLayout, defaultGames, validGame, validMonster, validPlan, type Command, type Project, type PublicView, type Scene, type Workspace, type Track, type Character, type Game, type Item, type Weapon, type Spell } from '../src/contracts.js';

export class Store {
  private constructor(private db: Database, private filename: string) {}
  static async open(directory: string): Promise<Store> {
    mkdirSync(directory, { recursive: true });
    const require = createRequire(import.meta.url);
    const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });
    const filename = join(directory, 'arcane.sqlite');
    const db = new SQL.Database(existsSync(filename) ? readFileSync(filename) : undefined);
    db.run('CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY)');
    db.run('CREATE TABLE IF NOT EXISTS workspace(id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)');
    db.run('CREATE TABLE IF NOT EXISTS commands(id TEXT PRIMARY KEY, revision INTEGER NOT NULL)');
    db.run('INSERT OR IGNORE INTO migrations(version) VALUES(1)');
    const store = new Store(db, filename);
    if (!db.exec('SELECT id FROM workspace').length) {
      const project = store.makeProject('Новая кампания');
      const state: Workspace = { projects: [project], openIds: [project.id], activeId: project.id, liveId: null, sound: null, music: null, revision: 0 };
      db.run('INSERT INTO workspace VALUES(1, ?)', [JSON.stringify(state)]);
    }
    if (!db.exec('SELECT version FROM migrations WHERE version=2').length) {
      const state = store.state();
      for (const project of state.projects) { project.layout ??= { ...defaultLayout }; project.background ??= { ...defaultLayout }; project.folders ??= []; }
      db.run('UPDATE workspace SET payload=? WHERE id=1', [JSON.stringify(state)]);
      db.run('INSERT INTO migrations VALUES(2)');
    }
    if (!db.exec('SELECT version FROM migrations WHERE version=3').length) {
      const state = store.state();
      state.music ??= null;
      for (const project of state.projects) {
        project.games.paladin ??= structuredClone(defaultGames.paladin);
        project.tracks ??= []; project.playlists ??= []; project.playlistId ??= null;
      }
      db.run('UPDATE workspace SET payload=? WHERE id=1', [JSON.stringify(state)]);
      db.run('INSERT INTO migrations VALUES(3)');
    }
    if (!db.exec('SELECT version FROM migrations WHERE version=4').length) {
      const state = store.state(); for (const project of state.projects) project.combat ??= null;
      db.run('UPDATE workspace SET payload=? WHERE id=1', [JSON.stringify(state)]); db.run('INSERT INTO migrations VALUES(4)');
    }
    if (!db.exec('SELECT version FROM migrations WHERE version=5').length) {
      const state = store.state(); for (const project of state.projects) project.encounters ??= [];
      db.run('UPDATE workspace SET payload=? WHERE id=1', [JSON.stringify(state)]); db.run('INSERT INTO migrations VALUES(5)');
    }
    if (!db.exec('SELECT version FROM migrations WHERE version=6').length) {
      const state = store.state();
      for (const project of state.projects) {
        project.characters ??= structuredClone(characters);
        for (const game of Object.values(project.games)) { game.edition ??= '2024'; game.level ??= 1; game.abilities ??= { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }; }
      }
      db.run('UPDATE workspace SET payload=? WHERE id=1', [JSON.stringify(state)]); db.run('INSERT INTO migrations VALUES(6)');
    }
    if (!db.exec('SELECT version FROM migrations WHERE version=7').length) {
      const state = store.state(); for (const project of state.projects) project.monsters ??= [];
      db.run('UPDATE workspace SET payload=? WHERE id=1', [JSON.stringify(state)]); db.run('INSERT INTO migrations VALUES(7)');
    }
    if (!db.exec('SELECT version FROM migrations WHERE version=8').length) {
      const state = store.state(); state.sound = null;
      for (const project of state.projects) { project.dmNotes ??= ''; project.presets ??= []; project.cue ??= null; }
      db.run('UPDATE workspace SET payload=? WHERE id=1', [JSON.stringify(state)]); db.run('INSERT INTO migrations VALUES(8)');
    }
    if (!db.exec('SELECT version FROM migrations WHERE version=9').length) {
      const state = store.state(); for (const project of state.projects) { project.shops ??= [makeShop(undefined,true)]; project.activeShopId ??= null; }
      db.run('UPDATE workspace SET payload=? WHERE id=1', [JSON.stringify(state)]); db.run('INSERT INTO migrations VALUES(9)');
    }
    if (!db.exec('SELECT version FROM migrations WHERE version=10').length) {
      const state = store.state(); for (const project of state.projects) project.icons ??= { ...defaultIcons };
      db.run('UPDATE workspace SET payload=? WHERE id=1', [JSON.stringify(state)]); db.run('INSERT INTO migrations VALUES(10)');
    }
    if (!db.exec('SELECT version FROM migrations WHERE version=11').length) {
      const state = store.state();
      for (const project of state.projects) {
        if (project.layout.scale === 1 && project.layout.x === 50 && project.layout.y === 50) project.layout = { ...defaultHandLayout };
      }
      db.run('UPDATE workspace SET payload=? WHERE id=1', [JSON.stringify(state)]); db.run('INSERT INTO migrations VALUES(11)');
    }
    if (!db.exec('SELECT version FROM migrations WHERE version=12').length) {
      const state = store.state(); for (const project of state.projects) { project.spells ??= []; project.weapons ??= []; }
      db.run('UPDATE workspace SET payload=? WHERE id=1', [JSON.stringify(state)]); db.run('INSERT INTO migrations VALUES(12)');
    }
    if (!db.exec('SELECT version FROM migrations WHERE version=13').length) {
      const state = store.state(); for (const project of state.projects) project.items ??= [];
      db.run('UPDATE workspace SET payload=? WHERE id=1', [JSON.stringify(state)]); db.run('INSERT INTO migrations VALUES(13)');
    }
    if (!db.exec('SELECT version FROM migrations WHERE version=14').length) {
      const state = store.state(); for (const project of state.projects) project.icons = upgradeIcons(project.icons);
      db.run('UPDATE workspace SET payload=? WHERE id=1', [JSON.stringify(state)]); db.run('INSERT INTO migrations VALUES(14)');
    }
    const restored = store.state();
    if (restored.sound) { restored.sound = null; db.run('UPDATE workspace SET payload=? WHERE id=1', [JSON.stringify(restored)]); }
    if (restored.spotify?.playing) { restored.spotify.playing = false; db.run('UPDATE workspace SET payload=? WHERE id=1', [JSON.stringify(restored)]); }
    if (restored.music?.playing) {
      restored.music.playing = false; restored.music.startedAt = Date.now();
      db.run('UPDATE workspace SET payload=? WHERE id=1', [JSON.stringify(restored)]);
    }
    store.flush();
    return store;
  }
  private flush() {
    writeFileSync(`${this.filename}.tmp`, this.db.export(), { flush: true });
    renameSync(`${this.filename}.tmp`, this.filename);
  }
  state(): Workspace {
    return JSON.parse(String(this.db.exec('SELECT payload FROM workspace WHERE id=1')[0].values[0][0]));
  }
  publicView(): PublicView | null {
    const state = this.state();
    const project = state.projects.find(item => item.id === state.liveId);
    if (!project) return null;
    const game = project.games[project.selectedCharacter];
    const shop = publicShop(project);
    return { icons: project.icons, shop, cue: project.cue && (project.cue.expiresAt === null || project.cue.expiresAt > Date.now()) ? project.cue : null, ...(project.combat?.running || shop ? {} : { party: publicParty(project), character: project.characters.find(c => c.id === project.selectedCharacter) }), combat: shop ? null : publicCombat(project), layout: project.layout, background: project.background, projectName: project.name, scene: project.scenes.find(scene => scene.id === project.sceneId) || null,
      characterId: project.combat?.running || shop ? '' : project.selectedCharacter, ...(project.combat?.running || shop ? {} : { hp: game.hp, maxHp: game.maxHp, ac: heroAc(project, project.selectedCharacter) }) };
  }
  private makeProject(name: string): Project {
    return { id: randomUUID(), name, icons: { ...defaultIcons }, shops: [makeShop(undefined,true)], activeShopId: null, dmNotes: '', presets: [], cue: null, layout: { ...defaultHandLayout }, background: { ...defaultLayout }, folders: [], tracks: [], playlists: [], playlistId: null, combat: null, encounters: [], characters: structuredClone(characters), monsters: [], edition: '2024', spells: [], weapons: [], items: [], selectedCharacter: 'aristocrat', games: structuredClone(defaultGames),
      scenes: [{ id: 'test-scene', name: 'Тестовая сцена — пергамент', url: '/assets/test-scene.svg', type: 'image' }], sceneId: 'test-scene' };
  }
  private spotifyUrl(value: string): string {
    let url: URL;
    try { url = new URL(value.trim()); } catch { throw new Error('Нужна ссылка Spotify на трек, альбом или плейлист'); }
    if (url.protocol !== 'https:' || url.hostname !== 'open.spotify.com' || url.username || url.password || url.port) throw new Error('Нужна ссылка Spotify на трек, альбом или плейлист');
    const path = url.pathname.replace(/^\/intl-[a-z-]+(?=\/)/i, '');
    if (!/^\/(playlist|album|track)\/[A-Za-z0-9]+$/.test(path)) throw new Error('Нужна ссылка Spotify на трек, альбом или плейлист');
    return url.origin + path;
  }
  private assignPlaylist(project: Project, item: { playlistId?: string | null }, playlistId: string | null | undefined) {
    if (playlistId && !project.playlists.some(playlist => playlist.id === playlistId)) throw new Error('Плейлист не найден');
    if (playlistId === undefined) delete item.playlistId; else item.playlistId = playlistId;
  }
  private name(value: unknown): string {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) throw new Error('Введите название от 1 до 100 символов');
    return value.trim();
  }
  execute(command: Command, importedScene?: Scene, importedTrack?: Track, portrait?: Pick<Character, 'image' | 'width' | 'height'>, importedCharacter?: { character: Character; game: Game; items?: Item[]; weapons?: Weapon[]; spells?: Spell[] }, importedProject?: Project): Workspace {
    if (!command || typeof command.type !== 'string' || typeof command.id !== 'string' || !/^[\w-]{1,100}$/.test(command.id)) throw new Error('Некорректный ID команды');
    if (this.db.exec('SELECT id FROM commands WHERE id=?', [command.id]).length) return this.state();
    const state = this.state();
    const project = state.projects.find(item => item.id === command.projectId);
    if (command.type === 'project.import') {
      if (!importedProject) throw new Error('Нет проекта для импорта');
      validateProject(importedProject); state.projects.push(structuredClone(importedProject)); state.openIds.push(importedProject.id); state.activeId = importedProject.id;
    } else if (command.type === 'project.create') {
      const created = this.makeProject(this.name(command.name));
      state.projects.push(created); state.openIds.push(created.id); state.activeId = created.id;
    } else {
      if (!project) throw new Error('Проект не найден');
      if (command.type.startsWith('shop.')) { shopCommand(project, command, portrait); if (command.type === 'shop.show') state.liveId = project.id; }
      else if (command.type.startsWith('combat.')) { combatCommand(project, command); if (command.type === 'combat.start') { project.activeShopId = null; state.liveId = project.id; } }
      else switch (command.type) {
        case 'project.activate':
          if (!state.openIds.includes(project.id)) state.openIds.push(project.id);
          state.activeId = project.id; break;
        case 'project.close':
          if (state.openIds.length < 2) throw new Error('Оставьте хотя бы одну открытую вкладку');
          state.openIds = state.openIds.filter(id => id !== project.id);
          if (state.activeId === project.id) state.activeId = state.openIds[0]; break;
        case 'icon.import': case 'icon.reset': {
          if (command.kind !== 'heart' && command.kind !== 'shield') throw new Error('Выберите сердце или щит');
          if (command.type === 'icon.import' && !portrait) throw new Error('Изображение не загружено');
          project.icons[command.kind] = command.type === 'icon.reset' ? defaultIcons[command.kind] : portrait!.image; break;
        }
        case 'project.notes': if (typeof command.text !== 'string' || command.text.length > 100000) throw new Error('Заметки не длиннее 100000 символов'); project.dmNotes = command.text; break;
        case 'preset.save': if (project.presets.length >= 100) throw new Error('В проекте уже 100 шаблонов'); project.presets.push({ id: randomUUID(), name: this.name(command.name), sceneId: project.sceneId, characterId: project.selectedCharacter, layout: { ...project.layout }, background: { ...project.background } }); break;
        case 'preset.delete': project.presets = project.presets.filter(p => p.id !== command.presetId); break;
        case 'preset.apply': {
          const preset = project.presets.find(p => p.id === command.presetId); if (!preset) throw new Error('Шаблон не найден');
          if (preset.sceneId && !project.scenes.some(s => s.id === preset.sceneId) || !project.characters.some(c => c.id === preset.characterId)) throw new Error('Сцена или персонаж шаблона больше недоступны');
          project.activeShopId = null; project.sceneId = preset.sceneId; project.selectedCharacter = preset.characterId; project.layout = { ...preset.layout }; project.background = { ...preset.background }; break;
        }
        case 'cue.show': {
          // count is how long it stays, in seconds: 6 by default, 0 means until «Скрыть».
          const text = typeof command.text === 'string' ? command.text.trim() : '';
          if (text.length > 1000) throw new Error('Текст сообщения — не больше 1000 символов');
          const seconds = command.count ?? 6;
          if (!Number.isInteger(seconds) || seconds < 0 || seconds > 3600) throw new Error('Длительность — от 0 до 3600 секунд');
          project.cue = { id: randomUUID(), label: this.name(command.name), ...(text ? { text } : {}), expiresAt: seconds ? Date.now() + seconds * 1000 : null }; break;
        }
        case 'cue.hide': project.cue = null; break;
        case 'sound.play': {
          if (!project.tracks.some(t => t.id === command.trackId)) throw new Error('Трек не найден');
          const volume = command.volume ?? 0.8; if (!Number.isFinite(volume) || volume < 0 || volume > 1) throw new Error('Громкость от 0 до 1');
          state.sound = { id: command.id, projectId: project.id, trackId: command.trackId!, startedAt: Date.now(), volume }; break;
        }
        case 'sound.stop': if (!command.requestId || state.sound?.id === command.requestId) state.sound = null; break;
        case 'project.rename': project.name = this.name(command.name); break;
        case 'project.edition': {
          const edition = command.name;
          if (edition !== '2014' && edition !== '2024') throw new Error('Выберите редакцию D&D 2014 или 2024');
          project.edition = edition; for (const game of Object.values(project.games)) game.edition = edition; break;
        }
        case 'project.duplicate': {
          const copy = structuredClone(project);
          copy.id = randomUUID(); copy.name = this.name(command.name || `${project.name.slice(0, 90)} — копия`);
          state.projects.push(copy); state.openIds.push(copy.id); state.activeId = copy.id; break;
        }
        case 'project.move': {
          const oldIndex = state.openIds.indexOf(project.id);
          if (oldIndex < 0 || !Number.isSafeInteger(command.targetIndex) || command.targetIndex! < 0 || command.targetIndex! >= state.openIds.length) throw new Error('Некорректная позиция вкладки');
          state.openIds.splice(oldIndex, 1); state.openIds.splice(command.targetIndex!, 0, project.id); break;
        }
        case 'project.live': project.activeShopId = null; state.liveId = project.id; break;
        case 'project.stop': state.liveId = null; break;
        case 'monster.save': {
          if (!validMonster(command.monster)) throw new Error('Некорректный шаблон монстра');
          const monster = structuredClone(command.monster); const existing = project.monsters.findIndex(m => m.id === monster.id);
          monster.portrait = existing >= 0 ? project.monsters[existing].portrait : undefined;
          if (existing < 0) { if (project.monsters.length >= 1000) throw new Error('В библиотеке уже 1000 монстров'); project.monsters.push(monster); } else project.monsters[existing] = monster;
          break;
        }
        case 'monster.portrait': {
          const monster = project.monsters.find(m => m.id === command.monsterId); if (!monster || !portrait) throw new Error('Монстр или карта не найдены');
          monster.portrait = { ...portrait, id: monster.id, name: monster.name, caption: monster.type.slice(0,200), subtitle: monster.source.slice(0,200) }; break;
        }
        case 'monster.delete': project.monsters = project.monsters.filter(m => m.id !== command.monsterId); break;
        case 'plan.save': {
          if (!validPlan(command.plan)) throw new Error('Некорректная заготовка столкновения');
          const plans = project.plans ??= []; const plan = { ...structuredClone(command.plan), name: command.plan.name.trim() }; const index = plans.findIndex(item => item.id === plan.id);
          if (index < 0 && plans.length >= 200) throw new Error('В проекте уже 200 заготовок');
          if (index >= 0) plans[index] = plan; else plans.push(plan); break;
        }
        case 'plan.delete': project.plans = (project.plans || []).filter(item => item.id !== command.planId); break;
        case 'plan.start': {
          // One command, so a failed enemy leaves no half-built combat behind.
          const plan = (project.plans || []).find(item => item.id === command.planId); if (!plan) throw new Error('Заготовка не найдена');
          const heroes = command.heroes ?? []; if (!Array.isArray(heroes) || heroes.length > 30 || !heroes.every(id => typeof id === 'string')) throw new Error('Некорректный список героев');
          const step = (extra: Partial<Command>) => combatCommand(project, { id: command.id, type: 'combat.add', ...extra });
          combatCommand(project, { id: command.id, type: 'combat.create', name: plan.name });
          for (const characterId of heroes) step({ characterId });
          for (const enemy of plan.enemies) {
            const loot = enemy.loot.length ? { loot: enemy.loot } : {};
            if (enemy.monsterId && project.monsters.some(m => m.id === enemy.monsterId)) step({ monsterId: enemy.monsterId, count: enemy.count, ...loot });
            else step({ participant: { name: enemy.name, maxHp: enemy.hp, ac: enemy.ac, ...(enemy.source ? { source: enemy.source } : {}) }, count: enemy.count, ...loot });
          }
          if (plan.sceneId && project.scenes.some(scene => scene.id === plan.sceneId)) project.sceneId = plan.sceneId;
          break;
        }
        case 'spell.save': case 'weapon.save': {
          const spell = command.type === 'spell.save';
          const value = spell ? command.spell : command.weapon;
          if (spell ? !validSpell(value) : !validWeapon(value)) throw new Error(spell ? 'Некорректное заклинание' : 'Некорректное оружие');
          const list = (spell ? (project.spells ??= []) : (project.weapons ??= [])) as { id: string }[];
          const index = list.findIndex(item => item.id === value!.id);
          if (index < 0) { if (list.length >= 2000) throw new Error('Библиотека переполнена'); list.push(structuredClone(value!)); } else list[index] = structuredClone(value!);
          break;
        }
        case 'item.save': {
          if (!validItem(command.libraryItem)) throw new Error('Проверьте название, цену и поля предмета');
          const list = project.items ??= [];
          const value = structuredClone(command.libraryItem); const index = list.findIndex(item => item.id === value.id);
          if (index < 0) { if (list.length >= 2000) throw new Error('В проекте уже 2000 предметов'); delete value.artwork; list.push(value); }
          else { value.artwork = list[index].artwork; list[index] = value; }
          break;
        }
        case 'library.import': {
          // Bulk JSON import: everything is validated first so a bad entry never leaves a half-imported library.
          const items = command.libraryItems || []; const weapons = command.weapons || [];
          if (!Array.isArray(items) || !Array.isArray(weapons) || !items.length && !weapons.length) throw new Error('Нет предметов для импорта');
          if (!items.every(validItem) || !weapons.every(validWeapon)) throw new Error('Некоторые предметы не прошли проверку');
          if ((project.items || []).length + items.length > 2000 || (project.weapons || []).length + weapons.length > 2000) throw new Error('Библиотека переполнится: не больше 2000 предметов и 2000 видов оружия');
          const fresh = <T extends { id: string; artwork?: unknown }>(value: T): T => { const copy = structuredClone(value); delete copy.artwork; copy.id = randomUUID(); return copy; };
          (project.items ??= []).push(...items.map(fresh)); (project.weapons ??= []).push(...weapons.map(fresh)); break;
        }
        case 'item.delete': project.items = (project.items || []).filter(item => item.id !== command.itemId); break;
        case 'item.artwork': {
          const item = (project.items || []).find(entry => entry.id === command.itemId);
          if (!item || !portrait) throw new Error('Предмет или изображение не найдены');
          item.artwork = { image: portrait.image, width: portrait.width, height: portrait.height }; break;
        }
        case 'spell.delete': project.spells = (project.spells || []).filter(item => item.id !== command.itemId); break;
        case 'weapon.delete': project.weapons = (project.weapons || []).filter(item => item.id !== command.itemId); break;
        case 'character.import': {
          if (!importedCharacter || !validGame(importedCharacter.game)) throw new Error('Некорректный импорт персонажа');
          // With characterId the sheet replaces an existing hero in place: id, portrait and player links stay.
          const replacing = command.characterId ? project.characters.find(item => item.id === command.characterId) : undefined;
          if (command.characterId && !replacing) throw new Error('Персонаж для замены не найден');
          if (!replacing && project.characters.length >= 200) throw new Error('В проекте уже 200 персонажей');
          // Magic items from an imported sheet join the library, so their effects stay editable in one place.
          const items = importedCharacter.items || []; const weapons = importedCharacter.weapons || [];
          if (!items.every(validItem) || !weapons.every(validWeapon)) throw new Error('Предметы персонажа не прошли проверку');
          if ((project.items || []).length + items.length > 2000 || (project.weapons || []).length + weapons.length > 2000) throw new Error('Библиотека переполнится: не больше 2000 предметов и 2000 видов оружия');
          (project.items ??= []).push(...structuredClone(items)); (project.weapons ??= []).push(...structuredClone(weapons));
          // Spells the SRD lacks arrive with their description; a spell the master already has keeps the master's version.
          const spells = (importedCharacter.spells || []).filter(spell => validSpell(spell) && !(project.spells || []).some(own => own.name.trim().toLowerCase() === spell.name.trim().toLowerCase()));
          if ((project.spells || []).length + spells.length > 2000) throw new Error('Библиотека заклинаний переполнится');
          (project.spells ??= []).push(...structuredClone(spells));
          if (replacing) {
            Object.assign(replacing, { name: importedCharacter.character.name, caption: importedCharacter.character.caption, subtitle: importedCharacter.character.subtitle });
            project.games[replacing.id] = structuredClone(importedCharacter.game); project.selectedCharacter = replacing.id;
            const participant = project.combat?.participants.find(item => item.characterId === replacing.id); if (participant) participant.name = replacing.name;
            break;
          }
          project.characters.push(structuredClone(importedCharacter.character));
          project.games[importedCharacter.character.id] = structuredClone(importedCharacter.game);
          project.selectedCharacter = importedCharacter.character.id; break;
        }
        case 'character.create': {
          if (project.characters.length >= 200) throw new Error('В проекте уже 200 персонажей');
          const id = randomUUID(); const base = characters[2];
          project.characters.push({ ...base, id, name: this.name(command.name), caption: 'Новый персонаж', subtitle: 'Заполните лист персонажа' });
          project.games[id] = { hp: 10, maxHp: 10, ac: 10, blocks: [], edition: project.edition || '2024', level: 1, abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } }; project.selectedCharacter = id; break;
        }
        case 'character.metadata': case 'character.portrait': {
          const character = project.characters.find(item => item.id === command.characterId);
          if (!character) throw new Error('Персонаж не найден');
          if (command.type === 'character.portrait') { if (!portrait) throw new Error('Портрет не загружен'); Object.assign(character, portrait); }
          else {
            const value = command.character; if (!value) throw new Error('Нет изменений персонажа');
            if (value.name !== undefined) character.name = this.name(value.name);
            for (const key of ['caption','subtitle'] as const) if (value[key] !== undefined) { if (typeof value[key] !== 'string' || value[key]!.length > 200) throw new Error('Подпись не длиннее 200 символов'); character[key] = value[key]!; }
            const participant = project.combat?.participants.find(p => p.characterId === character.id); if (participant) participant.name = character.name;
          }
          break;
        }
        case 'character.delete': {
          if (project.characters.length <= 1) throw new Error('Оставьте хотя бы одного персонажа');
          if (!project.characters.some(item => item.id === command.characterId)) throw new Error('Персонаж не найден');
          if ([project.combat, ...project.encounters].some(combat => combat?.participants.some(p => p.characterId === command.characterId))) throw new Error('Сначала уберите персонажа из столкновений');
          project.characters = project.characters.filter(item => item.id !== command.characterId); delete project.games[command.characterId!];
          if (project.selectedCharacter === command.characterId) project.selectedCharacter = project.characters[0].id; break;
        }
        case 'character.offstage': {
          const character = project.characters.find(item => item.id === command.characterId);
          if (!character || typeof command.visible !== 'boolean') throw new Error('Персонаж не найден');
          if (command.visible) delete character.offstage; else character.offstage = true; break;
        }
        case 'character.select':
          if (!project.characters.some(item => item.id === command.characterId)) throw new Error('Персонаж не найден');
          project.selectedCharacter = command.characterId!; break;
        case 'character.update':
          if (!command.characterId || !project.games[command.characterId] || !validGame(command.game)) throw new Error('Некорректные характеристики или заметки');
          project.games[command.characterId] = { ...project.games[command.characterId], ...structuredClone(command.game) }; break;
        case 'layout.update': {
          const layout = command.layout;
          if (!layout || ![layout.scale, layout.x, layout.y].every(Number.isFinite) || layout.scale < 0.3 || layout.scale > 3 || layout.x < 0 || layout.x > 100 || layout.y < 0 || layout.y > 100) throw new Error('Некорректный масштаб или положение');
          if (command.target !== 'card' && command.target !== 'background') throw new Error('Неизвестный объект');
          if (command.target === 'card') project.layout = { ...layout }; else project.background = { ...layout };
          break;
        }
        case 'folder.create':
          if (command.folderId && !project.folders.some(f => f.id === command.folderId)) throw new Error('Папка не найдена');
          { const folder: Project['folders'][number] = { id: randomUUID(), name: this.name(command.name), parentId: command.folderId || null }; if ('playlistId' in command) this.assignPlaylist(project, folder, command.playlistId); project.folders.push(folder); } break;
        case 'folder.rename': {
          const folder = project.folders.find(f => f.id === command.folderId);
          if (!folder) throw new Error('Папка не найдена'); folder.name = this.name(command.name); break;
        }
        case 'folder.delete':
          if (!project.folders.some(f => f.id === command.folderId)) throw new Error('Папка не найдена');
          if (project.folders.some(f => f.parentId === command.folderId) || project.scenes.some(s => s.folderId === command.folderId)) throw new Error('Сначала переместите содержимое папки');
          project.folders = project.folders.filter(f => f.id !== command.folderId); break;
        case 'folder.update': {
          const folder = project.folders.find(f => f.id === command.folderId);
          if (!folder) throw new Error('Папка не найдена');
          const parentId = command.parentId || null;
          for (let cursor = parentId; cursor; cursor = project.folders.find(f => f.id === cursor)?.parentId || null) {
            if (cursor === folder.id) throw new Error('Папку нельзя вложить в саму себя');
            if (!project.folders.some(f => f.id === cursor)) throw new Error('Родительская папка не найдена');
          }
          folder.name = this.name(command.name); folder.parentId = parentId;
          this.assignPlaylist(project, folder, command.playlistId); break;
        }
        case 'scene.update': {
          const scene = project.scenes.find(s => s.id === command.sceneId);
          if (!scene) throw new Error('Локация не найдена');
          if (command.folderId && !project.folders.some(f => f.id === command.folderId)) throw new Error('Папка не найдена');
          scene.name = this.name(command.name); scene.folderId = command.folderId || null;
          this.assignPlaylist(project, scene, command.playlistId); break;
        }
        case 'scene.replace': {
          const scene = project.scenes.find(s => s.id === command.sceneId);
          if (!scene || !importedScene) throw new Error('Локация или файл не найдены');
          scene.url = importedScene.url; scene.type = importedScene.type; break;
        }
        case 'playlist.save': {
          const value = command.playlist;
          if (!value || typeof value.id !== 'string' || !/^[\w-]{1,100}$/.test(value.id) || !Array.isArray(value.trackIds) || value.trackIds.length > 1000) throw new Error('Некорректный плейлист');
          if (!value.trackIds.every(id => project.tracks.some(track => track.id === id))) throw new Error('Трек не найден');
          let playlist = project.playlists.find(item => item.id === value.id);
          if (!playlist) {
            if (project.playlists.length >= 500) throw new Error('В проекте уже 500 плейлистов');
            playlist = { id: value.id, name: '', trackIds: [] }; project.playlists.push(playlist);
          }
          playlist.name = this.name(value.name); playlist.trackIds = [...new Set(value.trackIds)];
          if (value.spotifyUrl) playlist.spotifyUrl = this.spotifyUrl(value.spotifyUrl); else delete playlist.spotifyUrl;
          break;
        }
        case 'spotify.transport': {
          const spotify = state.spotify;
          if (!spotify || spotify.projectId !== project.id) throw new Error('Spotify не запущен для этого проекта');
          if (command.volume !== undefined) { if (!Number.isFinite(command.volume) || command.volume < 0 || command.volume > 1) throw new Error('Некорректная громкость'); spotify.volume = command.volume; }
          if (command.playing !== undefined) { if (typeof command.playing !== 'boolean') throw new Error('Некорректный режим'); spotify.playing = command.playing; spotify.startedAt = Date.now(); }
          break;
        }
        case 'scene.rename': case 'scene.move': case 'scene.delete': {
          const scene = project.scenes.find(s => s.id === command.sceneId);
          if (!scene) throw new Error('Сцена не найдена');
          if (command.type === 'scene.rename') scene.name = this.name(command.name);
          if (command.type === 'scene.move') {
            if (command.folderId && !project.folders.some(f => f.id === command.folderId)) throw new Error('Папка не найдена');
            scene.folderId = command.folderId || null;
          }
          if (command.type === 'scene.delete') {
            project.scenes = project.scenes.filter(s => s.id !== scene.id);
            if (project.sceneId === scene.id) project.sceneId = project.scenes[0]?.id || null;
          }
          break;
        }
        case 'track.import':
          if (!importedTrack) throw new Error('Аудиофайл не загружен');
          project.tracks.push(importedTrack); break;
        case 'track.delete': {
          if (!project.tracks.some(item => item.id === command.trackId)) throw new Error('Трек не найден');
          project.tracks = project.tracks.filter(item => item.id !== command.trackId);
          for (const playlist of project.playlists) playlist.trackIds = playlist.trackIds.filter(id => id !== command.trackId);
          break;
        }
        case 'playlist.create':
          project.playlists.push({ id: randomUUID(), name: this.name(command.name), trackIds: [] }); break;
        case 'playlist.rename': case 'playlist.track.add': case 'playlist.track.remove': case 'playlist.track.move': case 'playlist.delete': case 'playlist.spotify': {
          const playlist = project.playlists.find(item => item.id === command.playlistId);
          if (!playlist) throw new Error('Плейлист не найден');
          if (command.type === 'playlist.rename') playlist.name = this.name(command.name);
          if (command.type === 'playlist.track.add') {
            if (!project.tracks.some(track => track.id === command.trackId)) throw new Error('Трек не найден');
            if (!playlist.trackIds.includes(command.trackId!)) playlist.trackIds.push(command.trackId!);
          }
          if (command.type === 'playlist.track.move') {
            const index = playlist.trackIds.indexOf(command.trackId || '');
            if (index < 0 || !Number.isSafeInteger(command.targetIndex) || command.targetIndex! < 0 || command.targetIndex! >= playlist.trackIds.length) throw new Error('Некорректный порядок треков');
            playlist.trackIds.splice(index, 1); playlist.trackIds.splice(command.targetIndex!, 0, command.trackId!);
          }
          if (command.type === 'playlist.track.remove') playlist.trackIds = playlist.trackIds.filter(id => id !== command.trackId);
          if (command.type === 'playlist.spotify') {
            if (command.spotifyUrl) playlist.spotifyUrl = this.spotifyUrl(command.spotifyUrl);
            else delete playlist.spotifyUrl;
          }
          if (command.type === 'playlist.delete') {
            project.playlists = project.playlists.filter(item => item.id !== playlist.id);
            if (project.playlistId === playlist.id) project.playlistId = null;
            for (const item of [...project.folders, ...project.scenes]) if (item.playlistId === playlist.id) delete item.playlistId;
            if (state.music?.projectId === project.id && state.music.playlistId === playlist.id) state.music = null;
          }
          break;
        }
        case 'music.assign': {
          if (command.playlistId && !project.playlists.some(item => item.id === command.playlistId)) throw new Error('Плейлист не найден');
          if (command.target === 'project') project.playlistId = command.playlistId || null;
          else {
            const item = command.target === 'scene' ? project.scenes.find(item => item.id === command.sceneId) : command.target === 'folder' ? project.folders.find(item => item.id === command.folderId) : undefined;
            if (!item) throw new Error('Сцена или папка не найдены');
            if (command.playlistId === undefined) delete item.playlistId; else item.playlistId = command.playlistId;
          }
          break;
        }
        case 'music.play': {
          const playlist = project.playlists.find(item => item.id === command.playlistId);
          const uri = spotifyUri(playlist?.spotifyUrl);
          if (playlist && uri && !command.trackId) { state.music = null; state.spotify = { projectId: project.id, playlistId: playlist.id, uri, playing: true, volume: state.spotify?.volume ?? 0.5, startedAt: Date.now() }; break; }
          const trackId = command.trackId || playlist?.trackIds[0];
          if (!playlist || !trackId || !playlist.trackIds.includes(trackId)) throw new Error('Добавьте треки в плейлист');
          state.spotify = null;
          state.music ={ projectId: project.id, playlistId: playlist.id, trackId, playing: true, position: 0, startedAt: Date.now(), volume: state.music?.volume ?? 0.5 }; break;
        }
        case 'music.transport': {
          const music = state.music;
          if (!music || music.projectId !== project.id) throw new Error('Музыка не запущена для этого проекта');
          if (command.volume !== undefined) { if (!Number.isFinite(command.volume) || command.volume < 0 || command.volume > 1) throw new Error('Некорректная громкость'); music.volume = command.volume; }
          if (command.playing !== undefined && typeof command.playing !== 'boolean') throw new Error('Некорректный режим');
          if (command.playing !== undefined || command.position !== undefined) {
            const position = command.position ?? music.position + (music.playing ? (Date.now() - music.startedAt) / 1000 : 0);
            if (!Number.isFinite(position) || position < 0 || position > 86400) throw new Error('Некорректная позиция');
            music.position = position; music.startedAt = Date.now(); music.playing = command.playing ?? music.playing;
          }
          break;
        }
        case 'music.next': {
          const music = state.music;
          const playlist = project.playlists.find(item => item.id === music?.playlistId);
          if (!music || music.projectId !== project.id || !playlist?.trackIds.length) throw new Error('Плейлист пуст');
          music.trackId = playlist.trackIds[(playlist.trackIds.indexOf(music.trackId) + 1) % playlist.trackIds.length]; music.position = 0; music.startedAt = Date.now(); break;
        }
        case 'scene.select':
          if (!project.scenes.some(scene => scene.id === command.sceneId)) throw new Error('Сцена не найдена');
          project.sceneId = command.sceneId!; project.activeShopId = null; break;
        case 'scene.import':
          if (!importedScene) throw new Error('Изображение не загружено');
          if (importedScene.folderId && !project.folders.some(f => f.id === importedScene.folderId)) throw new Error('Папка не найдена');
          project.scenes.push(importedScene); project.sceneId = importedScene.id; break;
        default: throw new Error('Неизвестная команда');
      }
    }
    const active = state.projects.find(item => item.id === state.liveId);
    const followsScene = ['combat.start', 'plan.start', 'shop.show', 'preset.apply', 'project.live', 'scene.select', 'scene.move', 'scene.delete', 'scene.import', 'folder.delete', 'music.assign', 'playlist.delete', 'playlist.track.add', 'playlist.track.remove', 'track.delete', 'scene.update', 'folder.update', 'playlist.save', 'playlist.spotify'].includes(command.type);
    if (command.type === 'project.stop') { state.music = null; state.spotify = null; }
    else if (active && followsScene && active.id === command.projectId) {
      const playlistId = resolvePlaylist(active);
      const playlist = active.playlists.find(item => item.id === playlistId);
      const uri = spotifyUri(playlist?.spotifyUrl);
      const trackId = playlist?.trackIds[0];
      if (playlist && uri) {
        state.music = null;
        if (state.spotify?.projectId !== active.id || state.spotify.playlistId !== playlist.id || state.spotify.uri !== uri) state.spotify = { projectId: active.id, playlistId: playlist.id, uri, playing: true, volume: state.spotify?.volume ?? 0.5, startedAt: Date.now() };
      } else {
        state.spotify = null;
        if (!playlist || !trackId) state.music = null;
        else if (state.music?.projectId !== active.id || state.music.playlistId !== playlist.id) state.music = { projectId: active.id, playlistId: playlist.id, trackId, playing: true, position: 0, startedAt: Date.now(), volume: state.music?.volume ?? 0.5 };
      }
    }
    if (state.spotify) {
      const list = state.projects.find(item => item.id === state.spotify!.projectId)?.playlists.find(item => item.id === state.spotify!.playlistId);
      const uri = spotifyUri(list?.spotifyUrl);
      if (!uri) state.spotify = null; else state.spotify.uri = uri;
    }
    if (state.music) {
      const owner = state.projects.find(item => item.id === state.music!.projectId);
      const list = owner?.playlists.find(item => item.id === state.music!.playlistId);
      if (!list?.trackIds.length) state.music = null;
      else if (!list.trackIds.includes(state.music.trackId)) { state.music.trackId = list.trackIds[0]; state.music.position = 0; state.music.startedAt = Date.now(); }
    }
    if (state.sound && !state.projects.find(p => p.id === state.sound!.projectId)?.tracks.some(t => t.id === state.sound!.trackId)) state.sound = null;
    state.revision++;
    this.db.run('BEGIN');
    try {
      this.db.run('UPDATE workspace SET payload=? WHERE id=1', [JSON.stringify(state)]);
      this.db.run('INSERT INTO commands VALUES(?, ?)', [command.id, state.revision]);
      this.db.run('COMMIT');
      this.flush();
    } catch (error) {
      // Reload the last durable snapshot if replacing the database file failed.
      try { this.db.run('ROLLBACK'); } catch { /* Transaction may already be committed. */ }
      const bytes = readFileSync(this.filename);
      this.db.close();
      // The constructor is retained by sql.js and supports importing an exported database.
      this.db = new (this.db.constructor as new (bytes: Uint8Array) => Database)(bytes);
      throw error;
    }
    return state;
  }
  close() { this.db.close(); }
}
