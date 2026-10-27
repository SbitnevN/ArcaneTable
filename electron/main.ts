import { app, BrowserWindow, ipcMain, screen, shell } from 'electron';
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../backend/service.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const smoke = process.argv.includes('--smoke-test');
const smokeOutput = resolve(process.env.ARCANE_SMOKE_OUTPUT || join(root, '.arcane-data'));
const combatSmoke = process.argv.includes('--combat-smoke');
if (smoke) { app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required'); const directory = join(smokeOutput, 'desktop-smoke'); mkdirSync(directory, { recursive: true }); app.setPath('userData', directory); }
let main: BrowserWindow | null = null;
let displayWindow: BrowserWindow | null = null;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { main?.show(); main?.focus(); });
  app.whenReady().then(async () => {
    const service = await createService(app.getPath('userData'), { staticRoot: join(root, 'dist'), desktop: { state: () => ({ monitors: screen.getAllDisplays().map(d => ({ id: d.id, label: d.label || `${d.size.width} × ${d.size.height}` })), ...settings }), open: async (id, fullscreen) => { await openDisplay(id); if (fullscreen !== undefined) { settings.fullscreen = fullscreen; saveSettings(); displayWindow!.setFullScreen(fullscreen); } } } });
    let masterReady = false; let displayReady = false;
    const rendererErrors: string[] = [];
    const server = createServer((request, response) => {
      if (smoke) response.once('finish', () => {
        if (response.statusCode === 200 && request.url === '/api/state') masterReady = true;
        if (response.statusCode === 200 && request.url === '/api/display') displayReady = true;
      });
      void service.handle(request, response, () => {
        try {
          const pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
          const base = join(root, 'dist');
          const filename = resolve(base, '.' + (pathname === '/' ? '/index.html' : pathname));
          if (!filename.startsWith(base + '\\') || !existsSync(filename)) { response.writeHead(404); response.end(); return; }
          const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
          response.writeHead(200, { 'Content-Type': mime[extname(filename)] || 'application/octet-stream', 'Content-Security-Policy': service.csp, 'X-Content-Type-Options': 'nosniff' });
          response.end(readFileSync(filename));
        } catch { response.writeHead(404); response.end(); }
      });
    });
    service.attach(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Не удалось запустить локальный сервер');
    const origin = `http://127.0.0.1:${address.port}`;
    const settingsFile = join(app.getPath('userData'), 'window-settings.json');
    let settings = { monitorId: screen.getPrimaryDisplay().id, fullscreen: false };
    try {
      const stored = JSON.parse(readFileSync(settingsFile, 'utf8'));
      if (Number.isSafeInteger(stored.monitorId) && typeof stored.fullscreen === 'boolean') settings = stored;
    } catch { /* First launch uses the primary monitor. */ }
    const saveSettings = () => writeFileSync(settingsFile, JSON.stringify(settings), { flush: true });
    const configure = (window: BrowserWindow) => {
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
      window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      if (smoke) window.webContents.on('console-message', details => { if (details.level === 'error') rendererErrors.push(details.message); });
    };
    main = new BrowserWindow({ show: !smoke, width: 1440, height: 960, title: 'Arcane Table', backgroundColor: '#121a1c',
      webPreferences: { preload: join(root, 'electron/preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
    configure(main);
    const allowed = (event: Electron.IpcMainInvokeEvent) => {
      if (event.sender !== main?.webContents || event.senderFrame !== main.webContents.mainFrame) throw new Error('Недопустимый отправитель');
    };
    ipcMain.handle('monitors', event => { allowed(event); return screen.getAllDisplays().map(d => ({ id: d.id, label: d.label || `${d.size.width} × ${d.size.height}` })); });
    ipcMain.handle('spotify:open', async (event, value: unknown) => {
      allowed(event);
      if (typeof value !== 'string') throw new Error('Некорректная ссылка');
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.hostname !== 'open.spotify.com' || url.username || url.password || url.port || !/^\/(playlist|album|track)\/[A-Za-z0-9]+$/.test(url.pathname)) throw new Error('Нужна ссылка Spotify');
      const parts = url.pathname.split('/');
      await shell.openExternal(`spotify:${parts[1]}:${parts[2]}`).catch(() => shell.openExternal(url.origin + url.pathname));
    });
    ipcMain.handle('settings', event => { allowed(event); return settings; });
    const openDisplay = async (id: unknown) => {
      const monitor = screen.getAllDisplays().find(item => item.id === id) || screen.getPrimaryDisplay();
      settings.monitorId = monitor.id; saveSettings();
      if (!displayWindow || displayWindow.isDestroyed()) {
        displayWindow = new BrowserWindow({ show: !smoke, ...monitor.bounds, fullscreen: settings.fullscreen, title: 'Arcane Table — общий экран', backgroundColor: '#121a1c',
          webPreferences: { partition: 'arcane-display', nodeIntegration: false, contextIsolation: true, sandbox: true } });
        configure(displayWindow);
        displayWindow.on('closed', () => { displayWindow = null; });
        await displayWindow.loadURL(`${origin}/?display=${service.display}`);
      } else { displayWindow.setBounds(monitor.bounds); if (!smoke) displayWindow.show(); }
    };
    ipcMain.handle('display:open', async (event, id: unknown) => { allowed(event); await openDisplay(id); });
    ipcMain.handle('display:fullscreen', (event, value: unknown) => {
      allowed(event);
      if (typeof value !== 'boolean') throw new Error('Некорректный режим');
      if (!displayWindow) throw new Error('Сначала откройте общий экран');
      settings.fullscreen = value; saveSettings(); displayWindow.setFullScreen(value);
    });
    screen.on('display-removed', () => { if (displayWindow) displayWindow.setBounds(screen.getPrimaryDisplay().workArea); });
    if (smoke) {
      const projectId = service.store.state().activeId;
      const wav = Buffer.alloc(44 + 16 * 16000);
      wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(16 * 16000, 40);
      const file = '00000000-0000-0000-0000-000000000001.wav';
      writeFileSync(join(app.getPath('userData'), 'media', file), wav);
      const run = (type: string, extra = {}) => service.store.execute({ id: `smoke-${type.replace(/\W/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2)}`, type, projectId, ...extra });
      if (!service.store.state().projects.find(p => p.id === projectId)!.tracks.some(track => track.id === 'smoke-silence')) service.store.execute({ id: `smoke-import-${Date.now()}`, type: 'track.import', projectId }, undefined, { id: 'smoke-silence', name: 'Тихий тестовый WAV', url: `/media/${file}` });
      if (!service.store.state().projects.find(p => p.id === projectId)!.playlists.length) run('playlist.create', { name: 'Тест воспроизведения' });
      for (const grant of service.access.list()) if (grant.active && grant.label.startsWith('Smoke player')) service.access.revoke(grant.id);
      const testShop = service.store.state().projects.find(p => p.id === projectId)!.shops[0];
      if (testShop) for (const item of testShop.items) if (item.name.startsWith('СЕКРЕТ_SMOKE')) run('shop.item.delete', { shopId: testShop.id, itemId: item.id });
      const playlistId = service.store.state().projects.find(p => p.id === projectId)!.playlists[0].id;
      run('playlist.track.add', { playlistId, trackId: 'smoke-silence' });
      run('music.assign', { target: 'project', playlistId });
      run('character.select', { characterId: 'paladin' });
      if (combatSmoke) {
        const existing = service.store.state().projects.find(p => p.id === projectId)!.combat; if (existing?.running) run('combat.stop');
        run('combat.create', { name: 'Засада в древнем храме' }); run('combat.add', { characterId: 'paladin' }); run('combat.add', { characterId: 'tarkhun' });
        for (let i = 1; i <= 3; i++) run('combat.add', { participant: { name: `Гоблин ${i}`, maxHp: 10, ac: 15, initiative: 5 } });
        const hero = service.store.state().projects.find(p => p.id === projectId)!.combat!.participants[0];
        run('combat.update', { participantId: hero.id, participant: { initiative: 15 } }); run('combat.start');
      } else if (service.store.state().projects.find(p => p.id === projectId)!.combat?.running) run('combat.stop');
      run('project.live');
      run('music.play', { playlistId });
      writeFileSync(join(smokeOutput, 'desktop-smoke-result.json'), JSON.stringify({ success: false, status: 'running' }));
    }
    await main.loadURL(`${origin}/?master=${service.master}`);
    app.on('before-quit', () => { server.close(); service.close(); });
    if (smoke) {
      service.store.execute({ id: `smoke-live-${Date.now()}`, type: 'project.live', projectId: service.store.state().activeId });
      await openDisplay(screen.getPrimaryDisplay().id);
      const timeout = setTimeout(() => {
        writeFileSync(join(smokeOutput, 'desktop-smoke-result.json'), JSON.stringify({ success: false, masterReady, displayReady, rendererErrors }));
        app.exit(1);
      }, 15000);
      const check = setInterval(() => {
        if (!masterReady || !displayReady) return;
        clearInterval(check); clearTimeout(timeout);
        const waitForImages = async (window: BrowserWindow) => {
          await window.webContents.executeJavaScript(`(async () => {
            const start = Date.now();
            while (!document.querySelector('.portrait')) {
              if (Date.now() - start > 5000) throw new Error('Портрет не появился');
              await new Promise(resolve => requestAnimationFrame(resolve));
            }
            if (document.querySelector('.studio')) {
              while (!document.querySelector('time[aria-label="Позиция воспроизведения"]') || document.querySelector('time[aria-label="Позиция воспроизведения"]').textContent.trim() === '0:00') {
                if (Date.now() - start > 8000) throw new Error('Тестовый WAV не начал воспроизводиться');
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            }
            await Promise.all(Array.from(document.images).map(image => image.decode()));
            const background = getComputedStyle(document.querySelector('.presentation') || document.querySelector('.canvas') || document.querySelector('.combat-stage')).backgroundImage;
            if (background !== 'none') { const image = new Image(); image.src = background.slice(5, -2); await image.decode(); }
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          })()`);
          return window.webContents.capturePage();
        };
        void Promise.all([
          waitForImages(main!).then(image => writeFileSync(join(smokeOutput, 'desktop-master.png'), image.toPNG())),
          waitForImages(displayWindow!).then(image => writeFileSync(join(smokeOutput, 'desktop-display.png'), image.toPNG()))
        ]).then(async () => {
          const testSection = async (name: string, selector: string, filename: string) => {
            await main!.webContents.executeJavaScript(`(async () => {
              document.getElementById('nav-${name}').click();
              const start = Date.now(); while (!document.querySelector('${selector}')) { if (Date.now() - start > 5000) throw new Error('Раздел ${name} не загрузился'); await new Promise(resolve => setTimeout(resolve,50)); }
              if (document.querySelector('.reference-list button')) document.querySelector('.reference-list button').click();
              await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            })()`);
            writeFileSync(join(smokeOutput,filename),(await main!.webContents.capturePage()).toPNG());
          };
          await testSection('spells','.reference-list button','desktop-spells.png');
          await testSection('bestiary','.reference-list button','desktop-bestiary.png');
          await testSection('character','.character-editor','desktop-character.png');
          await testSection('shops','.shop-preview .shop-product','desktop-shop-master.png');
          await main!.webContents.executeJavaScript(`(async () => {
            Array.from(document.querySelectorAll('.shop-editor button')).find(b => b.textContent === 'Добавить товар').click();
            const start = Date.now(); while (!document.querySelector('.shop-item-editor')) { if (Date.now()-start > 5000) throw new Error('Редактор товара не открылся'); await new Promise(resolve => setTimeout(resolve,50)); }
            const form = document.querySelector('.shop-item-editor'); form.querySelector('[name=name]').value = 'СЕКРЕТ_SMOKE_ТОВАР'; form.querySelector('[name=notes]').value = 'СЕКРЕТ_SMOKE_ЗАМЕТКА'; form.querySelector('[name=price]').value = '12.5'; form.querySelector('[name=visible]').checked = false; form.requestSubmit();
          })()`);
          const itemStart = Date.now(); while (!service.store.state().projects.find(p => p.id === service.store.state().activeId)!.shops[0].items.some(i => i.name === 'СЕКРЕТ_SMOKE_ТОВАР')) { if (Date.now()-itemStart > 5000) throw new Error('Товар из редактора не сохранился'); await new Promise(resolve => setTimeout(resolve,50)); }
          const shopProject = service.store.state().projects.find(p => p.id === service.store.state().activeId)!;
          await fetch(origin + '/api/command',{ method:'POST',headers:{ Origin:origin,Authorization:`Bearer ${service.master}`,'Content-Type':'application/json' },body:JSON.stringify({ id:`smoke-shop-${Date.now()}`,type:'shop.show',projectId:shopProject.id,shopId:shopProject.shops[0].id }) });
          await displayWindow!.webContents.executeJavaScript(`(async () => { const start = Date.now(); while (!document.querySelector('.shop-stage .shop-product')) { if (Date.now()-start > 5000) throw new Error('Магазин не появился в эфире'); await new Promise(resolve => setTimeout(resolve,50)); } if (document.querySelector('.shop-stage').textContent.includes('СЕКРЕТ_SMOKE')) throw new Error('Скрытый товар попал на общий экран'); await Promise.all(Array.from(document.images).map(image => image.decode())); })()`);
          writeFileSync(join(smokeOutput,'desktop-shop-display.png'),(await displayWindow!.webContents.capturePage()).toPNG());
          await main!.webContents.executeJavaScript("document.getElementById('nav-preview').click()");
          const projectId = service.store.state().activeId;
          for (const [index,characterId] of ['paladin','tarkhun'].entries()) {
            const grant = service.access.create('player',`Smoke player ${index + 1}`,1,projectId); service.access.claim(grant.id,characterId,`Игрок ${index + 1}`);
            const phone = new BrowserWindow({ show:false,width:420,height:900,webPreferences:{ partition:`smoke-phone-${index}`,nodeIntegration:false,contextIsolation:true,sandbox:true } }); configure(phone);
            await phone.loadURL(`${origin}/?join=${grant.token}`);
            await phone.webContents.executeJavaScript(`(async () => {
              const start = Date.now(); while (!document.querySelector('.player-sheet')) { if (Date.now() - start > 5000) throw new Error('Лист игрока не появился'); await new Promise(resolve => setTimeout(resolve,50)); }
              document.querySelector('.player-sheet summary').click();
              const form = document.querySelector('.player-sheet form'); form.querySelector('[name=inventory]').value = 'Проверка мобильного редактора'; form.requestSubmit();
              while (document.querySelector('button').disabled) { if (Date.now() - start > 5000) throw new Error('Мобильное сохранение не завершилось'); await new Promise(resolve => setTimeout(resolve,50)); }
              await Promise.all(Array.from(document.images).map(image => image.decode()));
            })()`);
            const start = Date.now(); while (service.store.state().projects.find(p => p.id === projectId)!.games[characterId].inventory !== 'Проверка мобильного редактора') { if (Date.now() - start > 5000) throw new Error('Правка мобильного листа не сохранена в SQLite'); await new Promise(resolve => setTimeout(resolve,50)); }
            writeFileSync(join(smokeOutput,`desktop-player-${index + 1}.png`),(await phone.webContents.capturePage()).toPNG());
          }
          writeFileSync(join(smokeOutput, 'desktop-smoke-result.json'), JSON.stringify({ success: rendererErrors.length === 0, audioReady: true, mobileSheets: 2, referenceViews: true, shopReady: true, windows: BrowserWindow.getAllWindows().length, masterReady, displayReady, rendererErrors }));
          app.exit(rendererErrors.length ? 1 : 0);
        }).catch(error => { console.error(error); writeFileSync(join(smokeOutput, 'desktop-smoke-result.json'), JSON.stringify({ success: false, error: String(error), rendererErrors })); app.exit(1); });
      }, 100);
    }
  }).catch(error => { console.error(error); if (smoke) { writeFileSync(join(smokeOutput, 'desktop-smoke-result.json'), JSON.stringify({ success: false, error: String(error) })); app.exit(1); } else app.quit(); });
  app.on('window-all-closed', () => app.quit());
}
