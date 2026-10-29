import type { BrowserWindow } from 'electron';
import type { createService } from '../backend/service.js';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export async function playerCombatSmoke(phone: BrowserWindow, service: Awaited<ReturnType<typeof createService>>, projectId: string, origin: string, output: string, display: BrowserWindow) {
  writeFileSync(join(output, 'motion-preference.json'), JSON.stringify(await display.webContents.executeJavaScript(`({reduced:matchMedia('(prefers-reduced-motion:reduce)').matches})`)));
  display.webContents.debugger.attach('1.3');
  await display.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  display.showInactive();
  const project = () => service.store.state().projects.find(p => p.id === projectId)!;
  const run = async (type: string, extra = {}) => {
    const response = await fetch(origin + '/api/command', { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${service.master}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: randomUUID(), type, projectId, ...extra }) });
    if (!response.ok) throw new Error(`Player smoke ${type}: ${await response.text()}`);
  };
  const wait = async (check: () => boolean, label: string) => { const start = Date.now(); while (!check()) { if (Date.now() - start > 5000) throw new Error(label); await new Promise(resolve => setTimeout(resolve, 40)); } };
  const screenshot = async (filename: string) => {
    await phone.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    await new Promise(resolve => setTimeout(resolve, 60));
    writeFileSync(join(output, filename), (await phone.webContents.capturePage()).toPNG());
  };
  if (project().combat?.running) await run('combat.stop');
  for (const characterId of ['paladin', 'tarkhun']) { const game = project().games[characterId]; await run('character.update', { characterId, game: { ...game, hp: game.maxHp } }); }
  await run('combat.create', { name: 'Карточный бой — проверка игрока' });
  await run('combat.add', { characterId: 'paladin' }); await run('combat.add', { characterId: 'tarkhun' });
  await run('combat.add', { participant: { name: 'Гоблин', maxHp: 20, ac: 12, initiative: 5 } });
  await run('combat.add', { participant: { name: 'СКРЫТЫЙ_ВРАГ', maxHp: 31, ac: 17 } });
  const [hero, ally, enemy, secret] = project().combat!.participants;
  await run('combat.update', { participantId: hero.id, participant: { initiative: 20 } });
  await run('combat.update', { participantId: secret.id, participant: { visible: false } });
  await run('combat.start');
  const beforeAlly = project().games.tarkhun.hp;
  await phone.webContents.executeJavaScript(`(async () => {
    document.getElementById('player-tab-combat').click(); window.scrollTo(0,0);
    const start = Date.now(); while (document.getElementById('player-panel-combat').hidden || document.querySelectorAll('#player-panel-combat .player-target').length !== 3 || !document.querySelector('.player-target-columns').getBoundingClientRect().width) { if (Date.now()-start>5000) throw new Error('Карты игрока не появились'); await new Promise(resolve=>setTimeout(resolve,40)); }
    if (document.body.scrollWidth>innerWidth+1) throw new Error('Интерфейс игрока шире экрана');
    if (document.querySelector('.battle-turn') || document.querySelector('.table-turn')) throw new Error('Старая отметка хода осталась');
    if (document.querySelector('.player-combat').textContent.includes('СКРЫТЫЙ_ВРАГ')) throw new Error('Скрытый враг доступен игроку');
    const columns = document.querySelector('.player-target-columns'); if (getComputedStyle(columns).gridTemplateColumns.split(' ').length !== 2) throw new Error('Не два столбца целей');
    document.querySelector('[data-target-id="${ally.id}"]').click();
    const input = document.querySelector('[aria-label="Величина действия игрока"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'3'); input.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    document.querySelector('.player-apply-action').click();
  })()`);
  await wait(() => project().games.tarkhun.hp === beforeAlly - 3, 'Игрок не нанёс урон союзнику');
  await phone.webContents.executeJavaScript(`(async()=>{ const start=Date.now();while(document.querySelector('.player-apply-action').disabled || !document.querySelector('.player-action-status').textContent.includes('· 3')){if(Date.now()-start>5000)throw new Error('Действие осталось заблокировано');await new Promise(resolve=>setTimeout(resolve,40));} await Promise.all(Array.from(document.images).filter(image=>image.getClientRects().length).map(image=>image.decode()));window.scrollTo(0,0); await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))); })()`);
  await screenshot('desktop-player-combat.png');
  await phone.webContents.executeJavaScript(`(async()=>{document.querySelector('[data-target-id="${enemy.id}"]').click();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));document.querySelector('.player-apply-action').click();})()`);
  await wait(() => project().combat!.participants.find(p => p.id === enemy.id)!.hp === 17, 'Выбор карты не позволяет атаковать противника');
  await display.webContents.executeJavaScript(`(async()=>{const start=Date.now();while(!document.querySelector('[data-fx-source="${hero.id}"][data-fx-destination="${enemy.id}"]')?.getAnimations().length){if(Date.now()-start>3000)throw new Error('Карта атакующего не вылетела из руки');await new Promise(resolve=>setTimeout(resolve,15));}const card=document.querySelector('[data-fx-source="${hero.id}"][data-fx-destination="${enemy.id}"]');const animation=card.getAnimations()[0];animation.pause();animation.currentTime=450;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()`);
  await display.webContents.capturePage();
  writeFileSync(join(output,'desktop-attack-flight.png'),(await display.webContents.capturePage()).toPNG());
  await phone.webContents.executeJavaScript(`(async()=>{const start=Date.now();while(document.querySelector('.player-apply-action').disabled || !document.querySelector('.player-action-status').textContent.includes('Урон:')){if(Date.now()-start>5000)throw new Error('Атака не завершилась');await new Promise(resolve=>setTimeout(resolve,40));}Array.from(document.querySelectorAll('.player-action-kind button')).find(b=>b.textContent.includes('Лечение')).click();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));document.querySelector('.player-apply-action').click();})()`);
  await wait(() => project().combat!.participants.find(p => p.id === enemy.id)!.hp === 20, 'Лечение выбранной карты не применилось');
  await display.webContents.executeJavaScript(`(async()=>{const start=Date.now();while(!document.querySelector('.combat-heal-aura')){if(Date.now()-start>3000)throw new Error('Лечебная аура не появилась');await new Promise(resolve=>setTimeout(resolve,15));}await new Promise(resolve=>setTimeout(resolve,400));})()`);
  await display.webContents.capturePage();
  writeFileSync(join(output,'desktop-healing-aura.png'),(await display.webContents.capturePage()).toPNG());
  await phone.webContents.executeJavaScript(`(async()=>{const start=Date.now();while(document.querySelector('.player-apply-action').disabled){if(Date.now()-start>5000)throw new Error('Лечение не завершилось');await new Promise(resolve=>setTimeout(resolve,40));}if(document.querySelector('.player-drag-source')||document.querySelector('.player-card-ghost'))throw new Error('Перетаскивание осталось в пульте');})()`);
  await run('combat.active', { participantId: enemy.id });
  await phone.webContents.executeJavaScript(`(async()=>{const start=Date.now();while(!document.querySelector('.player-apply-action').disabled){if(Date.now()-start>5000)throw new Error('Игрок может ходить вне инициативы');await new Promise(resolve=>setTimeout(resolve,40));}if(!document.querySelector('.player-apply-action').disabled)throw new Error('Кнопка доступна вне инициативы');})()`);
  await run('combat.active', { participantId: hero.id }); await run('combat.mode', { approval: true });
  const beforePending = project().games.tarkhun.hp;
  await phone.webContents.executeJavaScript(`(async()=>{const start=Date.now();while(document.querySelector('.player-apply-action').disabled){if(Date.now()-start>5000)throw new Error('Инициатива не вернулась');await new Promise(resolve=>setTimeout(resolve,40));}document.querySelector('[data-target-id="${ally.id}"]').click();Array.from(document.querySelectorAll('.player-action-kind button')).find(b=>b.textContent.includes('Урон')).click();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));document.querySelector('.player-apply-action').click();})()`);
  await wait(() => project().combat!.pending.length === 1, 'Нет запроса подтверждения');
  if (project().games.tarkhun.hp !== beforePending) throw new Error('Урон прошёл до подтверждения мастера');
  await phone.webContents.executeJavaScript(`(async()=>{const start=Date.now();while(!document.querySelector('.player-action-status').textContent.includes('ожидает')){if(Date.now()-start>5000)throw new Error('Игрок не видит ожидание мастера');await new Promise(resolve=>setTimeout(resolve,40));}})()`);
  await screenshot('desktop-player-approval.png');
  await run('combat.approve', { requestId: project().combat!.pending[0].id });
  phone.setContentSize(1000, 820);
  await phone.webContents.executeJavaScript(`(async()=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));if(document.body.scrollWidth>innerWidth+1)throw new Error('Широкий интерфейс игрока переполнен');})()`);
  await screenshot('desktop-player-wide.png');
  phone.setContentSize(420, 860);
  display.hide();
}
