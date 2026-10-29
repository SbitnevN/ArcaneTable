import type { Project, PublicShop, Shop, ShopItem } from './contracts.js';

export const currencies = { cp:'мм', sp:'см', ep:'эм', gp:'зм', pp:'пм' } as const;
export function listedItems(shop: Shop): ShopItem[] { return shop.items.filter(item => item.visible && (!shop.hideSoldOut || item.stock !== 0) && (!shop.displayCategory || item.category === shop.displayCategory)); }
// allItems: the player's phone lists the whole assortment, the shared screen shows one page at a time.
export function publicShop(project: Project, shopId = project.activeShopId, allItems = false): PublicShop | null {
  const shop = project.shops.find(s => s.id === shopId);
  if (!shop) return null;
  const items = listedItems(shop);
  const pages = Math.max(1,Math.ceil(items.length/shop.pageSize)); const page = Math.min(shop.page,pages-1);
  return { id:shop.id,name:shop.name,merchant:shop.merchant,description:shop.description,...(shop.artwork ? { artwork:shop.artwork } : {}),page,pages,total:items.length,items:(allItems ? items : items.slice(page*shop.pageSize,(page+1)*shop.pageSize)).map(item => ({ id:item.id,name:item.name,description:item.description,category:item.category,price:item.price,currency:item.currency,stock:item.stock,...(item.artwork ? { artwork:item.artwork } : {}),...(item.icon ? { icon:item.icon } : {}),...(item.rarity ? { rarity:item.rarity } : {}) })) };
}
export function validArtwork(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const art = value as { image:string; width:number; height:number };
  return typeof art.image === 'string' && /^\/media\/[a-f0-9-]+\.(png|jpg|webp)$/.test(art.image) && Number.isSafeInteger(art.width) && Number.isSafeInteger(art.height) && art.width > 0 && art.height > 0 && art.width*art.height <= 64000000;
}
export function validShopItem(value: unknown): value is ShopItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as ShopItem;
  return typeof item.id === 'string' && /^[\w-]{1,100}$/.test(item.id) && typeof item.name === 'string' && item.name.trim().length > 0 && item.name.length <= 100 && typeof item.description === 'string' && item.description.length <= 3000 && typeof item.notes === 'string' && item.notes.length <= 10000 && typeof item.category === 'string' && item.category.length <= 100 && Number.isFinite(item.price) && item.price >= 0 && item.price <= 1000000000 && Math.abs(item.price*100-Math.round(item.price*100)) < .0001 && Object.hasOwn(currencies,item.currency) && (item.stock === null || Number.isSafeInteger(item.stock) && item.stock >= 0 && item.stock <= 1000000) && typeof item.visible === 'boolean' && Number.isSafeInteger(item.version) && item.version >= 0 && (!item.artwork || validArtwork(item.artwork)) && (item.icon === undefined || typeof item.icon === 'string' && /^[a-z-]{1,40}$/.test(item.icon)) && (item.rarity === undefined || ['mundane','common','uncommon','rare','very-rare','legendary','artifact'].includes(item.rarity)) && (item.sourceId === undefined || typeof item.sourceId === 'string' && /^[\w-]{1,100}$/.test(item.sourceId));
}
export function validShop(value: unknown): value is Shop {
  if (!value || typeof value !== 'object') return false;
  const shop = value as Shop;
  return typeof shop.id === 'string' && /^[\w-]{1,100}$/.test(shop.id) && typeof shop.name === 'string' && shop.name.trim().length > 0 && shop.name.length <= 100 && typeof shop.merchant === 'string' && shop.merchant.length <= 100 && typeof shop.description === 'string' && shop.description.length <= 3000 && typeof shop.notes === 'string' && shop.notes.length <= 10000 && typeof shop.hideSoldOut === 'boolean' && [6,8,12].includes(shop.pageSize) && Number.isSafeInteger(shop.page) && shop.page >= 0 && typeof shop.displayCategory === 'string' && shop.displayCategory.length <= 100 && Array.isArray(shop.items) && shop.items.length <= 1000 && shop.items.every(validShopItem) && new Set(shop.items.map(i => i.id)).size === shop.items.length && (!shop.artwork || validArtwork(shop.artwork));
}
// Coins in copper pieces: 1 sp = 10 cp, 1 ep = 50 cp, 1 gp = 100 cp, 1 pp = 1000 cp.
export type Coins = Partial<Record<keyof typeof currencies, number>>;
export const coinValue = { cp:1, sp:10, ep:50, gp:100, pp:1000 } as const;
export const coinTotal = (coins: Coins = {}) => (Object.keys(coinValue) as (keyof typeof coinValue)[]).reduce((sum, key) => sum + (coins[key] || 0) * coinValue[key], 0);
export const priceInCopper = (price: number, currency: keyof typeof coinValue, amount = 1) => Math.round(price * coinValue[currency] * amount);
// Pays a price from a purse: keeps as many of the hero's own coins as possible and gives change in gold, silver and copper.
export function payCoins(coins: Coins = {}, cost: number): Coins | null {
  let left = coinTotal(coins) - cost;
  if (cost < 0 || left < 0) return null;
  const result: Coins = {};
  for (const key of ['pp', 'gp', 'ep', 'sp', 'cp'] as const) { const keep = Math.min(coins[key] || 0, Math.floor(left / coinValue[key])); result[key] = keep; left -= keep * coinValue[key]; }
  for (const key of ['gp', 'sp', 'cp'] as const) { const change = Math.floor(left / coinValue[key]); result[key] = (result[key] || 0) + change; left -= change * coinValue[key]; }
  return result;
}
