import { validInventoryItem, validItem, validSpell, validWeapon } from '../src/library.js';
import { validArtwork } from '../src/shop-view.js';
import { validShop } from '../src/shop-view.js';
import { ZipFile as Writer } from 'yazl';
import { open, type ZipFile, type Entry } from 'yauzl';
import { createReadStream, createWriteStream, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve, sep, extname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform, type Readable } from 'node:stream';
import { defaultIcons, upgradeIcons, validMonster, validPlan, validGame, type Project, type Combat } from '../src/contracts.js';

function assert(condition: unknown, message = 'Повреждённый или неподдерживаемый архив проекта'): asserts condition { if (!condition) throw new Error(message); }
const text = (value: unknown, max = 200) => typeof value === 'string' && value.length <= max;
const integer = (value: unknown, min: number, max: number) => Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
const ids = (items: { id: string }[]) => items.every(item => /^[\w-]{1,100}$/.test(item.id)) && new Set(items.map(item => item.id)).size === items.length;
function validateCombat(combat: Combat | null, project: Project) {
  if (!combat) return;
  assert(text(combat.id, 100) && text(combat.name, 100) && typeof combat.running === 'boolean' && typeof combat.approval === 'boolean' && integer(combat.round, 1, 1000000));
  assert(Array.isArray(combat.participants) && combat.participants.length <= 30 && ids(combat.participants));
  for (const p of combat.participants) assert(text(p.name,100) && ['ally','enemy'].includes(p.side) && (!p.characterId || project.games[p.characterId]) && integer(p.hp,0,1000000) && integer(p.maxHp,1,1000000) && p.hp <= p.maxHp && integer(p.ac,0,1000) && integer(p.initiative,-1000,1000) && ['visible','hideHp','hideAc'].every(key => typeof p[key as keyof typeof p] === 'boolean') && Array.isArray(p.statuses) && p.statuses.length <= 15 && p.statuses.every(s => text(s,100)));
  for (const p of combat.participants) if (p.portrait) validatePortrait(p.portrait);
  for (const p of combat.participants) assert(p.loot === undefined || Array.isArray(p.loot) && p.loot.length <= 50 && p.loot.every(validInventoryItem));
  if (combat.loot) assert(Array.isArray(combat.loot.pool) && combat.loot.pool.length <= 1500 && combat.loot.pool.every(validInventoryItem) && Array.isArray(combat.loot.order) && combat.loot.order.every(id => project.games[id]) && integer(combat.loot.turn, 0, 100) && Array.isArray(combat.loot.log) && combat.loot.log.every(line => text(line, 300)));
  const has = (id: string | null) => id === null || combat.participants.some(p => p.id === id);
  assert(has(combat.activeId) && Array.isArray(combat.pending) && combat.pending.length <= 30 && Array.isArray(combat.history) && combat.history.length <= 100 && Array.isArray(combat.events) && combat.events.length <= 200);
  for (const p of combat.pending) assert(text(p.id,100) && has(p.sourceId) && has(p.targetId) && ['damage','heal'].includes(p.kind) && integer(p.amount,1,1000000));
  for (const h of combat.history) assert(text(h.targetId,100) && integer(h.before,0,1000000) && integer(h.after,0,1000000));
  for (const e of combat.events) assert(text(e.id,100) && text(e.label,1000) && (!e.kind || ['damage','heal','undo'].includes(e.kind)) && (!e.targetId || text(e.targetId,100)));
}
function validatePortrait(c: import('../src/contracts.js').Character) { assert(c && text(c.name,100) && text(c.image,300) && text(c.caption) && text(c.subtitle) && integer(c.width,1,64000000) && integer(c.height,1,64000000) && c.width * c.height <= 64000000); }
export function validateProject(project: Project) {
  assert(project && typeof project === 'object' && text(project.name,100) && project.name.trim());
  project.icons ??= { ...defaultIcons }; assert(project.icons && Object.keys(project.icons).length === 2 && ['heart','shield'].every(key => typeof project.icons[key as keyof typeof project.icons] === 'string' && /^\/(assets\/[\w-]+\.(svg|png)|media\/[a-f0-9-]+\.(png|webp|svg))$/.test(project.icons[key as keyof typeof project.icons]))); project.icons = upgradeIcons(project.icons);
  project.shops ??= []; project.activeShopId ??= null; assert(Array.isArray(project.shops) && project.shops.length <= 50 && project.shops.every(validShop) && ids(project.shops) && (project.activeShopId === null || project.shops.some(s => s.id === project.activeShopId)));
  project.dmNotes ??= ''; project.presets ??= []; project.cue ??= null; assert(text(project.dmNotes,100000) && Array.isArray(project.presets) && project.presets.length <= 100 && ids(project.presets));
  for (const p of project.presets) assert(text(p.name,100) && text(p.characterId,100) && (p.sceneId === null || text(p.sceneId,100)));
  if (project.cue) assert(text(project.cue.id,100) && text(project.cue.label,100) && (project.cue.text === undefined || text(project.cue.text,1000)) && (project.cue.expiresAt === null || Number.isFinite(project.cue.expiresAt)));
  for (const layout of [project.layout, project.background, ...project.presets.flatMap(p => [p.layout,p.background])]) assert(layout && Number.isFinite(layout.scale) && layout.scale >= .3 && layout.scale <= 3 && Number.isFinite(layout.x) && layout.x >= 0 && layout.x <= 100 && Number.isFinite(layout.y) && layout.y >= 0 && layout.y <= 100);
  for (const items of [project.characters,project.scenes,project.tracks,project.playlists,project.folders]) assert(Array.isArray(items) && items.length <= 10000 && items.every(item => item && typeof item === 'object') && ids(items));
  assert(project.edition === undefined || ['2014','2024'].includes(project.edition));
  project.items ??= []; assert(Array.isArray(project.items) && project.items.length <= 2000 && project.items.every(validItem) && ids(project.items));
  for (const item of project.items) if (item.artwork) assert(validArtwork(item.artwork));
  project.spells ??= []; project.weapons ??= []; assert(Array.isArray(project.spells) && project.spells.length <= 2000 && project.spells.every(validSpell) && ids(project.spells) && Array.isArray(project.weapons) && project.weapons.length <= 2000 && project.weapons.every(validWeapon) && ids(project.weapons));
  project.monsters ??= []; assert(Array.isArray(project.monsters) && project.monsters.length <= 1000 && project.monsters.every(validMonster) && ids(project.monsters));
  for (const m of project.monsters) if (m.portrait) validatePortrait(m.portrait);
  assert(project.characters.length >= 1 && project.characters.length <= 200 && project.games && typeof project.games === 'object');
  for (const c of project.characters) assert(text(c.name,100) && text(c.caption) && text(c.subtitle) && (c.offstage === undefined || typeof c.offstage === 'boolean') && integer(c.width,1,64000000) && integer(c.height,1,64000000) && c.width * c.height <= 64000000 && validGame(project.games[c.id]));
  assert(project.characters.some(c => c.id === project.selectedCharacter));
  const playlist = (id: unknown) => id === undefined || id === null || project.playlists.some(p => p.id === id);
  const folder = (id: unknown) => id === undefined || id === null || project.folders.some(f => f.id === id);
  for (const s of project.scenes) assert(text(s.name,100) && ['image','video'].includes(s.type) && folder(s.folderId) && playlist(s.playlistId));
  for (const t of project.tracks) assert(text(t.name,100));
  for (const p of project.playlists) assert(text(p.name,100) && Array.isArray(p.trackIds) && p.trackIds.length <= 10000 && p.trackIds.every(id => project.tracks.some(t => t.id === id)) && (!p.spotifyUrl || /^https:\/\/open\.spotify\.com\/(playlist|track|album)\/[A-Za-z0-9]+$/.test(p.spotifyUrl)));
  for (const f of project.folders) {
    assert(text(f.name,100) && folder(f.parentId) && playlist(f.playlistId));
    const visited = new Set<string>(); let current: typeof f | undefined = f;
    while (current) { assert(!visited.has(current.id), 'Цикл в папках архива'); visited.add(current.id); current = project.folders.find(item => item.id === current!.parentId); }
  }
  assert(playlist(project.playlistId) && (project.sceneId === null || project.scenes.some(s => s.id === project.sceneId)));
  project.plans ??= []; assert(Array.isArray(project.plans) && project.plans.length <= 200 && project.plans.every(validPlan) && ids(project.plans));
  assert(Array.isArray(project.encounters) && project.encounters.length <= 100); validateCombat(project.combat, project); for (const c of project.encounters) validateCombat(c,project);
}
function portraits(project: Project) { return [...Object.values(project.games).flatMap(g => (g.items || []).flatMap(i => i.artwork ? [i.artwork] : [])), ...project.monsters.flatMap(m => (m.loot || []).flatMap(i => i.artwork ? [i.artwork] : [])), ...(project.plans || []).flatMap(p => p.enemies.flatMap(e => e.loot.flatMap(i => i.artwork ? [i.artwork] : []))), ...[project.combat, ...project.encounters].flatMap(c => [...(c?.participants || []).flatMap(p => p.loot || []), ...(c?.loot?.pool || [])].flatMap(i => i.artwork ? [i.artwork] : [])), ...(project.items || []).flatMap(i => i.artwork ? [i.artwork] : []), ...project.shops.flatMap(s => [...(s.artwork ? [s.artwork] : []), ...s.items.flatMap(i => i.artwork ? [i.artwork] : [])]), ...project.characters, ...project.monsters.flatMap(m => m.portrait ? [m.portrait] : []), ...[project.combat,...project.encounters].flatMap(c => c?.participants.flatMap(p => p.portrait ? [p.portrait] : []) || [])]; }
const references = (project: Project) => [...Object.values(project.icons), ...project.scenes.map(s => s.url), ...project.tracks.map(t => t.url), ...portraits(project).map(c => c.image)];
async function hashFile(filename: string) { const hash = createHash('sha256'); for await (const chunk of createReadStream(filename)) hash.update(chunk); return hash.digest('hex'); }

export async function writeProjectArchive(project: Project, directory: string, staticRoot: string, destination: string) {
  validateProject(project);
  const assets: { url: string; file: string; sha256: string }[] = []; const paths: string[] = [];
  for (const url of new Set(references(project))) {
    assert(/^\/(media\/[a-f0-9-]+\.(png|jpg|webp|svg|mp4|webm|mp3|wav|ogg)|assets\/[\w-]+\.(svg|png))$/.test(url), 'Архив поддерживает только управляемые медиа');
    const path = url.startsWith('/media/') ? join(directory,url) : join(staticRoot,url);
    assert(statSync(path).isFile(), 'Медиа не найдено'); paths.push(path);
    assets.push({ url, file: `media/${assets.length}${extname(url)}`, sha256: await hashFile(path) });
  }
  const zip = new Writer();
  const done = pipeline(zip.outputStream, createWriteStream(destination, { flags: 'wx' }));
  zip.on('error', error => (zip.outputStream as Readable).destroy(error));
  zip.addBuffer(Buffer.from(JSON.stringify({ format: 'arcane-table', version: 1, project, assets })), 'project.json');
  for (const [i, asset] of assets.entries()) zip.addFile(paths[i],asset.file,{ compress: false });
  zip.end(); await done;
}

export async function readProjectArchive(filename: string, directory: string): Promise<{ project: Project; rollback: () => void }> {
  const transferRoot = resolve(directory, 'transfers'); mkdirSync(transferRoot,{ recursive:true });
  const stage = mkdtempSync(join(transferRoot,'import-')); const extracted = new Map<string,string>(); const created: string[] = [];
  let zip: ZipFile | undefined;
  try {
    zip = await new Promise<ZipFile>((resolve, reject) => open(filename,{ lazyEntries:true, strictFileNames:true, validateEntrySizes:true },(error,value) => error ? reject(error) : resolve(value!)));
    assert(zip.entryCount <= 10001, 'В архиве слишком много файлов');
    let total = 0;
    await new Promise<void>((resolve,reject) => {
      zip!.once('error',reject); zip!.once('end',resolve);
      zip!.on('entry',(entry: Entry) => {
        void (async () => {
          assert(entry.fileName === 'project.json' || /^media\/\d+\.(png|jpg|webp|svg|mp4|webm|mp3|wav|ogg)$/.test(entry.fileName), 'Недопустимый путь в архиве');
          assert(!extracted.has(entry.fileName), 'Дубликат файла в архиве');
          total += entry.uncompressedSize; assert(total <= 5 * 1024 ** 3 && entry.uncompressedSize <= (entry.fileName === 'project.json' ? 20 : 200) * 1024 ** 2, 'Архив превышает ограничения размера');
          const stream = await new Promise<NodeJS.ReadableStream>((resolve,reject) => zip!.openReadStream(entry,(error,value) => error ? reject(error) : resolve(value!)));
          const path = join(stage,`${extracted.size}.part`); extracted.set(entry.fileName,path);
          await pipeline(stream,createWriteStream(path,{ flags:'wx' })); zip!.readEntry();
        })().catch(reject);
      });
      zip!.readEntry();
    });
    assert(extracted.has('project.json'));
    const manifest = JSON.parse(readFileSync(extracted.get('project.json')!,'utf8'));
    assert(manifest.format === 'arcane-table' && manifest.version === 1 && Array.isArray(manifest.assets));
    const project = manifest.project as Project; validateProject(project);
    const urls = [...new Set(references(project))]; const assets = manifest.assets as { url:string; file:string; sha256:string }[];
    assert(assets.length === urls.length && assets.length + 1 === extracted.size && new Set(assets.map(a => a.url)).size === assets.length && new Set(assets.map(a => a.file)).size === assets.length);
    const remap = new Map<string,string>();
    for (const asset of assets) {
      assert(urls.includes(asset.url) && extracted.has(asset.file) && /^[a-f0-9]{64}$/.test(asset.sha256));
      assert(asset.sha256 === await hashFile(extracted.get(asset.file)!), 'Контрольная сумма медиа не совпадает');
      const extension = extname(asset.file); const name = `${randomUUID()}${extension}`;
      // SVG is kept as an inert image (never inline markup); service applies nosniff + CSP.
      const target = join(directory,'media',name); mkdirSync(join(directory,'media'),{ recursive:true });
      renameSync(extracted.get(asset.file)!,target); created.push(target); remap.set(asset.url,`/media/${name}`);
    }
    for (const key of ['heart','shield'] as const) project.icons[key] = remap.get(project.icons[key])!;
    for (const s of project.scenes) s.url = remap.get(s.url)!; for (const t of project.tracks) t.url = remap.get(t.url)!; for (const c of portraits(project)) c.image = remap.get(c.image)!;
    project.cue = null; project.id = randomUUID(); project.name = `${project.name.slice(0,85)} — импорт`; project.combat && (project.combat.running = false); if (project.combat) project.combat.pending = [];
    return { project, rollback: () => { for (const path of created) unlinkSync(path); } };
  } catch (error) { for (const path of created) unlinkSync(path); throw error; }
  finally { zip?.close(); if (resolve(stage).startsWith(transferRoot + sep)) rmSync(stage,{ recursive:true,force:true,maxRetries:5,retryDelay:100 }); }
}
export function byteLimit(max: number) { let size = 0; return new Transform({ transform(chunk, _encoding, callback) { size += chunk.length; callback(size > max ? new Error('Архив не больше 1 ГБ') : null,chunk); } }); }
