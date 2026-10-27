import { publicShop } from '../src/shop-view.js';
import { writeProjectArchive, readProjectArchive, byteLimit } from './archive.js';
import { pipeline } from 'node:stream/promises';
import { createWriteStream, statSync as fileStat } from 'node:fs';
import { importLss, exportLss } from './lss.js';
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { networkInterfaces } from 'node:os';
import { publicCombat } from './combat.js';
import { imageSize } from 'image-size';
import { Access, type Identity } from './access.js';
import { characters } from '../src/contracts.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { createReadStream, statSync } from 'node:fs';
import { join, resolve, extname, sep } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { Store } from './store.js';
import type { PublicView, Command } from '../src/contracts.js';

const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' ws:; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
export async function createService(directory: string, options: { staticRoot?: string; desktop?: { state: () => { monitors: { id: number; label: string }[]; monitorId: number; fullscreen: boolean }; open: (monitorId: number, fullscreen?: boolean) => Promise<void> } } = {}) {
  const store = await Store.open(directory);
  const master = randomBytes(32).toString('hex');
  const display = randomBytes(32).toString('hex');
  const uploads = join(directory, 'media');
  mkdirSync(uploads, { recursive: true });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  const accessStore = new Access(directory);
  const roles = new Map<WebSocket, { identity: Identity; port?: number }>();
  let lan: Server | null = null; let lanAddress = ''; let lanPort = 0;
  const local = (request: IncomingMessage) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress || '');
  const interfaces = () => Object.entries(networkInterfaces()).flatMap(([name, addresses]) => (addresses || []).filter(address => address.family === 'IPv4' && !address.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address.address)).map(address => ({ name, address: address.address })));
  const validHost = (request: IncomingMessage) => {
    const host = request.headers.host || '';
    const port = request.socket.localPort;
    return /^(127\.0\.0\.1|localhost):\d+$/.test(host) && (!port || Number(host.split(':')[1]) === port) || Boolean(lan && host === `${lanAddress}:${lanPort}`);
  };
  const bootExpiry = Date.now() + 24 * 3600000;
  function identify(request: IncomingMessage, explicit?: string | null): Identity | null {
    const bearer = request.headers.authorization;
    const token = explicit || (bearer ? /^Bearer ([a-f0-9]{64})$/.exec(bearer)?.[1] : undefined);
    const resolveToken = (value?: string | null): Identity | null => value === master && local(request) ? { id: 'root', role: 'master', root: true } : value === display && bootExpiry > Date.now() ? { id: 'display-window', role: 'display' } : accessStore.resolve(value);
    if (explicit || bearer) return resolveToken(token);
    for (const name of ['arcane', 'arcane_player', 'arcane_display']) {
      const value = new RegExp(`(?:^|;\\s*)${name}=([a-f0-9]{64})(?:;|$)`).exec(request.headers.cookie || '')?.[1];
      const identity = resolveToken(value); if (identity) return identity;
    }
    return null;
  }
  function validIdentity(identity: Identity) { return identity.root || identity.id === 'display-window' && bootExpiry > Date.now() || Boolean(accessStore.find(identity.id)); }
  function playerView(identity: Identity) {
    const grant = accessStore.find(identity.id);
    const project = store.state().projects.find(item => item.id === grant?.projectId);
    if (!grant || !project) throw new Error('Проект игрока больше недоступен');
    const own = grant.characterId && project.games[grant.characterId] ? { characterId: grant.characterId, game: project.games[grant.characterId] } : null;
    return { shop: store.state().liveId === project.id ? publicShop(project) : null, pendingAction: Boolean(project.combat?.pending.some(request => project.combat?.participants.find(item => item.id === request.sourceId)?.characterId === grant.characterId)), combat: publicCombat(project), projectName: project.name, playerName: grant.playerName || '', own, characters: project.characters.filter(character => project.games[character.id]).map(character => ({ ...character, occupied: accessStore.occupied(project.id, character.id, identity.id) })) };
  }
  function publicMedia(view: PublicView | null, path: string) {
    return view?.icons?.heart === path || view?.icons?.shield === path || view?.scene?.url === path || view?.character?.image === path || view?.combat?.participants.some(p => p.portrait?.image === path) || view?.shop?.artwork?.image === path || view?.shop?.items.some(i => i.artwork?.image === path);
  }
  function mediaAllowed(identity: Identity, path: string) {
    const state = store.state();
    if (identity.role === 'master') return state.projects.some(p => Object.values(p.icons).includes(path) || p.scenes.some(s => s.url === path) || p.tracks.some(t => t.url === path) || p.characters.some(c => c.image === path) || p.monsters.some(m => m.portrait?.image === path) || [p.combat,...p.encounters].some(c => c?.participants.some(v => v.portrait?.image === path)) || p.shops.some(s => s.artwork?.image === path || s.items.some(i => i.artwork?.image === path)));
    if (identity.role === 'player') {
      const project = state.projects.find(p => p.id === accessStore.find(identity.id)?.projectId);
      return project?.characters.some(c => c.image === path) || project?.id === state.liveId && publicMedia(store.publicView(),path);
    }
    return publicMedia(store.publicView(),path);
  }
  function networkView() {
    return { enabled: Boolean(lan), address: lanAddress, port: lanPort, url: lan ? `http://${lanAddress}:${lanPort}` : '', interfaces: interfaces(), connections: accessStore.list().map(record => ({ ...record, online: [...roles.values()].some(client => client.identity.id === record.id) })) };
  }
  async function stopLan() {
    if (!lan) return;
    for (const [socket, client] of roles) if (client.port === lanPort) { socket.terminate(); roles.delete(socket); }
    const server = lan; lan = null; lanAddress = ''; lanPort = 0;
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
  function staticPage(request: IncomingMessage, response: ServerResponse) {
    try {
      if (!validHost(request) || !options.staticRoot) { response.writeHead(404); response.end(); return; }
      const base = resolve(options.staticRoot);
      const pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
      const filename = resolve(base, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!filename.startsWith(base + sep)) throw new Error('Invalid path');
      const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
      response.writeHead(200, { 'Content-Type': mime[extname(filename)] || 'application/octet-stream', 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); response.end(readFileSync(filename));
    } catch { response.writeHead(404); response.end(); }
  }
  function send(response: ServerResponse, status: number, body: unknown) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(JSON.stringify(body));
  }
  function broadcast() {
    for (const [socket, client] of roles) if (socket.readyState === WebSocket.OPEN) {
      if (!validIdentity(client.identity)) { socket.close(1008, 'Access expired or revoked'); roles.delete(socket); continue; }
      try {
        socket.send(JSON.stringify(client.identity.role === 'master' ? { type: 'changed', revision: store.state().revision } : client.identity.role === 'player' ? { type: 'player', view: playerView(client.identity) } : { type: 'display', view: store.publicView() }));
      } catch { socket.close(1008, 'Project unavailable'); }
    }
  }
  const expiryTimer = setInterval(broadcast, 30000); expiryTimer.unref();
  async function body(request: IncomingMessage, limit: number): Promise<Buffer> {
    const chunks: Buffer[] = []; let length = 0;
    for await (const chunk of request) {
      length += chunk.length;
      if (length > limit) throw new Error('Превышен допустимый размер файла или команды');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  async function handle(request: IncomingMessage, response: ServerResponse, next: () => void) {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/media/')) { next(); return; }
    const host = request.headers.host || '';
    if (!validHost(request)) { send(response, 403, { error: 'Доступ разрешён только с этого компьютера' }); return; }
    const origin = `http://${host}`;
    if (request.headers.origin && request.headers.origin !== origin) { send(response, 403, { error: 'Недопустимый источник запроса' }); return; }
    try {
      if (url.pathname === '/api/session' && request.method === 'GET') {
        const token = url.searchParams.get('token');
        const identity = identify(request, token || 'invalid');
        if (!identity) { send(response, 403, { error: 'Ссылка недействительна, отозвана или срок её действия истёк' }); return; }
        const name = identity.role === 'display' ? 'arcane_display' : identity.role === 'player' ? 'arcane_player' : 'arcane';
        response.setHeader('Set-Cookie', `${name}=${token}; HttpOnly; SameSite=Strict; Path=/`);
        send(response, 200, { role: identity.role, root: Boolean(identity.root) }); return;
      }
      const identity = identify(request);
      if (!identity) { send(response, 401, { error: 'Требуется действующая сессия' }); return; }
      const access = identity.role;
      if (url.pathname === '/api/me' && request.method === 'GET') { send(response, 200, { role: access, root: Boolean(identity.root) }); return; }
      if (url.pathname === '/api/player' && request.method === 'GET') {
        if (access !== 'player') { send(response, 403, { error: 'Нужна роль игрока' }); return; }
        send(response, 200, playerView(identity)); return;
      }
      if (url.pathname.startsWith('/api/player/') && request.method === 'POST') {
        if (access !== 'player' || request.headers.origin !== origin || !request.headers['content-type']?.startsWith('application/json')) { send(response, 403, { error: 'Недопустимое действие игрока' }); return; }
        const value = JSON.parse((await body(request, 1024 * 1024)).toString());
        const grant = accessStore.find(identity.id)!;
        const project = store.state().projects.find(item => item.id === grant.projectId);
        if (!project) throw new Error('Проект не найден');
        if (url.pathname === '/api/player/claim') {
          if (typeof value.characterId !== 'string' || !project.games[value.characterId] || typeof value.name !== 'string') throw new Error('Выберите персонажа и введите имя');
          accessStore.claim(identity.id, value.characterId, value.name);
        } else if (url.pathname === '/api/player/command') {
          if (!grant.characterId || !project.games[grant.characterId] || !['player.update', 'player.action'].includes(value.type)) throw new Error('Нет доступа к персонажу');
          if (value.type === 'player.action') {
            store.execute({ id: value.id, type: 'combat.request', projectId: project.id, characterId: grant.characterId, targetId: value.targetId, kind: value.kind, amount: value.amount });
          } else {
          const game = { ...project.games[grant.characterId], hp: value.hp ?? project.games[grant.characterId].hp, blocks: value.blocks ?? project.games[grant.characterId].blocks };
          if (value.sheet && typeof value.sheet === 'object') for (const key of ['level','race','className','speed','abilities','inventory','spells','spellBook'] as const) if (value.sheet[key] !== undefined) Object.assign(game, { [key]: value.sheet[key] });
          store.execute({ id: value.id, type: 'character.update', projectId: project.id, characterId: grant.characterId, game });
          }
        } else { send(response, 404, { error: 'Действие не найдено' }); return; }
        broadcast(); send(response, 200, playerView(identity)); return;
      }
      if (url.pathname === '/api/display' && request.method === 'GET') { send(response, 200, store.publicView()); return; }
      if (url.pathname.startsWith('/media/') && request.method === 'GET') {
        const id = url.pathname.slice(7);
        const allowed = mediaAllowed(identity,url.pathname);
        if (!allowed || !/^[a-f0-9-]+\.(png|jpg|webp|svg|mp4|webm|mp3|wav|ogg)$/.test(id)) { send(response, 404, { error: 'Медиа не найдено' }); return; }
        const filename = join(uploads, id); const size = statSync(filename).size;
        const mime = id.endsWith('.svg') ? 'image/svg+xml' : id.endsWith('.mp3') ? 'audio/mpeg' : id.endsWith('.wav') ? 'audio/wav' : id.endsWith('.ogg') ? 'audio/ogg' : id.endsWith('.mp4') ? 'video/mp4' : id.endsWith('.webm') ? 'video/webm' : id.endsWith('.png') ? 'image/png' : id.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
        const range = request.headers.range;
        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          let start = match?.[1] ? Number(match[1]) : 0;
          let end = match?.[2] ? Number(match[2]) : size - 1;
          if (match && !match[1] && match[2]) { start = Math.max(0, size - Number(match[2])); end = size - 1; }
          end = Math.min(end, size - 1);
          if (!match || (!match[1] && !match[2]) || start > end || start >= size || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) { response.writeHead(416, { 'Content-Range': `bytes */${size}` }); response.end(); return; }
          response.writeHead(206, { 'Content-Type': mime, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'" });
          const stream = createReadStream(filename, { start, end }); stream.on('error', () => response.destroy()); response.on('close', () => stream.destroy()); stream.pipe(response); return;
        }
        response.writeHead(200, { 'Content-Type': mime, 'Content-Length': size, 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'" });
        const stream = createReadStream(filename); stream.on('error', () => response.destroy()); response.on('close', () => stream.destroy()); stream.pipe(response); return;
      }
      if (access !== 'master') { send(response, 403, { error: 'Требуются права мастера' }); return; }
      if (url.pathname === '/api/network' && request.method === 'GET') {
        if (!identity.root || !local(request)) { send(response, 403, { error: 'Нужна основная панель компьютера' }); return; }
        send(response, 200, networkView()); return;
      }
      if (url.pathname === '/api/desktop' && request.method === 'GET') { send(response, 200, options.desktop ? { available: true, ...options.desktop.state() } : { available: false, monitors: [], monitorId: 0, fullscreen: false }); return; }
      if (url.pathname === '/api/state' && request.method === 'GET') { send(response, 200, store.state()); return; }
      if (url.pathname === '/api/display-link' && request.method === 'GET') { send(response, 200, { path: `/?display=${display}` }); return; }
      if (url.pathname === '/api/project/export' && request.method === 'GET') {
        const project = store.state().projects.find(p => p.id === url.searchParams.get('projectId'));
        if (!project || !options.staticRoot) throw new Error('Проект или ресурсы не найдены');
        const transfers = join(directory, 'transfers'); mkdirSync(transfers, { recursive: true }); const filename = join(transfers, `${randomUUID()}.zip`);
        try {
          await writeProjectArchive(project, directory, options.staticRoot, filename);
          response.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename=arcane-project.zip', 'Content-Length': fileStat(filename).size, 'Cache-Control': 'no-store' });
          await pipeline(createReadStream(filename), response);
        } finally { try { unlinkSync(filename); } catch {} }
        return;
      }
      if (url.pathname === '/api/lss/export' && request.method === 'GET') {
        const project = store.state().projects.find(p => p.id === url.searchParams.get('projectId'));
        const character = project?.characters.find(c => c.id === url.searchParams.get('characterId'));
        if (!project || !character) throw new Error('Персонаж не найден');
        send(response, 200, exportLss(character, project.games[character.id])); return;
      }
      if (request.method !== 'POST' || request.headers.origin !== origin) { send(response, 403, { error: 'Недопустимый запрос' }); return; }
      if (url.pathname === '/api/desktop/display') {
        if (!options.desktop) throw new Error('Нужно запустить приложение Electron');
        const value = JSON.parse((await body(request, 1024)).toString());
        if (!Number.isSafeInteger(value.monitorId) || value.fullscreen !== undefined && typeof value.fullscreen !== 'boolean') throw new Error('Некорректные настройки экрана');
        if (!options.desktop.state().monitors.some(m => m.id === value.monitorId)) throw new Error('Монитор отключён. Обновите список');
        await options.desktop.open(value.monitorId, value.fullscreen); send(response, 200, { available: true, ...options.desktop.state() }); return;
      }
      if (url.pathname === '/api/network' || url.pathname.startsWith('/api/connections/')) {
        if (!identity.root || !local(request)) { send(response, 403, { error: 'Управлять подключениями можно только с основного компьютера' }); return; }
        const value = JSON.parse((await body(request, 8192)).toString());
        if (url.pathname === '/api/network') {
          if (value.enabled === false) await stopLan();
          else {
            if (value.enabled !== true || !interfaces().some(item => item.address === value.address)) throw new Error('Выберите действующий частный IPv4 интерфейс');
            await stopLan();
            if (!options.staticRoot) throw new Error('Сначала выполните сборку приложения');
            const server = createServer((req, res) => { void handle(req, res, () => staticPage(req, res)); });
            attach(server);
            await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, value.address, () => { server.removeListener('error', reject); resolve(); }); });
            lan = server; lanAddress = value.address;
            const address = server.address(); lanPort = address && typeof address !== 'string' ? address.port : 0;
          }
          send(response, 200, networkView()); return;
        }
        if (url.pathname === '/api/connections/create') {
          if (!lan) throw new Error('Сначала включите локальную сеть');
          if (value.role === 'player' && !store.state().projects.some(project => project.id === value.projectId)) throw new Error('Выберите проект игрока');
          const grant = accessStore.create(value.role, value.label, value.hours, value.projectId);
          send(response, 200, { ...networkView(), link: `http://${lanAddress}:${lanPort}/?join=${grant.token}` }); return;
        }
        if (url.pathname === '/api/connections/revoke') accessStore.revoke(value.id);
        else if (url.pathname === '/api/connections/release') accessStore.release(value.id);
        else { send(response, 404, { error: 'Действие не найдено' }); return; }
        broadcast(); send(response, 200, networkView()); return;
      }
      if (url.pathname === '/api/command') {
        if (!request.headers['content-type']?.startsWith('application/json')) throw new Error('Ожидается JSON');
        const command = JSON.parse((await body(request, 8 * 1024 * 1024)).toString()) as Command;
        const state = store.execute(command); broadcast(); send(response, 200, state); return;
      }
      if (url.pathname === '/api/project/import') {
        const transfers = join(directory, 'transfers'); mkdirSync(transfers, { recursive: true }); const filename = join(transfers, `${randomUUID()}.zip`);
        try {
          await pipeline(request, byteLimit(1024 ** 3), createWriteStream(filename, { flags: 'wx' }));
          const imported = await readProjectArchive(filename, directory);
          try { const state = store.execute({ id: randomUUID(), type: 'project.import' }, undefined, undefined, undefined, undefined, imported.project); broadcast(); send(response, 200, state); }
          catch (error) { imported.rollback(); throw error; }
        } finally { try { unlinkSync(filename); } catch {} }
        return;
      }
      if (url.pathname === '/api/lss/import') {
        const projectId = url.searchParams.get('projectId') || '';
        const imported = importLss(JSON.parse((await body(request, 5 * 1024 * 1024)).toString('utf8').replace(/^\uFEFF/, '')));
        const state = store.execute({ id: randomUUID(), type: 'character.import', projectId }, undefined, undefined, undefined, imported);
        broadcast(); send(response, 200, { state, warnings: imported.warnings }); return;
      }
      if (url.pathname === '/api/icon') {
        const projectId = url.searchParams.get('projectId') || ''; const kind = url.searchParams.get('kind') || '';
        if (!store.state().projects.some(p => p.id === projectId) || !['heart','shield'].includes(kind)) throw new Error('Выберите проект и значок');
        const bytes = await body(request,2*1024*1024); const size = imageSize(bytes); const extension = size.type === 'png' ? 'png' : size.type === 'webp' ? 'webp' : null;
        if (!extension || !size.width || !size.height || size.width > 2048 || size.height > 2048) throw new Error('Нужен PNG/WebP не более 2048 × 2048');
        const filename = `${randomUUID()}.${extension}`; writeFileSync(join(uploads,filename),bytes,{ flag:'wx',flush:true });
        try { const state = store.execute({ id:randomUUID(),type:'icon.import',projectId,kind },undefined,undefined,{ image:`/media/${filename}`,width:size.width,height:size.height }); broadcast(); send(response,200,state); }
        catch (error) { unlinkSync(join(uploads,filename)); throw error; } return;
      }
      if (url.pathname === '/api/shop-artwork') {
        const projectId = url.searchParams.get('projectId') || ''; const shopId = url.searchParams.get('shopId') || ''; const itemId = url.searchParams.get('itemId') || undefined;
        const shop = store.state().projects.find(p => p.id === projectId)?.shops.find(s => s.id === shopId);
        if (!shop || itemId && !shop.items.some(i => i.id === itemId)) throw new Error('Магазин или товар не найден');
        const bytes = await body(request,25*1024*1024); const size = imageSize(bytes); const extension = size.type === 'png' ? 'png' : size.type === 'jpg' ? 'jpg' : size.type === 'webp' ? 'webp' : null;
        if (!extension || !size.width || !size.height || size.width*size.height > 64000000) throw new Error('Нужен PNG/JPEG/WebP не более 64 мегапикселей');
        const filename = `${randomUUID()}.${extension}`; writeFileSync(join(uploads,filename),bytes,{ flag:'wx',flush:true });
        try { const state = store.execute({ id:randomUUID(),type:'shop.artwork',projectId,shopId,itemId },undefined,undefined,{ image:`/media/${filename}`,width:size.width,height:size.height }); broadcast(); send(response,200,state); }
        catch (error) { unlinkSync(join(uploads,filename)); throw error; } return;
      }
      if (url.pathname === '/api/portrait' || url.pathname === '/api/monster-portrait') {
        const projectId = url.searchParams.get('projectId') || ''; const characterId = url.searchParams.get('characterId') || ''; const monsterId = url.searchParams.get('monsterId') || ''; const monster = url.pathname === '/api/monster-portrait';
        if (!store.state().projects.some(p => p.id === projectId && (monster ? p.monsters.some(m => m.id === monsterId) : p.characters.some(c => c.id === characterId)))) throw new Error('Персонаж не найден');
        const bytes = await body(request, 25 * 1024 * 1024); const dimensions = imageSize(bytes);
        const extension = dimensions.type === 'png' ? 'png' : dimensions.type === 'jpg' ? 'jpg' : dimensions.type === 'webp' ? 'webp' : null;
        if (!extension || !dimensions.width || !dimensions.height || dimensions.width * dimensions.height > 64000000) throw new Error('Нужен PNG/JPEG/WebP не более 64 мегапикселей');
        const filename = `${randomUUID()}.${extension}`; writeFileSync(join(uploads, filename), bytes, { flag: 'wx', flush: true });
        try {
          const state = store.execute({ id: randomUUID(), type: monster ? 'monster.portrait' : 'character.portrait', projectId, characterId, monsterId }, undefined, undefined, { image: `/media/${filename}`, width: dimensions.width, height: dimensions.height });
          broadcast(); send(response, 200, state);
        } catch (error) { unlinkSync(join(uploads, filename)); throw error; }
        return;
      }
      if (url.pathname === '/api/audio') {
        const projectId = url.searchParams.get('projectId') || '';
        if (!store.state().projects.some(project => project.id === projectId)) throw new Error('Проект не найден');
        const bytes = await body(request, 100 * 1024 * 1024);
        const extension = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE' ? 'wav'
          : bytes.toString('ascii', 0, 4) === 'OggS' ? 'ogg' : bytes.toString('ascii', 0, 3) === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224) ? 'mp3' : null;
        if (!extension || bytes.length < 16) throw new Error('Поддерживаются MP3, WAV и OGG');
        const id = randomUUID(); const filename = `${id}.${extension}`;
        writeFileSync(join(uploads, filename), bytes, { flag: 'wx', flush: true });
        try {
          const state = store.execute({ id: randomUUID(), type: 'track.import', projectId }, undefined, { id, name: (url.searchParams.get('name') || 'Трек').slice(0, 100), url: `/media/${filename}` });
          broadcast(); send(response, 200, state);
        } catch (error) { unlinkSync(join(uploads, filename)); throw error; }
        return;
      }
      if (url.pathname === '/api/import') {
        const projectId = url.searchParams.get('projectId') || '';
        if (!store.state().projects.some(p => p.id === projectId)) throw new Error('Проект не найден');
        const bytes = await body(request, 200 * 1024 * 1024);
        const extension = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png'
          : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'jpg'
          : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : bytes.toString('ascii', 4, 8) === 'ftyp' ? 'mp4' : bytes.subarray(0, 4).equals(Buffer.from([26,69,223,163])) && bytes.subarray(0, 4096).includes(Buffer.from('webm')) ? 'webm' : null;
        if (!extension) throw new Error('Поддерживаются PNG, JPEG, WebP, MP4 и WebM');
        if (!['mp4', 'webm'].includes(extension) && bytes.length > 25 * 1024 * 1024) throw new Error('Изображения должны быть не больше 25 МБ');
        const id = randomUUID(); const filename = `${id}.${extension}`;
        const name = (url.searchParams.get('name') || 'Новая сцена').slice(0, 100);
        writeFileSync(join(uploads, filename), bytes, { flag: 'wx', flush: true });
        try {
          const state = store.execute({ id: randomUUID(), type: 'scene.import', projectId }, { id, name, url: `/media/${filename}`, type: extension === 'mp4' || extension === 'webm' ? 'video' : 'image', folderId: url.searchParams.get('folderId') || null });
          broadcast(); send(response, 200, state);
        } catch (error) { unlinkSync(join(uploads, filename)); throw error; }
        return;
      }
      send(response, 404, { error: 'Команда не найдена' });
    } catch (error) { send(response, 400, { error: error instanceof Error ? error.message : 'Ошибка сервера' }); }
  }
  function attach(server: Server) {
    server.on('upgrade', (request, socket, head) => {
      const path = new URL(request.url || '/', 'http://127.0.0.1').pathname;
      if (path !== '/realtime') return;
      const host = request.headers.host || '';
      const displayToken = new URL(request.url || '/', 'http://127.0.0.1').searchParams.get('display');
      const token = new URL(request.url || '/', 'http://127.0.0.1').searchParams.get('access') || displayToken;
      const identity = identify(request, token);
      const access = identity?.role;
      if (!access || !identity || request.headers.origin !== `http://${host}` || !validHost(request)) { socket.destroy(); return; }
      sockets.handleUpgrade(request, socket, head, ws => {
        roles.set(ws, { identity: identity!, port: request.socket.localPort });
        ws.on('close', () => roles.delete(ws));
        ws.on('error', () => roles.delete(ws));
        try { ws.send(JSON.stringify(access === 'master' ? { type: 'changed' } : access === 'player' ? { type: 'player', view: playerView(identity!) } : { type: 'display', view: store.publicView() })); } catch { ws.close(1008, 'Project unavailable'); }
      });
    });
  }
  return { handle, attach, csp, master, display, store, access: accessStore, close() { clearInterval(expiryTimer); if (lan) { lan.closeAllConnections(); lan.close(); } for (const ws of roles.keys()) ws.terminate(); sockets.close(); store.close(); } };
}
