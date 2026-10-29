// Arcane Table MCP server: lets an AI assistant work as the master's D&D helper inside the running app.
// Talks to the app's local HTTP API with the key the app writes to agent.json on start (removed on exit).
// Protocol: JSON-RPC 2.0 over stdio, one message per line (Model Context Protocol).
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const build = file => pathToFileURL(join(root, 'build-desktop', 'src', file)).href;
const { characterJsonPrompt, exportCharacterJson, parseSpellJson } = await import(build('character-import.js'));
const { itemJsonPrompt, parseItemJson } = await import(build('item-import.js'));

// The installed app first, then the dev server (npm run dev) as a fallback; ARCANE_AGENT_FILE overrides both.
const agentFiles = [process.env.ARCANE_AGENT_FILE, process.env.APPDATA && join(process.env.APPDATA, 'arcane-table', 'agent.json'), join(root, '.arcane-data', 'agent.json')].filter(Boolean);
function agent() {
  for (const file of agentFiles) if (existsSync(file)) {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    if (value.pid) { try { process.kill(value.pid, 0); } catch { continue; } }
    return value;
  }
  throw new Error('Arcane Table не запущен: откройте приложение (или npm run dev) и повторите.');
}
async function api(path, options = {}) {
  const { origin, token } = agent();
  const response = await fetch(origin + path, { ...options, headers: { Authorization: `Bearer ${token}`, Origin: origin, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Ошибка ${response.status}`);
  return data;
}
const command = (type, extra = {}) => api('/api/command', { method: 'POST', body: JSON.stringify({ id: randomUUID(), type, ...extra }) });
const parse = value => typeof value === 'string' ? JSON.parse(value.replace(/^\s*```(?:json)?|```\s*$/g, '')) : value;

async function project(projectId) {
  const state = await api('/api/state');
  const found = projectId ? state.projects.find(item => item.id === projectId || item.name.toLowerCase() === String(projectId).toLowerCase()) : state.projects.find(item => item.id === state.activeId);
  if (!found) throw new Error(`Кампания не найдена. Есть: ${state.projects.map(item => `«${item.name}»`).join(', ')}`);
  return { state, project: found };
}
function hero(project, character) {
  const key = String(character || '').toLowerCase();
  const found = project.characters.find(item => item.id === character || item.name.toLowerCase() === key) || project.characters.find(item => item.name.toLowerCase().includes(key));
  if (!found) throw new Error(`Герой не найден в «${project.name}». Есть: ${project.characters.map(item => item.name).join(', ')}`);
  return found;
}
const summary = (project, item) => { const game = project.games[item.id]; return { id: item.id, name: item.name, class: game.className || '', race: game.race || '', level: game.level || 1, hp: `${game.hp}/${game.maxHp}`, ac: game.ac, items: (game.items || []).length, spells: (game.spells || []).length + (game.spellBook || []).length }; };

const projectArg = { type: 'string', description: 'Кампания: id или название. По умолчанию — активная.' };
const characterArg = { type: 'string', description: 'Герой: id или имя (можно часть имени).' };
const tools = [
  { name: 'campaigns', description: 'Кампании Arcane Table: герои (класс, уровень, хиты, КД), число предметов, заклинаний и лавок. Начинайте с этого.', inputSchema: { type: 'object', properties: {} },
    run: async () => { const state = await api('/api/state'); return state.projects.map(item => ({ id: item.id, name: item.name, edition: item.edition, active: item.id === state.activeId, live: item.id === state.liveId, heroes: item.characters.map(entry => summary(item, entry)), library: { items: (item.items || []).length, weapons: (item.weapons || []).length, spells: (item.spells || []).length }, shops: item.shops.map(shop => `${shop.name} (${shop.items.length})`) })); } },
  { name: 'format_guide', description: 'Форматы JSON приложения: персонаж (arcane-character, с ячейками, своими заклинаниями и эффектами предметов) и предметы. Прочитайте перед созданием персонажей и предметов.', inputSchema: { type: 'object', properties: {} },
    run: async () => `ПЕРСОНАЖ\n${characterJsonPrompt}\n\nПРЕДМЕТЫ\n${itemJsonPrompt}` },
  { name: 'character_get', description: 'Полный лист героя в формате arcane-character: характеристики, навыки, атаки, умения, заклинания, ячейки, предметы с эффектами, заметки.', inputSchema: { type: 'object', properties: { project: projectArg, character: characterArg }, required: ['character'] },
    run: async ({ project: projectId, character }) => { const { project: found } = await project(projectId); const item = hero(found, character); return JSON.parse(exportCharacterJson(item, found.games[item.id], { items: found.items || [], weapons: found.weapons || [] }, found.spells || [])); } },
  { name: 'character_import', description: 'Создаёт героя из JSON arcane-character (или файла Long Story Short). С replace заменяет лист существующего героя на месте: портрет и ссылки игроков сохраняются. Магические предметы и заклинания не из SRD попадают в библиотеку кампании.', inputSchema: { type: 'object', properties: { project: projectArg, json: { description: 'Персонаж: объект или JSON-строка' }, replace: { type: 'string', description: 'Заменить этого героя (id или имя) вместо создания нового' } }, required: ['json'] },
    run: async ({ project: projectId, json, replace }) => {
      const { project: found } = await project(projectId);
      const target = replace ? hero(found, replace) : null;
      const result = await api(`/api/character/import?projectId=${found.id}${target ? `&replace=${target.id}` : ''}`, { method: 'POST', body: JSON.stringify(parse(json)) });
      const updated = result.state.projects.find(item => item.id === found.id);
      return { done: target ? `Лист «${target.name}» заменён` : 'Герой создан', hero: summary(updated, updated.characters.find(item => item.id === updated.selectedCharacter)), warnings: result.warnings };
    } },
  { name: 'character_patch', description: 'Точечная правка листа героя без полной замены: hp, maxHp, ac, level, coins, spellSlots, speed и т. п. (поля листа Arcane Table). Например { "hp": 12 } после боя или { "coins": { "gp": 40 } }.', inputSchema: { type: 'object', properties: { project: projectArg, character: characterArg, patch: { type: 'object', description: 'Поля листа для замены' } }, required: ['character', 'patch'] },
    run: async ({ project: projectId, character, patch }) => {
      const { project: found } = await project(projectId); const item = hero(found, character);
      const allowed = ['hp', 'maxHp', 'ac', 'level', 'speed', 'initiative', 'race', 'className', 'abilities', 'saves', 'skills', 'coins', 'spellSlots', 'spells', 'spellBook', 'inventory'];
      const extra = Object.keys(patch).filter(key => !allowed.includes(key)); if (extra.length) throw new Error(`Эти поля правьте через character_import: ${extra.join(', ')}`);
      await command('character.update', { projectId: found.id, characterId: item.id, game: { ...found.games[item.id], ...patch } });
      return { done: `Лист «${item.name}» обновлён`, changed: Object.keys(patch) };
    } },
  { name: 'items_add', description: 'Добавляет предметы и оружие в библиотеку кампании (формат предметов из format_guide, с эффектами).', inputSchema: { type: 'object', properties: { project: projectArg, items: { description: 'Массив предметов или JSON-строка' } }, required: ['items'] },
    run: async ({ project: projectId, items }) => {
      const { project: found } = await project(projectId); const result = parseItemJson(parse(items), 'запрос');
      if (!result.items.length && !result.weapons.length) throw new Error(result.errors.join('; ') || 'Нет предметов');
      await command('library.import', { projectId: found.id, libraryItems: result.items, weapons: result.weapons });
      return { added: [...result.items, ...result.weapons].map(item => item.name), errors: result.errors };
    } },
  { name: 'spells_add', description: 'Добавляет заклинания в «Мои заклинания» кампании — для тех, которых нет в SRD (поля как homebrewSpells в format_guide).', inputSchema: { type: 'object', properties: { project: projectArg, spells: { description: 'Массив заклинаний или JSON-строка' } }, required: ['spells'] },
    run: async ({ project: projectId, spells }) => {
      const { project: found } = await project(projectId); const { spells: parsed, warnings } = parseSpellJson(parse(spells), found.edition || '2024');
      const fresh = parsed.filter(spell => !(found.spells || []).some(own => own.name.toLowerCase() === spell.name.toLowerCase()));
      for (const spell of fresh) await command('spell.save', { projectId: found.id, spell });
      return { added: fresh.map(spell => spell.name), skipped: parsed.filter(spell => !fresh.includes(spell)).map(spell => `${spell.name} (уже есть)`), warnings };
    } }
];

// --- JSON-RPC over stdio ---
const send = message => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
async function handle(message) {
  const { id, method, params = {} } = message;
  if (method === 'initialize') return send({ id, result: { protocolVersion: params.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'arcane-table', version: '1.0.0' }, instructions: 'Помощник мастера D&D в приложении Arcane Table. Начните с campaigns, перед созданием персонажей прочитайте format_guide. Пишите по-русски.' } });
  if (method === 'ping') return send({ id, result: {} });
  if (method === 'tools/list') return send({ id, result: { tools: tools.map(({ run: _run, ...tool }) => tool) } });
  if (method === 'tools/call') {
    const tool = tools.find(item => item.name === params.name);
    if (!tool) return send({ id, error: { code: -32602, message: `Нет инструмента ${params.name}` } });
    try { const value = await tool.run(params.arguments || {}); return send({ id, result: { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] } }); }
    catch (error) { return send({ id, result: { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true } }); }
  }
  if (id !== undefined) send({ id, error: { code: -32601, message: `Метод не поддерживается: ${method}` } });
}
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk; let index;
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index).trim(); buffer = buffer.slice(index + 1);
    if (!line) continue;
    let message; try { message = JSON.parse(line); } catch { send({ id: null, error: { code: -32700, message: 'Parse error' } }); continue; }
    void handle(message);
  }
});
