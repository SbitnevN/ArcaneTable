import { validHeroExtras, validInventoryItem, validMonsterDetails } from './library.js';
export type Block = { id: string; kind: 'text' | 'details' | 'spoiler'; title: string; text: string };
export type Game = { hp: number; maxHp: number; ac: number; blocks: Block[]; edition?: '2014' | '2024'; level?: number; race?: string; className?: string; speed?: number; abilities?: Record<string, number>; inventory?: string; spells?: string[]; spellBook?: string[]; attacks?: Action[]; features?: Feature[]; initiative?: number; saves?: Ability[]; skills?: string; coins?: Partial<Record<'cp' | 'sp' | 'ep' | 'gp' | 'pp', number>>; items?: InventoryItem[]; spellSlots?: SpellSlot[]; lssOriginal?: Record<string, unknown>; lssBaseline?: Record<string, unknown> };
// Spell slots by circle: index 0 is the 1st circle; used counts spent slots until a rest.
export type SpellSlot = { max: number; used: number };
export type Layout = { scale: number; x: number; y: number };
export type Folder = { id: string; name: string; parentId: string | null; playlistId?: string | null };
export const defaultLayout: Layout = { scale: 1, x: 50, y: 50 };
export const defaultHandLayout: Layout = { scale: 1, x: 50, y: 80 };
export type Scene = { id: string; name: string; url: string; type: 'image' | 'video'; folderId?: string | null; playlistId?: string | null };
export type Track = { id: string; name: string; url: string };
export type Playlist = { id: string; name: string; trackIds: string[]; spotifyUrl?: string };
export type Music = { projectId: string; playlistId: string; trackId: string; playing: boolean; position: number; startedAt: number; volume: number };
export type SpotifyPlayback = { projectId: string; playlistId: string; uri: string; playing: boolean; volume: number; startedAt: number };
export type SpotifyStatus = { configured: boolean; clientId: string; connected: boolean; user: string; premium: boolean | null; device: string; error: string; redirectUri: string };
export function spotifyUri(url: string | undefined): string | null {
  const match = url ? /^https:\/\/open\.spotify\.com\/(playlist|album|track)\/([A-Za-z0-9]+)$/.exec(url) : null;
  return match ? `spotify:${match[1]}:${match[2]}` : null;
}
export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export type DamagePart = { dice: string; type: string };
// One attack, spell-like action or ability: dice and consequences are reference info, damage is still entered by hand in combat.
export type Action = { id: string; name: string; kind: 'melee' | 'ranged' | 'spell' | 'save' | 'other'; bonus?: number; dc?: number; save?: Ability; reach?: string; damage: DamagePart[]; onSave?: 'half' | 'none'; conditions?: string[]; recharge?: string; effect: string };
export type Feature = { id: string; name: string; text: string };
export type Monster = { id: string; name: string; edition: '2014' | '2024'; hp: number; ac: number; type: string; cr: string; speed: string; abilities: Record<string, number>; description: string; source: string; page?: number; portrait?: Character;
  size?: string; creature?: string; alignment?: string; hpDice?: string; acNote?: string; initiative?: number; saves?: Partial<Record<Ability, number>>; skills?: string; senses?: string; languages?: string; xp?: number;
  vulnerabilities?: string; resistances?: string; immunities?: string; conditionImmunities?: string; traits?: Feature[]; actions?: Action[]; bonusActions?: Action[]; reactions?: Action[]; legendary?: Action[]; loot?: InventoryItem[] };
export type Spell = { id: string; name: string; edition: '2014' | '2024'; level: number; school: string; castingTime: string; range: string; components: string; duration: string; concentration: boolean; ritual: boolean; attack: 'none' | 'melee' | 'ranged' | 'save' | 'auto'; save?: Ability; damage: DamagePart[]; heal?: string; onSave?: 'half' | 'none'; higher: string; conditions: string[]; effect: string; description: string; classes: string; source: string };
export type Weapon = { id: string; name: string; category: 'simple' | 'martial' | 'magic'; range: 'melee' | 'ranged'; damage: DamagePart[]; versatile?: string; properties: string[]; distance?: string; mastery?: string; bonus?: number; weight?: string; cost?: string; conditions: string[]; effect: string; description: string };
// Encounter prep: a reusable list of enemies without heroes; «Начать» turns it into a combat with the chosen heroes.
export type PlanEnemy = { id: string; name: string; hp: number; ac: number; count: number; monsterId?: string; source?: string; cr?: string; loot: InventoryItem[] };
export type EncounterPlan = { id: string; name: string; note: string; sceneId: string | null; enemies: PlanEnemy[] };
export type Participant = { id: string; name: string; side: 'ally' | 'enemy'; portrait?: Character; characterId?: string; hp: number; maxHp: number; ac: number; initiative: number; visible: boolean; hideHp: boolean; hideAc: boolean; statuses: string[]; source?: string; loot?: InventoryItem[] };
// One inventory tile: a copy of a library item (or a custom thing) with its own quantity.
export type InventoryItem = { id: string; sourceId?: string; name: string; icon: string; artwork?: Artwork; quantity: number; description: string; kind: string; rarity?: Rarity; equipped?: boolean; effects?: Effect[] };
// Item rule block: «Персонаж → получает/становится → стат → значение → макс», active while the item is equipped.
export type EffectStat = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha' | 'ac' | 'speed' | 'initiative' | 'saves';
export type StatEffect = { stat: EffectStat; op: 'add' | 'set' | 'fix' | 'cap' | 'mul'; value: number; max?: number };
export type TraitEffect = { trait: 'resist' | 'immune' | 'vulnerable' | 'condition' | 'advantage' | 'disadvantage' | 'sense'; what: string; value?: number };
export type Effect = StatEffect | TraitEffect;
export type LootState = { pool: InventoryItem[]; order: string[]; turn: number; log: string[] };
export type CombatRequest = { id: string; sourceId: string; targetId: string; kind: 'damage' | 'heal'; amount: number };
export type CombatEvent = { id: string; label: string; sourceId?: string; targetId?: string; kind?: 'damage' | 'heal' | 'undo'; amount?: number; at?: number };
export type Combat = { id: string; name: string; running: boolean; round: number; activeId: string | null; approval: boolean; participants: Participant[]; pending: CombatRequest[]; history: { targetId: string; before: number; after: number }[]; events: CombatEvent[]; loot?: LootState | null };
export type PublicParticipant = Omit<Participant, 'hp' | 'maxHp' | 'ac' | 'hideHp' | 'hideAc' | 'visible'> & { hp?: number; maxHp?: number; ac?: number; portrait?: Character };
export type PublicLoot = { pool: Omit<InventoryItem, 'sourceId'>[]; order: { characterId: string; name: string }[]; turn: string | null; log: string[] };
export type PublicCombat = { name: string; running: boolean; round: number; activeId: string | null; participants: PublicParticipant[]; events: CombatEvent[]; loot?: PublicLoot | null };
export type ScenePreset = { id:string; name:string; sceneId:string | null; characterId:string; layout:Layout; background:Layout };
export type Sound = { id:string; projectId:string; trackId:string; startedAt:number; volume:number };
// A master's message on the shared screen: a headline, optional text; expiresAt null keeps it until the master hides it.
export type Cue = { id:string; label:string; text?:string; expiresAt:number | null };
export type Icons = { heart:string; shield:string };
export const defaultIcons: Icons = { heart:'/assets/heart.png',shield:'/assets/shield.png' };
// Built-in icons from earlier versions; projects still pointing at them move to the current painted ones.
export function upgradeIcons(icons: Icons): Icons { return { heart: icons.heart === '/assets/heart.svg' ? defaultIcons.heart : icons.heart, shield: icons.shield === '/assets/shield.svg' ? defaultIcons.shield : icons.shield }; }
export type Artwork = { image:string; width:number; height:number };
export type ShopItem = { id:string; name:string; description:string; notes:string; category:string; price:number; currency:'cp' | 'sp' | 'ep' | 'gp' | 'pp'; stock:number | null; visible:boolean; version:number; artwork?:Artwork; icon?:string; sourceId?:string; rarity?:Rarity };
export type ItemKind = 'armor' | 'potion' | 'scroll' | 'ring' | 'wand' | 'wondrous' | 'ammo' | 'tool' | 'gear' | 'food' | 'treasure';
export type Rarity = 'mundane' | 'common' | 'uncommon' | 'rare' | 'very-rare' | 'legendary' | 'artifact';
// Library item shown on the «Предметы» page; weapons live separately in project.weapons with their dice.
export type Item = { id:string; name:string; kind:ItemKind; rarity:Rarity; attunement:boolean; price:number; currency:ShopItem['currency']; weight:string; icon:string; description:string; effect:string; notes:string; damage:DamagePart[]; heal?:string; conditions:string[]; charges?:number; ac?:number; armorType?:'light' | 'medium' | 'heavy' | 'shield'; strength?:number; stealth?:boolean; spell?:string; quantity?:number; artwork?:Artwork; effects?:Effect[] };
export type Shop = { id:string; name:string; merchant:string; description:string; notes:string; hideSoldOut:boolean; pageSize:number; page:number; displayCategory:string; artwork?:Artwork; items:ShopItem[] };
export type PublicShop = Pick<Shop,'id' | 'name' | 'merchant' | 'description' | 'artwork' | 'page'> & { pages:number; total:number; items:Omit<ShopItem,'notes' | 'visible' | 'version'>[] };
export type Project = { id: string; name: string; icons:Icons; shops:Shop[]; activeShopId:string | null; dmNotes:string; presets:ScenePreset[]; cue:Cue | null; selectedCharacter: string; layout: Layout; background: Layout; folders: Folder[]; tracks: Track[]; playlists: Playlist[]; playlistId: string | null; combat: Combat | null; encounters: Combat[]; plans?: EncounterPlan[]; characters: Character[]; monsters: Monster[]; edition?: '2014' | '2024'; spells?: Spell[]; weapons?: Weapon[]; items?: Item[]; games: Record<string, Game>; scenes: Scene[]; sceneId: string | null };
export type Workspace = { projects: Project[]; openIds: string[]; activeId: string; liveId: string | null; sound:Sound | null; music: Music | null; spotify?: SpotifyPlayback | null; revision: number };
export type PublicView = { party?: PublicParticipant[]; icons?:Icons; shop?:PublicShop | null; cue?:Cue | null; character?: Character; combat?: PublicCombat | null; layout: Layout; background: Layout; projectName: string; scene: Scene | null; characterId: string; hp?: number; maxHp?: number; ac?: number };
export type Command = { id: string; type: string; projectId?: string; name?: string; characterId?: string; game?: Game; sceneId?: string; targetIndex?: number; layout?: Layout; target?: string; folderId?: string | null; playlistId?: string | null; trackId?: string; spotifyUrl?: string; position?: number; volume?: number; playing?: boolean; amount?: number; targetId?: string; participantId?: string; sourceId?: string; requestId?: string; kind?: string; approval?: boolean; participant?: Partial<Participant>; encounterId?: string; character?: Partial<Character>; monster?: Monster; monsterId?: string; text?: string; presetId?: string; shopId?: string; itemId?: string; shop?: Partial<Shop>; item?: ShopItem; visible?: boolean; parentId?: string | null; playlist?: Playlist; spell?: Spell; weapon?: Weapon; count?: number; libraryItem?: Item; loot?: InventoryItem[]; libraryItems?: Item[]; weapons?: Weapon[]; plan?: EncounterPlan; planId?: string; heroes?: string[] };
export const characters = [
  { id: 'tarkhun', name: 'Тархун', image: '/assets/tarkhun.png', width: 1024, height: 1536, caption: 'Драконорождённый · маг', subtitle: 'Пламя древнего рода' },
  { id: 'aristocrat', name: 'Хранитель древней книги', image: '/assets/aristocrat.png', width: 1024, height: 1536, caption: 'Насекомый · хранитель', subtitle: 'Укажите характеристики персонажа' },
  { id: 'paladin', name: 'Паладин', image: '/assets/paladin.png', width: 1024, height: 1536, caption: 'Воин священной клятвы', subtitle: 'Укажите характеристики персонажа' }
];
// offstage: the hero is not at the table tonight — hidden from the shared screen and not added to new encounters by default.
export type Character = typeof characters[number] & { offstage?: boolean };
export const defaultGames: Record<string, Game> = {
  tarkhun: { hp: 28, maxHp: 32, ac: 15, blocks: [
    { id: 'intro', kind: 'text', title: 'История героя', text: 'Тархун — драконорождённый маг.' },
    { id: 'spell', kind: 'details', title: 'Заклинания и способности', text: 'Огненная стрела\nЩит\nВолшебная стрела' },
    { id: 'secret', kind: 'spoiler', title: 'Тайна Тархуна', text: 'Его посох хранит осколок сердца красного дракона.' }
  ] },
  aristocrat: { hp: 10, maxHp: 10, ac: 10, blocks: [] },
  paladin: { hp: 10, maxHp: 10, ac: 10, blocks: [] }
};
export function validGame(value: unknown): value is Game {
  if (!value || typeof value !== 'object') return false;
  const game = value as Game;
  if (![game.hp, game.maxHp, game.ac].every(Number.isSafeInteger)) return false;
  if (game.maxHp < 1 || game.hp < 0 || game.hp > game.maxHp || game.ac < 0) return false;
  if (game.edition !== undefined && !['2014','2024'].includes(game.edition)) return false;
  if (game.level !== undefined && (!Number.isSafeInteger(game.level) || game.level < 1 || game.level > 20)) return false;
  if (game.speed !== undefined && (!Number.isSafeInteger(game.speed) || game.speed < 0 || game.speed > 10000)) return false;
  for (const key of ['race','className','inventory'] as const) if (game[key] !== undefined && (typeof game[key] !== 'string' || game[key]!.length > (key === 'inventory' ? 100000 : 200))) return false;
  if (game.abilities !== undefined && (typeof game.abilities !== 'object' || game.abilities === null || !['str','dex','con','int','wis','cha'].every(key => Number.isSafeInteger(game.abilities![key]) && game.abilities![key] >= 1 && game.abilities![key] <= 30))) return false;
  for (const key of ['spells','spellBook'] as const) if (game[key] !== undefined && (!Array.isArray(game[key]) || game[key]!.length > 1000 || !game[key]!.every(value => typeof value === 'string' && value.length <= 500))) return false;
  if (game.lssOriginal !== undefined && (typeof game.lssOriginal !== 'object' || game.lssOriginal === null || JSON.stringify(game.lssOriginal).length > 5000000)) return false;
  if (!validHeroExtras(game)) return false;
  if (game.items !== undefined && (!Array.isArray(game.items) || game.items.length > 300 || !game.items.every(validInventoryItem))) return false;
  if (game.spellSlots !== undefined && (!Array.isArray(game.spellSlots) || game.spellSlots.length > 9 || !game.spellSlots.every(slot => slot && typeof slot === 'object' && Number.isSafeInteger(slot.max) && Number.isSafeInteger(slot.used) && slot.max >= 0 && slot.max <= 20 && slot.used >= 0 && slot.used <= slot.max))) return false;
  if (game.coins !== undefined && (typeof game.coins !== 'object' || game.coins === null || !Object.entries(game.coins).every(([key, value]) => ['cp','sp','ep','gp','pp'].includes(key) && Number.isSafeInteger(value) && value! >= 0 && value! <= 100000000))) return false;
  return Array.isArray(game.blocks) && game.blocks.length <= 500 && game.blocks.every(block =>
    block && typeof block.id === 'string' && block.id.length <= 100 &&
    typeof block.title === 'string' && block.title.length <= 500 &&
    typeof block.text === 'string' && block.text.length <= 50000 &&
    ['text', 'details', 'spoiler'].includes(block.kind));
}

export function resolvePlaylist(project: Project): string | null {
  const scene = project.scenes.find(item => item.id === project.sceneId);
  if (scene && scene.playlistId !== undefined) return scene.playlistId;
  let folderId = scene?.folderId;
  const visited = new Set<string>();
  while (folderId && !visited.has(folderId)) {
    visited.add(folderId);
    const folder = project.folders.find(item => item.id === folderId);
    if (!folder) break;
    if (folder.playlistId !== undefined) return folder.playlistId;
    folderId = folder.parentId;
  }
  return project.playlistId;
}

export function newId(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export type PlayerView = { icons?: Icons; shop?:PublicShop | null; pendingAction?: boolean; projectName: string; playerName: string; own: { characterId: string; game: Game } | null; combat?: PublicCombat | null; characters: (Character & { occupied: boolean })[]; catalog?: InventoryItem[]; spells?: Spell[] };
export type NetworkView = { enabled: boolean; address: string; port: number; url: string; interfaces: { name: string; address: string }[]; tvPairs?: { id: string; code: string; created: number }[]; invite?: { id: string; shown: boolean; link: string; uses: number; expiresAt: number; projectId?: string } | null; connections: { id: string; role: string; label: string; expiresAt: number; active: boolean; online: boolean; projectId?: string; characterId?: string; playerName?: string }[]; link?: string };

export function validPlan(value: unknown): value is EncounterPlan {
  const p = value as EncounterPlan; const id = (v: unknown) => typeof v === 'string' && /^[\w-]{1,100}$/.test(v);
  return Boolean(p) && typeof p === 'object' && id(p.id) && typeof p.name === 'string' && p.name.trim().length > 0 && p.name.length <= 100 && typeof p.note === 'string' && p.note.length <= 5000 && (p.sceneId === null || id(p.sceneId))
    && Array.isArray(p.enemies) && p.enemies.length <= 30 && p.enemies.every(e => Boolean(e) && id(e.id) && typeof e.name === 'string' && e.name.trim().length > 0 && e.name.length <= 100 && Number.isSafeInteger(e.hp) && e.hp >= 1 && e.hp <= 1000000 && Number.isSafeInteger(e.ac) && e.ac >= 0 && e.ac <= 1000
      && Number.isSafeInteger(e.count) && e.count >= 1 && e.count <= 10 && (e.monsterId === undefined || id(e.monsterId)) && (e.source === undefined || id(e.source)) && (e.cr === undefined || typeof e.cr === 'string' && e.cr.length <= 10)
      && Array.isArray(e.loot) && e.loot.length <= 50 && e.loot.every(validInventoryItem));
}
export function validMonster(value: unknown): value is Monster {
  if (!value || typeof value !== 'object') return false;
  const m = value as Monster;
  return typeof m.id === 'string' && /^[\w-]{1,100}$/.test(m.id) && typeof m.name === 'string' && m.name.trim().length > 0 && m.name.length <= 100 && ['2014','2024'].includes(m.edition) && Number.isSafeInteger(m.hp) && m.hp >= 1 && m.hp <= 1000000 && Number.isSafeInteger(m.ac) && m.ac >= 0 && m.ac <= 1000 && ['type','cr','speed','source','description'].every(key => typeof m[key as keyof Monster] === 'string' && (m[key as keyof Monster] as string).length <= (key === 'description' ? 100000 : 500)) && m.abilities && ['str','dex','con','int','wis','cha'].every(key => Number.isSafeInteger(m.abilities[key]) && m.abilities[key] >= 1 && m.abilities[key] <= 30) && validMonsterDetails(m);
}
