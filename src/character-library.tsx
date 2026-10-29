import React, { useMemo, useState } from 'react';
import type { Command, Project } from './contracts';
import { Field, Modal, Section, confirmAction, copyText } from './ui';
import { Icon } from './icons';
import { characterJsonPrompt, exportCharacterJson, isLssJson, parseCharacterJson, type CharacterImport } from './character-import';
import { effectGroup, effectText, itemEffects } from './library';

type Props = { project: Project; command: (type: string, extra?: Partial<Command>) => void; busy: boolean; portrait: (file: File) => Promise<void>; importCharacter: (body: Blob | string) => Promise<boolean>; exportCharacter: () => Promise<void> };

export function CharacterLibrary({ project, command, busy, portrait, importCharacter, exportCharacter }: Props) {
  const [dialog, setDialog] = useState<'create' | 'edit' | 'import' | null>(null);
  const selected = project.characters.find(item => item.id === project.selectedCharacter)!;
  return <section className="editor-card hero-roster">
    <div className="section-heading"><h2>Герои проекта</h2><div className="action-row"><button type="button" className="ui-button small" disabled={busy} onClick={() => setDialog('import')}><Icon name="upload"/>Импорт персонажа</button><button type="button" className="primary" disabled={busy} onClick={() => setDialog('create')}>＋ Новый герой</button></div></div>
    <div className="hero-strip">{project.characters.map(item => { const game = project.games[item.id]; return <button type="button" key={item.id} className={item.id === selected.id ? 'hero-tile selected' : 'hero-tile'} aria-pressed={item.id === selected.id} onClick={() => command('character.select', { characterId: item.id })}>
      <img src={item.image} alt="" draggable={false}/>
      <span><strong>{item.name}</strong><small>{[game?.className, game?.level ? `ур. ${game.level}` : ''].filter(Boolean).join(' · ') || item.caption}</small><small><Icon name="heart" size={11}/>{game?.hp}/{game?.maxHp} <Icon name="shield" size={11}/>{game?.ac}</small></span>
    </button>; })}</div>
    <div className="hero-roster-actions"><span className="ui-note">Редактируется: <strong>{selected.name}</strong></span><button type="button" disabled={busy} onClick={() => setDialog('edit')}><Icon name="edit"/>Имя, подпись и портрет</button><button type="button" disabled={busy} onClick={() => download(exportCharacterJson(selected, project.games[selected.id], { items: project.items || [], weapons: project.weapons || [] }, project.spells || []), `${selected.name}.arcane.json`)}><Icon name="download"/>Экспорт JSON</button><button type="button" disabled={busy} onClick={() => void exportCharacter()}><Icon name="download"/>Экспорт в Long Story Short</button></div>
    {dialog === 'create' && <CreateHero busy={busy} onClose={() => setDialog(null)} onCreate={name => { command('character.create', { name }); setDialog(null); }}/>}
    {dialog === 'import' && <ImportHero project={project} busy={busy} onClose={() => setDialog(null)} onImport={async body => { if (await importCharacter(body)) setDialog(null); }}/>}
    {dialog === 'edit' && <EditHero key={selected.id} project={project} busy={busy} command={command} portrait={portrait} onClose={() => setDialog(null)}/>}
  </section>;
}

function CreateHero({ busy, onClose, onCreate }: { busy: boolean; onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState('');
  return <Modal title="Новый герой" subtitle="Портрет и лист можно заполнить сразу после создания" onClose={onClose}
    footer={<><span className="spacer"/><button type="button" onClick={onClose}>Отмена</button><button type="button" className="primary" disabled={busy || !name.trim()} onClick={() => onCreate(name.trim())}>Создать героя</button></>}>
    <form onSubmit={e => { e.preventDefault(); if (name.trim()) onCreate(name.trim()); }}><Field label="Имя"><input autoFocus aria-label="Имя нового персонажа" value={name} maxLength={100} placeholder="Например, Торин Дубощит" onChange={e => setName(e.target.value)}/></Field></form>
  </Modal>;
}

function EditHero({ project, busy, command, portrait, onClose }: { project: Project; busy: boolean; command: Props['command']; portrait: Props['portrait']; onClose: () => void }) {
  const hero = project.characters.find(item => item.id === project.selectedCharacter)!;
  const [name, setName] = useState(hero.name);
  const [caption, setCaption] = useState(hero.caption);
  const [subtitle, setSubtitle] = useState(hero.subtitle);
  function save() {
    if (!name.trim()) return;
    command('character.metadata', { characterId: hero.id, character: { name: name.trim(), caption: caption.slice(0, 200), subtitle: subtitle.slice(0, 200) } });
    onClose();
  }
  return <Modal wide title="Карта героя" subtitle={hero.name} onClose={onClose}
    footer={<><button type="button" className="danger" disabled={busy || project.characters.length <= 1} onClick={() => { if (confirmAction(`Убрать героя «${hero.name}» из проекта? Лист будет удалён.`)) { command('character.delete', { characterId: hero.id }); onClose(); } }}>Удалить героя</button><span className="spacer"/><button type="button" onClick={onClose}>Отмена</button><button type="button" className="primary" disabled={busy || !name.trim()} onClick={save}>Сохранить</button></>}>
    <div className="hero-edit">
      <label className="hero-portrait-drop" title="Заменить портрет"><img src={hero.image} alt=""/><span><Icon name="image"/>Заменить портрет</span><input hidden disabled={busy} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void portrait(file); }}/></label>
      <div className="ui-grid">
        <Section title="На карте">
          <Field label="Имя"><input autoFocus aria-label="Новое имя персонажа" value={name} maxLength={100} onChange={e => setName(e.target.value)}/></Field>
          <Field label="Подпись" hint="Под картой: вид и класс"><input value={caption} maxLength={200} onChange={e => setCaption(e.target.value)}/></Field>
          <Field label="Девиз или короткое описание"><input value={subtitle} maxLength={200} onChange={e => setSubtitle(e.target.value)}/></Field>
        </Section>
        <p className="ui-note small">PNG, JPEG или WebP до 25 МБ. Лучше вертикальный портрет 2:3.</p>
      </div>
    </div>
  </Modal>;
}

function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename.replace(/[\\/:*?"<>|]/g, '_'); anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type Preview = { kind: 'lss' } | { kind: 'arcane'; result: CharacterImport } | { kind: 'error'; message: string };
// The same parser runs here for a preview and on the server for the real import.
function preview(text: string, project: Project): Preview {
  let value: unknown;
  try { value = JSON.parse(text.replace(/^\uFEFF/, '').replace(/^\s*```(?:json)?|```\s*$/g, '')); } catch { return { kind: 'error', message: 'Это не JSON. Проверьте, что ответ нейросети скопирован целиком.' }; }
  if (isLssJson(value)) return { kind: 'lss' };
  try { return { kind: 'arcane', result: parseCharacterJson(value, { edition: project.edition, library: { items: project.items || [], weapons: project.weapons || [] } }) }; }
  catch (error) { return { kind: 'error', message: error instanceof Error ? error.message : 'Не удалось прочитать персонажа' }; }
}

function ImportHero({ project, busy, onClose, onImport }: { project: Project; busy: boolean; onClose: () => void; onImport: (body: string) => void }) {
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);
  const result = useMemo(() => text.trim() ? preview(text, project) : null, [text, project]);
  const hero = result?.kind === 'arcane' ? result.result : null;
  const library = hero ? [...(project.items || []), ...hero.items] : [];
  return <Modal wide title="Импорт персонажа" subtitle="Файл Long Story Short, экспорт Arcane Table или ответ нейросети" onClose={onClose}
    footer={<><span className="spacer"/><button type="button" onClick={onClose}>Отмена</button><button type="button" className="primary" disabled={busy || !result || result.kind === 'error'} onClick={() => onImport(text)}>Импортировать</button></>}>
    <div className="import-sources">
      <label className="ui-button"><Icon name="upload"/>Выбрать JSON-файл<input hidden type="file" accept=".json,application/json" onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) setText(await file.text()); }}/></label>
      <span className="ui-note small">или вставьте ответ нейросети:</span>
    </div>
    <textarea className="import-text" aria-label="JSON персонажа" rows={8} value={text} placeholder='{ "name": "Торин", "class": "Воин", "level": 3, "abilities": { "str": 16 }, "items": [...] }' onChange={e => setText(e.target.value)}/>
    {result?.kind === 'error' && <p className="ui-error" role="alert">{result.message}</p>}
    {result?.kind === 'lss' && <p className="ui-note">Файл Long Story Short: будет импортирован через конвертер LSS.</p>}
    {hero && <div className="hero-import-preview">
      <div className="hero-import-head"><strong>{hero.character.name}</strong><span>{hero.character.caption} · ур. {hero.game.level}</span><span className="hero-import-numbers"><Icon name="heart" size={12}/>{hero.game.hp}/{hero.game.maxHp} <Icon name="shield" size={12}/>{hero.game.ac} · {hero.game.speed} фт.</span></div>
      <div className="hero-import-stats">{(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((key, index) => <span key={key}><small>{['СИЛ', 'ЛОВ', 'ТЕЛ', 'ИНТ', 'МДР', 'ХАР'][index]}</small><b>{hero.game.abilities?.[key]}</b></span>)}</div>
      <p className="ui-note small">Атак: {hero.game.attacks?.length || 0} · умений: {hero.game.features?.length || 0} · заклинаний: {(hero.game.spells?.length || 0) + (hero.game.spellBook?.length || 0)} · заметок: {hero.game.blocks.length}{hero.items.length + hero.weapons.length ? ` · в библиотеку добавится: ${hero.items.length + hero.weapons.length}` : ''}{hero.spells.length ? ` · своих заклинаний: ${hero.spells.length}` : ''}{hero.game.spellSlots ? ` · ячейки: ${hero.game.spellSlots.filter(slot => slot.max).map(slot => slot.max).join('/')}` : ''}</p>
      {(hero.game.items || []).length > 0 && <ul className="hero-import-items">{hero.game.items!.map(item => <li key={item.id}><span><strong>{item.name}</strong>{item.quantity > 1 ? ` ×${item.quantity}` : ''}{item.equipped && <small className="hero-import-equipped">экипирован</small>}</span>
        <span className="chip-row">{itemEffects(item, library).map((effect, index) => <span key={index} className={`effect-chip fx-${effectGroup(effect)}`}>{effectText(effect)}</span>)}</span></li>)}</ul>}
      {hero.warnings.length > 0 && <ul className="import-errors">{hero.warnings.map((line, index) => <li key={index}>{line}</li>)}</ul>}
    </div>}
    <details className="import-format"><summary>Формат для нейросети</summary><p className="ui-note small">Скопируйте инструкцию в нейросеть вместе с просьбой, например «эльфийка-следопыт 4 уровня с проклятым луком». Эффекты предметов заработают, когда предмет экипирован.</p><pre>{characterJsonPrompt}</pre><button type="button" className="ui-button small" onClick={() => void copyText(characterJsonPrompt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>{copied ? '✓ Скопировано' : 'Копировать инструкцию'}</button></details>
  </Modal>;
}
