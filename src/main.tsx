import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import './themes.css';
import { storedTheme } from './themes';
// The colour theme is a per-device choice; set before the first paint so nothing flashes in the old colours.
document.documentElement.dataset.theme = storedTheme();

import { newId, type Block, type Character, type Game, type Spell, type Weapon, type Item } from './contracts';
import { CardVitals } from './table-card';
import { TvPairing } from './tv-pairing';
import { HeroSheet } from './hero-sheet';
import { effectiveStats } from './library';
import { WorkspaceShell } from './workspace';

function App({ character, onSelect, game, setGame, section, roster, weapons, spells, items }: { weapons: Weapon[]; spells: Spell[]; items: Item[]; roster: Character[]; section: 'character' | 'notes'; character: Character; onSelect: (id: string) => void; game: Game; setGame: React.Dispatch<React.SetStateAction<Game>> }) {
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [revealed, setRevealed] = useState<string[]>([]);
  function updateBlock(id: string, patch: Partial<Block>) {
    setGame(current => ({ ...current, blocks: current.blocks.map(b => b.id === id ? { ...b, ...patch } : b) }));
  }
  function addBlock(kind: Block['kind']) {
    setGame(current => ({ ...current, blocks: [...current.blocks, { id: newId(), kind, title: '', text: '' }] }));
  }
  function stat(key: 'hp' | 'maxHp' | 'ac', value: string) {
    if (value === '') return;
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < (key === 'maxHp' ? 1 : 0)) return;
    setGame(current => {
      const next = { ...current, [key]: number };
      return { ...next, hp: Math.min(next.hp, next.maxHp) };
    });
  }
  return <div className={`character-editor ${section === 'notes' ? 'notes-page' : ''}`}>
    <div className="character-selector"><label>Персонаж<select value={character.id} onChange={e => onSelect(e.target.value)}>{roster.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><span>{character.caption}</span></div>
    <main>
      {section === 'character' && <section className="stage"><div className="stage-heading"><span>ПЕРСОНАЖ · D&D {game.edition || '2024'}</span><span>{character.name.toUpperCase()}</span></div>
        <div className="card-wrap"><img className="portrait" src={character.image} width={character.width} height={character.height} alt={character.name}/>
          <CardVitals hp={game.hp} maxHp={game.maxHp} ac={effectiveStats(game, items).ac}/>
        </div>
        <div className="stage-caption"><span className="line"/>{character.caption.toUpperCase()}<span className="line"/></div>
      </section>}
      <aside><div className="eyebrow">ЛИСТ ПЕРСОНАЖА</div><h1>{character.name}</h1><p className="subtitle">{character.subtitle}</p>
        {section === 'character' && <section className="panel"><div className="panel-title">Боевые показатели<span>ВРУЧНУЮ</span></div><div className="stats-inputs">
          <label>Текущие ХП<input type="number" min="0" max={game.maxHp} value={game.hp} onChange={e => stat('hp', e.target.value)}/></label>
          <label>Максимум ХП<input type="number" min="1" value={game.maxHp} onChange={e => stat('maxHp', e.target.value)}/></label>
          <label>Класс доспеха<input type="number" min="0" value={game.ac} onChange={e => stat('ac', e.target.value)}/></label>
        </div><div className="hp-actions"><button onClick={() => stat('hp', String(Math.max(0, game.hp - 1)))}>−1 ХП</button><div className="hp-track"><div style={{ width: `${100 * game.hp / game.maxHp}%` }}/></div><button onClick={() => stat('hp', String(Math.min(game.maxHp, game.hp + 1)))}>+1 ХП</button></div>
        </section>}
        {section === 'character' && <HeroSheet game={game} setGame={setGame} weapons={weapons} spells={spells} items={items}/>}
        {section === 'notes' && <section className="panel notes"><div className="panel-title">Заметки и способности<span>ЛИЧНОЕ</span></div><div className="tabs"><button className={tab === 'edit' ? 'active' : ''} onClick={() => setTab('edit')}>Редактор</button><button className={tab === 'preview' ? 'active' : ''} onClick={() => { setTab('preview'); setRevealed([]); }}>Просмотр</button></div>
          {tab === 'edit' ? <><div className="toolbar"><button onClick={() => addBlock('text')}>+ Текст</button><button onClick={() => addBlock('details')}>⌄ Раскрывашка</button><button onClick={() => addBlock('spoiler')}>◈ Спойлер</button></div><div className="blocks">{game.blocks.map((block, index) => <div className="edit-block" key={block.id}><div className="block-top"><label className="sr-only" htmlFor={`kind-${block.id}`}>Тип блока {index + 1}</label><select id={`kind-${block.id}`} value={block.kind} onChange={e => updateBlock(block.id, { kind: e.target.value as Block['kind'] })}><option value="text">Текст</option><option value="details">Раскрывающийся блок</option><option value="spoiler">Спойлер</option></select><button aria-label={`Удалить блок ${index + 1}`} onClick={() => setGame(current => ({ ...current, blocks: current.blocks.filter(b => b.id !== block.id) }))}>×</button></div><input aria-label={`Заголовок блока ${index + 1}`} placeholder="Заголовок" value={block.title} onChange={e => updateBlock(block.id, { title: e.target.value })}/><textarea aria-label={`Текст блока ${index + 1}`} placeholder="Текст заметки…" value={block.text} onChange={e => updateBlock(block.id, { text: e.target.value })}/></div>)}</div></> : <div className="preview">{game.blocks.length === 0 && <p>Пока нет заметок. Добавьте блок в редакторе.</p>}{game.blocks.map(block => block.kind === 'details' ? <details key={block.id}><summary>{block.title || 'Подробнее'}</summary><p>{block.text}</p></details> : block.kind === 'spoiler' ? <div className="spoiler" key={block.id}><button aria-expanded={revealed.includes(block.id)} onClick={() => setRevealed(current => current.includes(block.id) ? current.filter(id => id !== block.id) : [...current, block.id])}>◈ {block.title || 'Спойлер'} <span>{revealed.includes(block.id) ? 'Скрыть' : 'Показать'}</span></button>{revealed.includes(block.id) && <p>{block.text}</p>}</div> : <article key={block.id}><h3>{block.title}</h3><p>{block.text}</p></article>)}</div>}
        </section>}
      </aside>
    </main>
  </div>;
}
function CharacterApp() {
  return <WorkspaceShell>{props => <App key={props.characterId} character={props.character} roster={props.roster} onSelect={props.onSelect} game={props.game} setGame={props.onGame} section={props.section} weapons={props.weapons} spells={props.spells} items={props.items}/>}</WorkspaceShell>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode>{location.pathname === '/tv' ? <TvPairing/> : <CharacterApp/>}</React.StrictMode>);
