import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

import { newId, characters, type Block, type Character, type Icons, type Game } from './contracts';
import { WorkspaceShell } from './workspace';

function App({ character, onSelect, game, setGame, section, roster, icons, onSettings }: { icons:Icons; onSettings:() => void; roster: Character[]; section: 'character' | 'notes'; character: Character; onSelect: (id: string) => void; game: Game; setGame: React.Dispatch<React.SetStateAction<Game>> }) {
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
          <div className="stat heart" aria-label={`Хиты: ${game.hp} из ${game.maxHp}`}><img src={icons.heart} alt=""/><strong>{game.hp}</strong></div>
          <div className="stat shield" aria-label={`Класс доспеха: ${game.ac}`}><img src={icons.shield} alt=""/><strong>{game.ac}</strong><small>КД</small></div>
        </div>
        <div className="stage-caption"><span className="line"/>{character.caption.toUpperCase()}<span className="line"/></div>
      </section>}
      <aside><div className="eyebrow">ЛИСТ ПЕРСОНАЖА</div><h1>{character.name}</h1><p className="subtitle">{character.subtitle}</p>
        {section === 'character' && <section className="panel"><h2>Лист персонажа</h2><div className="sheet-fields"><label>Редакция<select value={game.edition || '2024'} onChange={e => setGame(current => ({ ...current, edition: e.target.value as '2014' | '2024' }))}><option value="2014">D&D 2014</option><option value="2024">D&D 2024</option></select></label><label>Уровень<input type="number" min="1" max="20" value={game.level || 1} onChange={e => { const level = Number(e.target.value); if (Number.isInteger(level) && level >= 1 && level <= 20) setGame(current => ({ ...current, level })); }}/></label><label>Раса<input value={game.race || ''} maxLength={200} onChange={e => setGame(current => ({ ...current, race: e.target.value }))}/></label><label>Класс<input value={game.className || ''} maxLength={200} onChange={e => setGame(current => ({ ...current, className: e.target.value }))}/></label><label>Скорость<input type="number" min="0" max="10000" value={game.speed ?? 30} onChange={e => { const speed = Number(e.target.value); if (Number.isInteger(speed) && speed >= 0 && speed <= 10000) setGame(current => ({ ...current, speed })); }}/></label></div><h3>Характеристики</h3><div className="ability-fields">{[['str','Сила'],['dex','Ловкость'],['con','Телосложение'],['int','Интеллект'],['wis','Мудрость'],['cha','Харизма']].map(([key, label]) => <label key={key}>{label}<input aria-label={label} type="number" min="1" max="30" value={game.abilities?.[key] ?? 10} onChange={e => { const score = Number(e.target.value); if (Number.isInteger(score) && score >= 1 && score <= 30) setGame(current => ({ ...current, abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...current.abilities, [key]: score } })); }}/></label>)}</div><label>Инвентарь<textarea rows={5} value={game.inventory || ''} maxLength={100000} onChange={e => setGame(current => ({ ...current, inventory: e.target.value }))}/></label><label>Подготовленные заклинания — по одному в строке<textarea rows={5} value={(game.spells || []).join('\n')} onChange={e => setGame(current => ({ ...current, spells: e.target.value.split('\n') }))}/></label><label>Книга заклинаний — по одному в строке<textarea rows={5} value={(game.spellBook || []).join('\n')} onChange={e => setGame(current => ({ ...current, spellBook: e.target.value.split('\n') }))}/></label></section>}
        {section === 'character' && <section className="panel"><div className="panel-title">Боевые показатели<span>ВРУЧНУЮ</span></div><div className="stats-inputs">
          <label>Текущие ХП<input type="number" min="0" max={game.maxHp} value={game.hp} onChange={e => stat('hp', e.target.value)}/></label>
          <label>Максимум ХП<input type="number" min="1" value={game.maxHp} onChange={e => stat('maxHp', e.target.value)}/></label>
          <label>Класс доспеха<input type="number" min="0" value={game.ac} onChange={e => stat('ac', e.target.value)}/></label>
        </div><div className="hp-actions"><button onClick={() => stat('hp', String(Math.max(0, game.hp - 1)))}>−1 ХП</button><div className="hp-track"><div style={{ width: `${100 * game.hp / game.maxHp}%` }}/></div><button onClick={() => stat('hp', String(Math.min(game.maxHp, game.hp + 1)))}>+1 ХП</button></div>
        <button onClick={onSettings}>Настроить сердце и щит</button>
        </section>}
        {section === 'notes' && <section className="panel notes"><div className="panel-title">Заметки и способности<span>ЛИЧНОЕ</span></div><div className="tabs"><button className={tab === 'edit' ? 'active' : ''} onClick={() => setTab('edit')}>Редактор</button><button className={tab === 'preview' ? 'active' : ''} onClick={() => { setTab('preview'); setRevealed([]); }}>Просмотр</button></div>
          {tab === 'edit' ? <><div className="toolbar"><button onClick={() => addBlock('text')}>+ Текст</button><button onClick={() => addBlock('details')}>⌄ Раскрывашка</button><button onClick={() => addBlock('spoiler')}>◈ Спойлер</button></div><div className="blocks">{game.blocks.map((block, index) => <div className="edit-block" key={block.id}><div className="block-top"><label className="sr-only" htmlFor={`kind-${block.id}`}>Тип блока {index + 1}</label><select id={`kind-${block.id}`} value={block.kind} onChange={e => updateBlock(block.id, { kind: e.target.value as Block['kind'] })}><option value="text">Текст</option><option value="details">Раскрывающийся блок</option><option value="spoiler">Спойлер</option></select><button aria-label={`Удалить блок ${index + 1}`} onClick={() => setGame(current => ({ ...current, blocks: current.blocks.filter(b => b.id !== block.id) }))}>×</button></div><input aria-label={`Заголовок блока ${index + 1}`} placeholder="Заголовок" value={block.title} onChange={e => updateBlock(block.id, { title: e.target.value })}/><textarea aria-label={`Текст блока ${index + 1}`} placeholder="Текст заметки…" value={block.text} onChange={e => updateBlock(block.id, { text: e.target.value })}/></div>)}</div></> : <div className="preview">{game.blocks.length === 0 && <p>Пока нет заметок. Добавьте блок в редакторе.</p>}{game.blocks.map(block => block.kind === 'details' ? <details key={block.id}><summary>{block.title || 'Подробнее'}</summary><p>{block.text}</p></details> : block.kind === 'spoiler' ? <div className="spoiler" key={block.id}><button aria-expanded={revealed.includes(block.id)} onClick={() => setRevealed(current => current.includes(block.id) ? current.filter(id => id !== block.id) : [...current, block.id])}>◈ {block.title || 'Спойлер'} <span>{revealed.includes(block.id) ? 'Скрыть' : 'Показать'}</span></button>{revealed.includes(block.id) && <p>{block.text}</p>}</div> : <article key={block.id}><h3>{block.title}</h3><p>{block.text}</p></article>)}</div>}
        </section>}
      </aside>
    </main>
  </div>;
}
function CharacterApp() {
  return <WorkspaceShell>{props => <App key={props.characterId} icons={props.icons} onSettings={props.onSettings} character={props.character} roster={props.roster} onSelect={props.onSelect} game={props.game} setGame={props.onGame} section={props.section}/>}</WorkspaceShell>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><CharacterApp/></React.StrictMode>);
