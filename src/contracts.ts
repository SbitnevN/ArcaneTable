export type Block = { id: string; kind: 'text' | 'details' | 'spoiler'; title: string; text: string };
export type Game = { hp: number; maxHp: number; ac: number; blocks: Block[]; edition?: '2014' | '2024'; level?: number; race?: string; className?: string; speed?: number; abilities?: Record<string, number>; inventory?: string; spells?: string[]; spellBook?: string[]; lssOriginal?: Record<string, unknown>; lssBaseline?: Record<string, unknown> };
export type Layout = { scale: number; x: number; y: number };
export type Folder = { id: string; name: string; parentId: string | null; playlistId?: string | null };
export const defaultLayout: Layout = { scale: 1, x: 50, y: 50 };
export type Scene = { id: string; name: string; url: string; type: 'image' | 'video'; folderId?: string | null; playlistId?: string | null };
export type Track = { id: string; name: string; url: string };
export type Playlist = { id: string; name: string; trackIds: string[]; spotifyUrl?: string };
export type Music = { projectId: string; playlistId: string; trackId: string; playing: boolean; position: number; startedAt: number; volume: number };
export type Monster = { id: string; name: string; edition: '2014' | '2024'; hp: number; ac: number; type: string; cr: string; speed: string; abilities: Record<string, number>; description: string; source: string; page?: number; portrait?: Character };
export type Participant = { id: string; name: string; side: 'ally' | 'enemy'; portrait?: Character; characterId?: string; hp: number; maxHp: number; ac: number; initiative: number; visible: boolean; hideHp: boolean; hideAc: boolean; statuses: string[] };
export type CombatRequest = { id: string; sourceId: string; targetId: string; kind: 'damage' | 'heal'; amount: number };
export type CombatEvent = { id: string; label: string; targetId?: string; kind?: 'damage' | 'heal' | 'undo'; amount?: number };
export type Combat = { id: string; name: string; running: boolean; round: number; activeId: string | null; approval: boolean; participants: Participant[]; pending: CombatRequest[]; history: { targetId: string; before: number; after: number }[]; events: CombatEvent[] };
export type PublicParticipant = Omit<Participant, 'hp' | 'maxHp' | 'ac' | 'hideHp' | 'hideAc' | 'visible'> & { hp?: number; maxHp?: number; ac?: number; portrait?: Character };
export type PublicCombat = { name: string; running: boolean; round: number; activeId: string | null; participants: PublicParticipant[]; events: CombatEvent[] };
export type ScenePreset = { id:string; name:string; sceneId:string | null; characterId:string; layout:Layout; background:Layout };
export type Sound = { id:string; projectId:string; trackId:string; startedAt:number; volume:number };
export type Cue = { id:string; label:string; expiresAt:number };
export type Icons = { heart:string; shield:string };
export const defaultIcons: Icons = { heart:'/assets/heart.svg',shield:'/assets/shield.svg' };
export type Artwork = { image:string; width:number; height:number };
export type ShopItem = { id:string; name:string; description:string; notes:string; category:string; price:number; currency:'cp' | 'sp' | 'ep' | 'gp' | 'pp'; stock:number | null; visible:boolean; version:number; artwork?:Artwork };
export type Shop = { id:string; name:string; merchant:string; description:string; notes:string; hideSoldOut:boolean; pageSize:number; page:number; displayCategory:string; artwork?:Artwork; items:ShopItem[] };
export type PublicShop = Pick<Shop,'id' | 'name' | 'merchant' | 'description' | 'artwork' | 'page'> & { pages:number; total:number; items:Omit<ShopItem,'notes' | 'visible' | 'version'>[] };
export type Project = { id: string; name: string; icons:Icons; shops:Shop[]; activeShopId:string | null; dmNotes:string; presets:ScenePreset[]; cue:Cue | null; selectedCharacter: string; layout: Layout; background: Layout; folders: Folder[]; tracks: Track[]; playlists: Playlist[]; playlistId: string | null; combat: Combat | null; encounters: Combat[]; characters: Character[]; monsters: Monster[]; games: Record<string, Game>; scenes: Scene[]; sceneId: string | null };
export type Workspace = { projects: Project[]; openIds: string[]; activeId: string; liveId: string | null; sound:Sound | null; music: Music | null; revision: number };
export type PublicView = { icons?:Icons; shop?:PublicShop | null; cue?:Cue | null; character?: Character; combat?: PublicCombat | null; layout: Layout; background: Layout; projectName: string; scene: Scene | null; characterId: string; hp?: number; maxHp?: number; ac?: number };
export type Command = { id: string; type: string; projectId?: string; name?: string; characterId?: string; game?: Game; sceneId?: string; targetIndex?: number; layout?: Layout; target?: string; folderId?: string | null; playlistId?: string | null; trackId?: string; spotifyUrl?: string; position?: number; volume?: number; playing?: boolean; amount?: number; targetId?: string; participantId?: string; requestId?: string; kind?: string; approval?: boolean; participant?: Partial<Participant>; encounterId?: string; character?: Partial<Character>; monster?: Monster; monsterId?: string; text?: string; presetId?: string; shopId?: string; itemId?: string; shop?: Partial<Shop>; item?: ShopItem; visible?: boolean };
export const characters = [
  { id: 'tarkhun', name: 'Тархун', image: '/assets/tarkhun.png', width: 1024, height: 1536, caption: 'Драконорождённый · маг', subtitle: 'Пламя древнего рода' },
  { id: 'aristocrat', name: 'Хранитель древней книги', image: '/assets/aristocrat.png', width: 1024, height: 1536, caption: 'Насекомый · хранитель', subtitle: 'Укажите характеристики персонажа' },
  { id: 'paladin', name: 'Паладин', image: '/assets/paladin.png', width: 1024, height: 1536, caption: 'Воин священной клятвы', subtitle: 'Укажите характеристики персонажа' }
];
export type Character = typeof characters[number];
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
export type PlayerView = { shop?:PublicShop | null; pendingAction?: boolean; projectName: string; playerName: string; own: { characterId: string; game: Game } | null; combat?: PublicCombat | null; characters: (Character & { occupied: boolean })[] };
export type NetworkView = { enabled: boolean; address: string; port: number; url: string; interfaces: { name: string; address: string }[]; connections: { id: string; role: string; label: string; expiresAt: number; active: boolean; online: boolean; projectId?: string; characterId?: string; playerName?: string }[]; link?: string };

export function validMonster(value: unknown): value is Monster {
  if (!value || typeof value !== 'object') return false;
  const m = value as Monster;
  return typeof m.id === 'string' && /^[\w-]{1,100}$/.test(m.id) && typeof m.name === 'string' && m.name.trim().length > 0 && m.name.length <= 100 && ['2014','2024'].includes(m.edition) && Number.isSafeInteger(m.hp) && m.hp >= 1 && m.hp <= 1000000 && Number.isSafeInteger(m.ac) && m.ac >= 0 && m.ac <= 1000 && ['type','cr','speed','source','description'].every(key => typeof m[key as keyof Monster] === 'string' && (m[key as keyof Monster] as string).length <= (key === 'description' ? 100000 : 500)) && m.abilities && ['str','dex','con','int','wis','cha'].every(key => Number.isSafeInteger(m.abilities[key]) && m.abilities[key] >= 1 && m.abilities[key] <= 30);
}
