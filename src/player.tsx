import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PlayerShop, Purse } from './shop';
import { ReferenceLibrary } from './references';
import { newId, type Ability, type Game, type PlayerView } from './contracts';
import { abilities, effectGroup, effectSentence, effectText, effectiveStats, modifier, parseSkills, proficiency, signed, skills, type EffectiveStats } from './library';
import { PlayerNotesEditor, PlayerSheet } from './player-sheet';
import { PlayerAttacks } from './player-attacks';
import { applyTheme, storedTheme, themes, type ThemeId } from './themes';
import { Modal } from './ui';
import { Icon } from './icons';
import { PlayerCombat } from './player-combat';
import { InventoryGrid } from './inventory';
import { PlayerLoot } from './loot';

export function Player({ api, subscribe }: { api: <T>(path: string, options?: RequestInit) => Promise<T>; subscribe: (ready: boolean, callback: () => void) => void }) {
  const [view, setView] = useState<PlayerView | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('hero');
  const [dialog, setDialog] = useState<'sheet' | 'switch' | null>(null);
  const [heroTab, setHeroTab] = useState<'stats' | 'features' | 'attacks' | 'gear'>('stats');
  const [theme, setTheme] = useState<ThemeId>(storedTheme);
  useEffect(() => applyTheme(theme), [theme]);
  const busyRef = useRef(false);
  const refresh = useCallback(() => { if (busyRef.current) return; void api<PlayerView>('/api/player').then(value => { if (!busyRef.current) { setView(value); setError(''); setName(current => current || value.playerName); } }).catch(err => setError(err.message)); }, [api]);
  useEffect(refresh, [refresh]);
  subscribe(true, refresh);
  async function post(path: string, value: unknown): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError('');
    try { setView(await api<PlayerView>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })); return true; }
    catch (err) { setError(err instanceof Error ? err.message : 'Не удалось сохранить'); return false; }
    finally { busyRef.current = false; setBusy(false); }
  }
  const character = view?.characters.find(item => item.id === view.own?.characterId);
  const game = view?.own?.game;
  const stats = game ? effectiveStats(game, view?.catalog) : null;
  const tabs = [
    { id: 'hero', label: 'Герой', icon: '♙' },
    { id: 'combat', label: 'Бой', icon: '⚔' },
    { id: 'notes', label: 'Заметки', icon: '≡' },
    ...(view?.shop ? [{ id: 'shop', label: 'Лавка', icon: '♧' }] : [])
  ];
  const activeTab = tabs.some(item => item.id === tab) ? tab : 'hero';
  return <div className="mobile-player player-app"><header className="player-app-header"><div className="player-wordmark">✦ <span>ARCANE TABLE<small>{view?.projectName || 'Подключение к столу'}</small></span></div>{character && <div className="player-identity"><img src={character.image} alt=""/><span>{character.name}<small>{view?.playerName}</small></span></div>}</header>
    {view?.own && <nav className="player-tabs" role="tablist" aria-label="Разделы игрока">{tabs.map((item, index) => <button type="button" key={item.id} role="tab" id={`player-tab-${item.id}`} aria-controls={`player-panel-${item.id}`} aria-selected={activeTab === item.id} tabIndex={activeTab === item.id ? 0 : -1} onClick={() => { setTab(item.id); window.scrollTo(0, 0); }} onKeyDown={e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      setTab(tabs[next].id); window.scrollTo(0, 0); document.getElementById(`player-tab-${tabs[next].id}`)?.focus();
    }}><span aria-hidden="true">{item.icon}</span>{item.label}{item.id === 'combat' && view.combat?.running && <i aria-label="Идёт бой"/>}{item.id === 'hero' && view.combat?.loot?.turn === view.own?.characterId && <i aria-label="Ваш выбор добычи"/>}</button>)}</nav>}
    <main>{error && <div className="error-banner" role="alert">{error}<button disabled={busy} onClick={refresh}>Переподключиться</button></div>}{!view ? <section className="player-empty"><span>✦</span><p>Подключаемся к мастеру…</p></section> : !view.own ? <section className="player-claim"><span className="player-kicker">ДОБРО ПОЖАЛОВАТЬ ЗА СТОЛ</span><h1>Выберите своего героя</h1><p>Карта станет вашим листом персонажа и рукой в бою.</p><label>Имя игрока<input aria-label="Имя игрока" value={name} maxLength={100} onChange={e => setName(e.target.value)} autoComplete="nickname"/></label><div className="player-roster">{view.characters.map(item => <button key={item.id} disabled={busy || item.occupied || !name.trim()} onClick={() => void post('/api/player/claim', { characterId: item.id, name })}><img src={item.image} alt=""/><strong>{item.name}</strong><span>{item.occupied ? 'Занят' : 'Выбрать героя'}</span></button>)}</div></section> : game && <>
      <section id="player-panel-hero" role="tabpanel" aria-labelledby="player-tab-hero" hidden={activeTab !== 'hero'}>
        <div className="player-section-heading"><div><span className="player-kicker">ВАШ ПЕРСОНАЖ</span><h1>{character?.name}</h1><p>{[game.race, game.className].filter(Boolean).join(' · ') || character?.caption}</p></div><span className="player-level">{game.level || 1}<small>уровень</small></span><button type="button" className="player-edit-sheet" aria-label="Редактировать лист" title="Редактировать лист" disabled={busy} onClick={() => setDialog('sheet')}><Icon name="edit"/></button></div>
        <div className="player-subtabs" role="tablist" aria-label="Разделы героя">{([['stats', 'Статы'], ['features', 'Умения'], ['attacks', 'Атаки'], ['gear', 'Снаряжение']] as const).map(([id, label]) => <button type="button" role="tab" key={id} aria-selected={heroTab === id} className={heroTab === id ? 'active' : ''} onClick={() => setHeroTab(id)}>{label}{id === 'features' && (game.features || []).length > 0 && <small>{game.features!.length}</small>}{id === 'gear' && view.combat?.loot?.turn === view.own?.characterId && <i aria-label="Ваш выбор добычи"/>}</button>)}</div>
        {heroTab === 'stats' && <>
        <section className="player-hero-overview">{character && <img className="player-hero-art" src={character.image} alt={character.name}/>}<div className="player-hero-values"><div className="player-health"><span>ХИТЫ</span><strong>{game.hp}<small> / {game.maxHp}</small></strong><div className="player-health-track"><i style={{ width: `${game.hp / game.maxHp * 100}%` }}/></div></div><div className="player-defense"><span>КД</span><strong className={stats?.changed.ac !== undefined ? 'boosted' : undefined}>{stats?.ac ?? game.ac}</strong></div>
          <HpControl hp={game.hp} maxHp={game.maxHp} busy={busy} onSet={hp => void post('/api/player/command', { id: newId(), type: 'player.update', hp })}/></div></section>
        <Purse coins={game.coins} busy={busy} onChange={coins => void post('/api/player/command', { id: newId(), type: 'player.update', sheet: { coins } })}/>
        <div className="player-ability-strip">{[['str','СИЛ'],['dex','ЛОВ'],['con','ТЕЛ'],['int','ИНТ'],['wis','МДР'],['cha','ХАР']].map(([key,label]) => { const score = stats?.abilities[key as Ability] ?? game.abilities?.[key] ?? 10; const mod = Math.floor((score - 10) / 2); return <div key={key}><span>{label}</span><strong>{mod >= 0 ? '+' : ''}{mod}</strong><small>{score}</small></div>; })}</div>
        {stats && stats.active.length > 0 && <div className="player-effects"><span>ОТ ПРЕДМЕТОВ</span>{stats.active.map((entry, index) => <span key={index} className={`effect-chip fx-${effectGroup(entry.effect)}`} title={`${entry.item}: ${effectSentence(entry.effect)}`}>{effectText(entry.effect)}</span>)}</div>}
        {stats && <HeroSkills game={game} stats={stats}/>}
        </>}
        {heroTab === 'attacks' && <><PlayerAttacks game={game} busy={busy} post={post} spells={view.spells}/><details className="player-encyclopedia player-paper"><summary>Справочник заклинаний SRD</summary><ReferenceLibrary kind="spells"/></details></>}
        {heroTab === 'gear' && <><Purse coins={game.coins} busy={busy} onChange={coins => void post('/api/player/command', { id: newId(), type: 'player.update', sheet: { coins } })}/>{view.combat?.loot && <PlayerLoot loot={view.combat.loot} characterId={view.own.characterId} busy={busy} post={post}/>}<section className="player-paper player-inventory"><InventoryGrid items={game.items || []} catalog={view.catalog || []} busy={busy} slots={20} allowEffects onChange={items => void post('/api/player/command', { id: newId(), type: 'player.update', sheet: { items } })}/>{game.inventory && <details className="player-inventory-notes"><summary>Заметки об инвентаре</summary><p className="block-text">{game.inventory}</p></details>}</section></>}
        {heroTab === 'features' && <section className="player-paper player-features"><h2>Умения и черты</h2>{(game.features || []).length === 0 ? <p className="ui-note">Умений пока нет: их можно добавить карандашом в шапке.</p> : game.features!.map(feature => <details key={feature.id}><summary>{feature.name || 'Без названия'}</summary>{feature.text && <p className="block-text">{feature.text}</p>}</details>)}</section>}
        <button type="button" className="player-switch-button" disabled={busy} onClick={() => setDialog('switch')}>Сменить персонажа</button>
        <label className="player-theme">Оформление<select aria-label="Цветовая схема" value={theme} onChange={e => setTheme(e.target.value as ThemeId)}>{themes.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        {dialog === 'sheet' && <PlayerSheet game={game} busy={busy} post={post} catalog={view.catalog} onClose={() => setDialog(null)}/>}
        {dialog === 'switch' && <Modal title="Сменить персонажа" subtitle="Текущий герой освободится для других игроков" onClose={() => setDialog(null)}><div className="player-roster">{view.characters.filter(item => item.id !== character?.id).map(item => <button type="button" key={item.id} disabled={busy || item.occupied} onClick={() => void post('/api/player/claim', { characterId: item.id, name: view.playerName || name }).then(ok => { if (ok) { setDialog(null); setTab('hero'); } })}><img src={item.image} alt=""/><strong>{item.name}</strong><span>{item.occupied ? 'Занят' : 'Выбрать героя'}</span></button>)}</div></Modal>}
      </section>
      <section id="player-panel-combat" role="tabpanel" aria-labelledby="player-tab-combat" hidden={activeTab !== 'combat'}>{view.combat?.loot && <PlayerLoot loot={view.combat.loot} characterId={view.own.characterId} busy={busy} post={post}/>}<PlayerCombat view={view} busy={busy} post={post}/></section>
      <section id="player-panel-notes" role="tabpanel" aria-labelledby="player-tab-notes" hidden={activeTab !== 'notes'}><div className="player-section-heading"><div><span className="player-kicker">ЛИЧНЫЙ ЖУРНАЛ</span><h1>Заметки и способности</h1></div></div><section className="player-paper">{game.blocks.length === 0 && <p>Пока нет записей.</p>}{game.blocks.map(block => block.kind === 'text' ? <article key={block.id}><h2>{block.title}</h2><p className="block-text">{block.text}</p></article> : <details key={block.id}><summary>{block.title || 'Подробнее'}</summary><p className="block-text">{block.text}</p></details>)}</section><PlayerNotesEditor game={game} busy={busy} post={post}/></section>
      {view.shop && <section id="player-panel-shop" role="tabpanel" aria-labelledby="player-tab-shop" hidden={activeTab !== 'shop'}><div className="player-section-heading"><div><span className="player-kicker">ТОРГОВЛЯ</span><h1>Лавка</h1></div></div><PlayerShop shop={view.shop} coins={game.coins} busy={busy} onBuy={(itemId, amount) => post('/api/player/command', { id: newId(), type: 'player.buy', shopId: view.shop!.id, itemId, amount })}/></section>}
      <p className="player-save-state" role="status">{busy ? 'Сохранение…' : 'Синхронизировано с мастером'}</p>
    </>}</main></div>;
}

// Current hit points: −1 / +1 buttons and a number field that saves on Enter or when it loses focus.
function HpControl({ hp, maxHp, busy, onSet }: { hp: number; maxHp: number; busy: boolean; onSet: (hp: number) => void }) {
  const commit = (input: HTMLInputElement) => { const value = Number(input.value); if (input.value !== '' && Number.isSafeInteger(value) && value >= 0 && value <= maxHp && value !== hp) onSet(value); else input.value = String(hp); };
  return <div className="player-hp-control">
    <button type="button" aria-label="Уменьшить ХП на 1" disabled={busy || hp === 0} onClick={() => onSet(Math.max(0, hp - 1))}>−</button>
    <input aria-label="Текущие ХП игрока" type="number" inputMode="numeric" min="0" max={maxHp} disabled={busy} key={hp} defaultValue={hp} onBlur={e => commit(e.currentTarget)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}/>
    <button type="button" aria-label="Увеличить ХП на 1" disabled={busy || hp === maxHp} onClick={() => onSet(Math.min(maxHp, hp + 1))}>＋</button>
  </div>;
}

// Saves and skills with their final bonuses, effects of equipped items included; proficiency is read from the sheet text.
function HeroSkills({ game, stats }: { game: Game; stats: EffectiveStats }) {
  const pb = proficiency(game.level || 1);
  const base = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...game.abilities };
  const { profs, extra } = parseSkills(game.skills || '', base, pb);
  const mod = (key: Ability) => modifier(stats.abilities[key]);
  // Grouped by ability: bold heading with the modifier, then the saving throw and that ability's skills.
  const row = (key: string, label: string, bonus: number, level: number) => <li key={key} className={level === 2 ? 'expert' : level ? 'proficient' : undefined}><i aria-label={level === 2 ? 'Экспертиза' : level ? 'Владение' : undefined}/><span>{label}</span><b>{signed(bonus)}</b></li>;
  return <section className="player-paper player-skills">
    <h2>Спасброски и навыки</h2>
    <div className="player-skill-groups">{abilities.map(item => <div key={item.key} className="player-skill-group">
      <h3>{item.label}<b>{signed(mod(item.key))}</b></h3>
      <ul className="player-skill-list">
        {row(`save-${item.key}`, 'Спасбросок', mod(item.key) + ((game.saves || []).includes(item.key) ? pb : 0) + stats.saves, (game.saves || []).includes(item.key) ? 1 : 0)}
        {skills.filter(skill => skill.ability === item.key).map(skill => row(skill.id, skill.label, mod(skill.ability) + pb * (profs[skill.id] || 0), profs[skill.id] || 0))}
      </ul>
    </div>)}</div>
    {extra && <p className="player-profs"><span>Владения и другое</span>{extra}</p>}
  </section>;
}
