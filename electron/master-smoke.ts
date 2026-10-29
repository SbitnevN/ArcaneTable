import type { BrowserWindow } from 'electron';
import type { createService } from '../backend/service.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export async function masterCombatSmoke(phone: BrowserWindow, service: Awaited<ReturnType<typeof createService>>, projectId: string, output: string) {
  const project = () => service.store.state().projects.find(p => p.id === projectId)!;
  const combat = project().combat!;
  const source = combat.participants.find(p => p.side === 'enemy' && p.visible)!;
  const target = combat.participants.find(p => p.characterId === 'paladin')!;
  const before = project().games.paladin.hp;
  await phone.webContents.executeJavaScript(`(async()=>{
    const start=Date.now();while(!document.getElementById('mobile-nav-combat')){if(Date.now()-start>5000)throw new Error('Мобильная навигация мастера не появилась');await new Promise(r=>setTimeout(r,30));}
    document.getElementById('mobile-nav-combat').click();
    while(!document.querySelector('.master-battle')){if(Date.now()-start>5000)throw new Error('Пульт боя не появился');await new Promise(r=>setTimeout(r,30));}
    if(getComputedStyle(document.querySelector('.studio-navigation')).display!=='none')throw new Error('Боковая панель забирает место на телефоне');
    if(document.querySelector('.studio-content').getBoundingClientRect().width < innerWidth-25)throw new Error('Пульт мастера слишком узкий');
    if(document.querySelector('.player-drag-source'))throw new Error('Перетаскивание осталось у мастера');
    if(document.querySelector('.studio-content').scrollWidth>document.querySelector('.studio-content').clientWidth+1)throw new Error('Пульт мастера переполнен по ширине');
    document.querySelector('[data-source-id="${source.id}"]').click(); await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    document.querySelector('.master-battle [data-target-id="${target.id}"]').click();
    const input=document.querySelector('[aria-label="Величина действия мастера"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'2');input.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));document.querySelector('.master-battle .player-apply-action').click();
  })()`);
  const start = Date.now();
  while (project().games.paladin.hp !== before - 2) { if (Date.now() - start > 5000) throw new Error('Мастер не смог атаковать выбранным противником'); await new Promise(r => setTimeout(r, 30)); }
  if (project().combat!.events.at(-1)?.sourceId !== source.id) throw new Error('Выпад использует неправильный источник');
  await phone.webContents.executeJavaScript(`(async()=>{const start=Date.now();while(document.querySelector('.master-battle .player-apply-action').disabled){if(Date.now()-start>5000)throw new Error('Пульт мастера остался заблокирован');await new Promise(r=>setTimeout(r,30));}const panel=document.querySelector('.studio-content'),board=document.querySelector('.master-battle');panel.scrollTop+=board.getBoundingClientRect().top-panel.getBoundingClientRect().top;await Promise.all(Array.from(document.images).filter(i=>i.getClientRects().length).map(i=>i.decode()));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()`);
  await phone.webContents.capturePage();
  writeFileSync(join(output, 'desktop-master-phone-combat.png'), (await phone.webContents.capturePage()).toPNG());
  await phone.webContents.executeJavaScript(`(async()=>{Array.from(document.querySelectorAll('.master-battle .player-action-kind button')).find(b=>b.textContent.includes('Лечение')).click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));document.querySelector('.master-battle .player-apply-action').click();})()`);
  while (project().games.paladin.hp !== before) { if (Date.now() - start > 10000) throw new Error('Мастер не смог лечить выбранную карту'); await new Promise(r => setTimeout(r, 30)); }
  await phone.webContents.executeJavaScript(`(async()=>{document.querySelector('.studio-mobile-tabs button[aria-controls="studio-mobile-menu"]').click();const start=Date.now();while(!document.querySelector('.studio-mobile-menu')){if(Date.now()-start>5000)throw new Error('Меню разделов не открылось');await new Promise(r=>setTimeout(r,30));}await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()`);
  writeFileSync(join(output, 'desktop-master-phone-menu.png'), (await phone.webContents.capturePage()).toPNG());
}
