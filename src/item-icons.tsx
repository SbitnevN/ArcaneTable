import React from 'react';
import type { ItemKind } from './contracts';
import { itemKindLabels } from './library';

// Default artwork for items without an uploaded picture: one stroke style, soft tinted fills, currentColor.
const shapes: Record<string, React.ReactNode> = {
  sword: <><path d="M44 8h12v12L27 49l-12-12L44 8Z" className="fill"/><path d="M44 8h12v12L27 49l-12-12L44 8ZM50 14 22 42"/><path d="m13 39 12 12M17 47l-7 7M8 52l4 4"/></>,
  axe: <><path d="M14 54 42 26"/><path d="M36 12c8-4 16 0 18 8l-14 14c-8-2-12-10-8-18Z" className="fill"/><path d="M36 12c8-4 16 0 18 8l-14 14c-8-2-12-10-8-18Z"/><path d="m31 21 12 12"/></>,
  bow: <><path d="M14 8c22 4 38 20 42 42" /><path d="M14 8c-2 8 2 16 8 20M56 50c-8 2-16-2-20-8"/><path d="M14 8l42 42" strokeDasharray="2 3"/><path d="M8 40 38 10M38 10h-7M38 10v7M8 40l4 6M8 40l6 4"/></>,
  armor: <><path d="M20 10h24l8 8-4 8v26H16V26l-4-8 8-8Z" className="fill"/><path d="M20 10h24l8 8-4 8v26H16V26l-4-8 8-8Z"/><path d="M26 10c0 5 3 8 6 8s6-3 6-8M32 18v34M22 32h20M22 42h20"/></>,
  shield: <><path d="M32 6 52 13v15c0 13-8 22-20 28C20 50 12 41 12 28V13L32 6Z" className="fill"/><path d="M32 6 52 13v15c0 13-8 22-20 28C20 50 12 41 12 28V13L32 6Z"/><path d="M32 14v34M20 26h24"/></>,
  helmet: <><path d="M12 38c0-14 9-26 20-26s20 12 20 26v8H12v-8Z" className="fill"/><path d="M12 38c0-14 9-26 20-26s20 12 20 26v8H12v-8Z"/><path d="M12 36h40M30 36v10h4V36M32 12v8"/></>,
  potion: <><path d="M26 8h12M28 8v12C18 24 12 31 12 40a20 20 0 0 0 40 0c0-9-6-16-16-20V8"/><path d="M14 40c6-4 12 4 18 0s12-4 18 0a18 18 0 0 1-36 0Z" className="fill"/><circle cx="25" cy="44" r="2"/><circle cx="36" cy="50" r="1.5"/></>,
  vial: <><path d="M24 6h16M27 6v34a5 5 0 0 0 10 0V6"/><path d="M27 24h10v16a5 5 0 0 1-10 0V24Z" className="fill"/><path d="M14 50c6 4 30 4 36 0" strokeDasharray="3 4"/></>,
  scroll: <><path d="M18 12h30a6 6 0 0 1 0 12H18" className="fill"/><path d="M14 18a6 6 0 0 1 12 0v32a6 6 0 0 1-12 0V18ZM20 12h28a6 6 0 0 1 0 12h-4M26 50h24V24"/><path d="M32 32h12M32 40h9"/></>,
  book: <><path d="M12 12h18c3 0 2 4 2 4v38s0-4-4-4H12V12ZM52 12H34c-3 0-2 4-2 4v38s0-4 4-4h16V12Z" className="fill"/><path d="M12 12h18c3 0 2 4 2 4v38s0-4-4-4H12V12ZM52 12H34c-3 0-2 4-2 4v38s0-4 4-4h16V12Z"/><path d="m42 22 3 5-3 5-3-5 3-5Z"/></>,
  ring: <><circle cx="32" cy="38" r="16"/><circle cx="32" cy="38" r="11"/><path d="M26 16l6-8 6 8-6 6-6-6Z" className="fill"/><path d="M26 16l6-8 6 8-6 6-6-6Z"/></>,
  amulet: <><path d="M14 8c0 14 8 22 18 24 10-2 18-10 18-24"/><path d="M32 30l12 12-12 14-12-14 12-12Z" className="fill"/><path d="M32 30l12 12-12 14-12-14 12-12ZM20 42h24M32 30v26"/></>,
  wand: <><path d="M12 52 40 24"/><path d="m36 20 8 8"/><path d="M46 8v6M46 22v6M36 18h-6M58 18h-6M40 12l-3-3M52 24l3 3M52 12l3-3"/><circle cx="46" cy="18" r="3" className="fill"/></>,
  staff: <><path d="M22 58 40 18"/><circle cx="44" cy="12" r="7" className="fill"/><circle cx="44" cy="12" r="7"/><path d="M36 22c-4-3-4-9 0-12M52 22c4-3 4-9 0-12"/></>,
  gem: <><path d="M20 10h24l12 14-24 30L8 24l12-14Z" className="fill"/><path d="M20 10h24l12 14-24 30L8 24l12-14ZM8 24h48M20 10l6 14 6 30 6-30 6-14M26 24l6-14 6 14"/></>,
  cloak: <><path d="M22 8h20l4 10 8 38H10l8-38 4-10Z" className="fill"/><path d="M22 8h20l4 10 8 38H10l8-38 4-10ZM26 8c0 6 3 10 6 10s6-4 6-10M32 18v38"/></>,
  ammo: <><path d="M14 54 46 22M24 54 52 26M14 44 42 16"/><path d="m46 22 8-10-10 4M52 26l6-8-8 2M42 16l6-10-10 4" className="fill"/><path d="M10 50l8 8M20 50l8 8M10 40l8 8"/></>,
  tools: <><path d="M12 52 34 30"/><path d="M30 18a10 10 0 0 0 14 14l10-10-6-6-6 6-4-4 6-6-6-6-8 12Z" className="fill"/><path d="M30 18a10 10 0 0 0 14 14l10-10-6-6-6 6-4-4 6-6-6-6-8 12Z"/><path d="M10 54l4 4 6-2-8-8-2 6Z"/></>,
  backpack: <><path d="M16 24a16 16 0 0 1 32 0v30H16V24Z" className="fill"/><path d="M16 24a16 16 0 0 1 32 0v30H16V24ZM24 8h16v6M22 36h20v12H22zM32 36v4"/></>,
  rope: <><circle cx="32" cy="30" r="18"/><circle cx="32" cy="30" r="11"/><circle cx="32" cy="30" r="4" className="fill"/><path d="M44 44c4 4 4 10 0 12"/></>,
  torch: <><path d="M26 30h12l-4 28h-4l-4-28Z" className="fill"/><path d="M26 30h12l-4 28h-4l-4-28Z"/><path d="M32 6c8 8 8 16 0 22-8-6-8-14 0-22Z" className="fill"/><path d="M32 6c8 8 8 16 0 22-8-6-8-14 0-22ZM32 16c3 3 3 7 0 10"/></>,
  lantern: <><path d="M22 18h20l4 6v24l-4 6H22l-4-6V24l4-6Z" className="fill"/><path d="M22 18h20l4 6v24l-4 6H22l-4-6V24l4-6ZM26 18v-6h12v6M32 6v6M32 30c4 3 4 9 0 12-4-3-4-9 0-12Z"/></>,
  food: <><path d="M10 38c0-12 10-20 22-20s22 8 22 20c0 6-4 10-10 10H20c-6 0-10-4-10-10Z" className="fill"/><path d="M10 38c0-12 10-20 22-20s22 8 22 20c0 6-4 10-10 10H20c-6 0-10-4-10-10ZM22 28l4 6M32 24v8M42 28l-4 6"/></>,
  flask: <><path d="M20 12h24M22 12v6c-6 2-10 8-10 16v14a6 6 0 0 0 6 6h28a6 6 0 0 0 6-6V34c0-8-4-14-10-16v-6"/><path d="M14 38h36v10a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6V38Z" className="fill"/></>,
  coins: <><ellipse cx="26" cy="22" rx="14" ry="6" className="fill"/><ellipse cx="26" cy="22" rx="14" ry="6"/><path d="M12 22v8c0 3 6 6 14 6s14-3 14-6v-8"/><ellipse cx="40" cy="40" rx="14" ry="6" className="fill"/><ellipse cx="40" cy="40" rx="14" ry="6"/><path d="M26 40v8c0 3 6 6 14 6s14-3 14-6v-8"/></>,
  chest: <><path d="M10 28h44v24H10z" className="fill"/><path d="M10 28c0-10 6-16 22-16s22 6 22 16M10 28h44v24H10zM10 36h44M28 32h8v10h-8z"/></>,
  key: <><circle cx="20" cy="22" r="10" className="fill"/><circle cx="20" cy="22" r="10"/><circle cx="20" cy="22" r="3"/><path d="m27 29 25 25M42 44l6-6M48 50l5-5"/></>,
  map: <><path d="m10 16 14-6 16 6 14-6v38l-14 6-16-6-14 6V16Z" className="fill"/><path d="m10 16 14-6 16 6 14-6v38l-14 6-16-6-14 6V16ZM24 10v38M40 16v38"/><path d="m30 28 4 4m0-4-4 4" /></>,
  bag: <><path d="M22 18c-8 6-12 16-12 24 0 8 8 14 22 14s22-6 22-14c0-8-4-18-12-24" className="fill"/><path d="M22 18c-8 6-12 16-12 24 0 8 8 14 22 14s22-6 22-14c0-8-4-18-12-24M22 18h20l-4-10H26l-4 10ZM20 18h24"/></>
};
// Painted icons from public/assets/items; names without a picture fall back to the stroke shapes above.
const painted = ['sword', 'axe', 'bow', 'dagger', 'crossbow', 'mace', 'armor', 'shield', 'helmet', 'cloak', 'boots', 'gloves', 'potion', 'vial', 'flask', 'scroll', 'book', 'orb', 'ring', 'amulet', 'wand', 'staff', 'gem', 'crown', 'ammo', 'tools', 'backpack', 'rope', 'torch', 'lantern', 'food', 'bag', 'coins', 'chest', 'mug', 'meat', 'key', 'map', 'clothes', 'bedroll', 'waterskin', 'tinderbox', 'gaming', 'instrument', 'holy-symbol', 'quiver', 'collar', 'manacles', 'ember', 'keyring', 'pickaxe', 'shiv', 'blanket', 'bottle', 'letter', 'ticket'];
// Bumped whenever the painted set is redrawn, so browsers and Electron do not keep showing cached old pictures.
const artVersion = 5;
export const itemIcons = [...painted, ...Object.keys(shapes).filter(name => !painted.includes(name))];
export const kindIcons: Record<ItemKind | 'weapon', string> = { weapon: 'sword', armor: 'armor', potion: 'potion', scroll: 'scroll', ring: 'ring', wand: 'wand', wondrous: 'gem', ammo: 'ammo', tool: 'tools', gear: 'backpack', food: 'meat', treasure: 'coins' };
export const kindLabels = itemKindLabels;
const categoryHints: [RegExp, string][] = [[/ошейник/i, 'collar'], [/кандал|оков|цеп[ьи]/i, 'manacles'], [/уголёк|уголек|угольк/i, 'ember'], [/связк[аи] ключ/i, 'keyring'], [/кирк/i, 'pickaxe'], [/заточк/i, 'shiv'], [/одеял|шкур/i, 'blanket'], [/бутыл|самогон|настойк/i, 'bottle'], [/письм|документ|приговор|донесени|записк/i, 'letter'], [/билет|проездн/i, 'ticket'], [/колчан/i, 'quiver'], [/одежд|костюм|камзол|наряд|мантия|роба/i, 'clothes'], [/спальн|одеял/i, 'bedroll'], [/бурдюк|фляг/i, 'waterskin'], [/трутниц|огнив|кресал/i, 'tinderbox'], [/шахмат|игральн|игров|кости|карты/i, 'gaming'], [/лютн|флейт|лира|волынк|барабан|рожок|скрипк|музык/i, 'instrument'], [/святой символ|священн|реликвар/i, 'holy-symbol'], [/верёв|веревк|канат/i, 'rope'], [/факел/i, 'torch'], [/фонар/i, 'lantern'], [/ключ|отмычк/i, 'key'], [/карта/i, 'map'], [/паёк|паек|хлеб|сыр/i, 'food'], [/сундук/i, 'chest'], [/рюкзак|набор путеш/i, 'backpack'], [/плащ/i, 'cloak'], [/кольц/i, 'ring'], [/кинжал|нож/i, 'dagger'], [/арбалет/i, 'crossbow'], [/булав|молот/i, 'mace'], [/сапог|обув/i, 'boots'], [/перчат|рукав/i, 'gloves'], [/шлем/i, 'helmet'], [/корон/i, 'crown'], [/сфер|шар/i, 'orb'], [/напит|эль|пиво|вино|кружк/i, 'mug'], [/мясо|колбас/i, 'meat'], [/оруж|меч|клин/i, 'sword'], [/доспех|брон/i, 'armor'], [/щит/i, 'shield'], [/зель|эликсир/i, 'potion'], [/свит/i, 'scroll'], [/книг/i, 'book'], [/кольц/i, 'ring'], [/амулет|ожерел/i, 'amulet'], [/жезл|палоч/i, 'wand'], [/посох/i, 'staff'], [/чудес|артефакт|магич/i, 'gem'], [/боепр|стрел|болт/i, 'ammo'], [/инструм/i, 'tools'], [/еда|припас|провиз/i, 'meat'], [/сокров|монет|драгоц/i, 'coins'], [/снаряж/i, 'backpack']];
// Shop items made by hand only have a free-text category: pick the closest default icon from it.
export function iconFor(icon: string | undefined, category = '', name = '') {
  if (icon && (shapes[icon] || painted.includes(icon))) return icon;
  return categoryHints.find(([pattern]) => pattern.test(name))?.[1] || categoryHints.find(([pattern]) => pattern.test(category))?.[1] || 'bag';
}
export function ItemIcon({ name, className }: { name: string; className?: string }) {
  if (painted.includes(name)) return <img className={className ? `item-icon painted ${className}` : 'item-icon painted'} src={`/assets/items/${name}.png?v=${artVersion}`} alt="" draggable={false}/>;
  return <svg className={className ? `item-icon ${className}` : 'item-icon'} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name] || shapes.bag}</svg>;
}
