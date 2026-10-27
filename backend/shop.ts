import { randomUUID } from 'node:crypto';
import { validArtwork, validShop, validShopItem, listedItems } from '../src/shop-view.js';
import type { Command, Project, Shop, Artwork } from '../src/contracts.js';

export function makeShop(name = 'Торговая лавка', demo = false): Shop {
  return { id:randomUUID(),name,merchant:'',description:'',notes:demo ? 'Стартовые товары — пример. Проверьте цены и остатки перед игрой.' : '',hideSoldOut:false,pageSize:6,page:0,displayCategory:'',items:demo ? [
    { id:randomUUID(),name:'Зелье лечения',description:'Небольшой флакон красного зелья.',category:'Зелья',price:50,currency:'gp',stock:3,visible:true,notes:'',version:0 },
    { id:randomUUID(),name:'Верёвка',description:'Бухта прочной верёвки для путешествий.',category:'Снаряжение',price:1,currency:'gp',stock:5,visible:true,notes:'',version:0 },
    { id:randomUUID(),name:'Факел',description:'Освещает путь в тёмных подземельях.',category:'Снаряжение',price:1,currency:'cp',stock:20,visible:true,notes:'',version:0 },
    { id:randomUUID(),name:'Дорожный паёк',description:'Запас провизии на день.',category:'Припасы',price:5,currency:'sp',stock:12,visible:true,notes:'',version:0 }
  ] : [] };
}
export function shopCommand(project: Project, command: Command, artwork?: Artwork) {
  const name = (value: unknown) => { if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) throw new Error('Введите название от 1 до 100 символов'); return value.trim(); };
  if (command.type === 'shop.create') { if (project.shops.length >= 50) throw new Error('В проекте уже 50 магазинов'); project.shops.push(makeShop(name(command.name))); return; }
  const shop = project.shops.find(s => s.id === command.shopId);
  if (!shop) throw new Error('Магазин не найден');
  const item = () => { const value = shop.items.find(i => i.id === command.itemId); if (!value) throw new Error('Товар не найден'); return value; };
  switch (command.type) {
    case 'shop.update': {
      const value = command.shop; if (!value) throw new Error('Нет изменений магазина');
      for (const key of ['name','merchant','description','notes','hideSoldOut','pageSize','displayCategory'] as const) if (value[key] !== undefined) Object.assign(shop,{ [key]:value[key] });
      if (!validShop(shop)) throw new Error('Некорректные настройки магазина'); shop.name = name(shop.name); shop.page = 0; break;
    }
    case 'shop.duplicate': { if (project.shops.length >= 50) throw new Error('В проекте уже 50 магазинов'); const copy = structuredClone(shop); copy.id = randomUUID(); copy.name = `${shop.name.slice(0,90)} — копия`; for (const i of copy.items) { i.id = randomUUID(); i.version = 0; } project.shops.push(copy); break; }
    case 'shop.delete': project.shops = project.shops.filter(s => s.id !== shop.id); if (project.activeShopId === shop.id) project.activeShopId = null; break;
    case 'shop.show': project.activeShopId = shop.id; break;
    case 'shop.hide': project.activeShopId = null; break;
    case 'shop.page': {
      const pages = Math.max(1,Math.ceil(listedItems(shop).length/shop.pageSize)); if (!Number.isSafeInteger(command.targetIndex) || command.targetIndex! < 0 || command.targetIndex! >= pages) throw new Error('Страница магазина не найдена'); shop.page = command.targetIndex!; break;
    }
    case 'shop.item.save': {
      const value = structuredClone(command.item); if (!value || !validShopItem(value)) throw new Error('Проверьте название, цену, валюту и остаток товара');
      const index = shop.items.findIndex(i => i.id === value.id);
      if (index < 0) { if (shop.items.length >= 1000) throw new Error('В магазине уже 1000 товаров'); delete value.artwork; value.version = 0; shop.items.push(value); }
      else { if (value.version !== shop.items[index].version) throw new Error('Товар изменён в другом окне. Откройте его заново перед сохранением'); value.artwork = shop.items[index].artwork; value.version++; shop.items[index] = value; }
      break;
    }
    case 'shop.item.delete': { const value = item(); shop.items = shop.items.filter(i => i.id !== value.id); break; }
    case 'shop.item.visible': { const value = item(); if (typeof command.visible !== 'boolean') throw new Error('Некорректная видимость'); value.visible = command.visible; value.version++; break; }
    case 'shop.stock': {
      const value = item(); if (value.stock === null) throw new Error('У этого товара неограниченный запас');
      if (!Number.isSafeInteger(command.amount) || Math.abs(command.amount!) > 1000000 || !command.amount || value.stock + command.amount! < 0 || value.stock + command.amount! > 1000000) throw new Error('Некорректное изменение остатка');
      value.stock += command.amount!; value.version++; break;
    }
    case 'shop.artwork': if (!artwork || !validArtwork(artwork)) throw new Error('Изображение не загружено'); if (command.itemId) { const value = item(); value.artwork = artwork; value.version++; } else shop.artwork = artwork; break;
    default: throw new Error('Неизвестная команда магазина');
  }
  shop.page = Math.min(shop.page,Math.max(0,Math.ceil(listedItems(shop).length/shop.pageSize)-1));
}
