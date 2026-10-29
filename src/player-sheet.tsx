import React, { useState } from 'react';
import { newId, type Ability, type Feature, type Game, type InventoryItem } from './contracts';
import type { PlayerPost } from './player-combat';
import { AbilityGrid, FeatureList } from './editors';
import { SkillsEditor } from './stat-pickers';
import { effectiveStats, proficiency } from './library';
import { Modal, Section, SheetPanel, SheetTabs, confirmAction } from './ui';
import { SheetOverview, coinLabels } from './hero-sheet';

type PlayerTab = 'main' | 'skills' | 'features' | 'purse';

// The player's sheet editor, opened from the pencil on the hero tab. Attacks and spells live on their own tab.
// Simple fields stay uncontrolled form inputs, structured parts live in local state until «Сохранить лист».
export function PlayerSheet({ game, busy, post, catalog = [], onClose }: { game: Game; busy: boolean; post: PlayerPost; catalog?: InventoryItem[]; onClose: () => void }) {
  const [tab, setTab] = useState<PlayerTab>('main');
  const [dirty, setDirty] = useState(false);
  const [abilities, setAbilities] = useState<Record<string, number>>({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...game.abilities });
  const [saves, setSaves] = useState<Ability[]>(game.saves || []);
  const [skills, setSkills] = useState(game.skills || '');
  const [features, setFeatures] = useState<Feature[]>(game.features || []);
  const [level, setLevel] = useState(game.level || 1);
  const [speed, setSpeed] = useState(game.speed ?? 30);
  const [initiative, setInitiative] = useState(game.initiative);
  const pb = proficiency(level);
  const coins = game.coins || {};
  const tabs = [
    { value: 'main' as const, label: 'Основа' },
    { value: 'skills' as const, label: 'Навыки' },
    { value: 'features' as const, label: 'Умения', count: features.length },
    { value: 'purse' as const, label: 'Кошелёк' }
  ];
  const close = () => { if (!dirty || confirmAction('Закрыть без сохранения? Изменения листа пропадут.')) onClose(); };
  return <Modal wide title="Лист персонажа" subtitle={`D&D ${game.edition || '2024'} · хиты и КД меняет мастер`} onClose={close}
    footer={<><span className={dirty ? 'player-sheet-state dirty' : 'player-sheet-state'}>{dirty ? 'Не сохранено' : 'Без изменений'}</span><span className="spacer"/><button type="button" onClick={close}>Отмена</button><button type="submit" form="player-sheet-form" className="primary player-sheet-save" disabled={busy}>Сохранить лист</button></>}>
    <div className="player-sheet">
      <SheetOverview level={level} pb={pb} stats={effectiveStats({ abilities, ac: game.ac, speed, initiative, items: game.items }, catalog)}/>
      <SheetTabs label="Разделы листа" value={tab} tabs={tabs} onChange={setTab}/>
      <form id="player-sheet-form"
        onInput={() => setDirty(true)} onClick={e => { if ((e.target as Element).closest('button[type=button]')) setDirty(true); }}
        onSubmit={async e => {
          e.preventDefault(); const form = new FormData(e.currentTarget);
          const number = (key: string, fallback: number) => { const value = Number(form.get(key)); return Number.isFinite(value) ? Math.floor(value) : fallback; };
          const initiativeText = String(form.get('initiative') ?? '').trim();
          const updated = { level: Math.min(20, Math.max(1, number('level', 1))), race: String(form.get('race')), className: String(form.get('className')), speed: Math.max(0, number('speed', 30)), abilities, saves, skills, features,
            ...(initiativeText !== '' ? { initiative: Math.max(-50, Math.min(50, number('initiative', 0))) } : {}),
            coins: Object.fromEntries(['pp', 'gp', 'ep', 'sp', 'cp'].map(key => [key, Math.max(0, number(key, 0))])),
            inventory: String(form.get('inventory')) };
          if (await post('/api/player/command', { id: newId(), type: 'player.update', sheet: updated })) onClose();
        }}>
        <SheetPanel active={tab === 'main'} hint="Отметьте спасброски, которыми владеете.">
          <div className="player-sheet-grid">
            <label className="ui-field"><span className="ui-label">Уровень</span><input name="level" type="number" min="1" max="20" required defaultValue={game.level || 1} onChange={e => setLevel(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}/></label>
            <label className="ui-field"><span className="ui-label">Скорость</span><input name="speed" type="number" min="0" max="10000" required defaultValue={game.speed ?? 30} onChange={e => setSpeed(Number(e.target.value) || 0)}/></label>
            <label className="ui-field"><span className="ui-label">Инициатива</span><input name="initiative" type="number" min="-50" max="50" placeholder="Ловк." defaultValue={game.initiative ?? ''} onChange={e => setInitiative(e.target.value.trim() === '' ? undefined : Number(e.target.value))}/></label>
            <label className="ui-field wide"><span className="ui-label">Раса / вид</span><input name="race" maxLength={200} defaultValue={game.race || ''}/></label>
            <label className="ui-field wide"><span className="ui-label">Класс</span><input name="className" maxLength={200} defaultValue={game.className || ''}/></label>
          </div>
          <Section title="Характеристики и спасброски"><AbilityGrid value={abilities} onChange={setAbilities} saves={saves} onSaves={setSaves} saveBonus={pb}/></Section>
        </SheetPanel>
        <SheetPanel active={tab === 'skills'}><SkillsEditor value={skills} scores={abilities} pb={pb} onChange={setSkills} extraLabel="Владения: доспехи, оружие, инструменты"/></SheetPanel>
        <SheetPanel active={tab === 'features'} hint="Классовые умения, черты и особенности вида."><FeatureList title="Умения и черты" value={features} onChange={setFeatures} empty="Например: «Второе дыхание», «Тёмное зрение»."/></SheetPanel>
        <SheetPanel active={tab === 'purse'} hint="Сами предметы — во вкладке «Вещи».">
          <Section title="Монеты"><div className="coin-row">{(['pp', 'gp', 'ep', 'sp', 'cp'] as const).map(key => <label className="ui-field" key={key}><span className="ui-label">{coinLabels[key]}</span><input name={key} type="number" min="0" max="100000000" defaultValue={coins[key] ?? 0}/></label>)}</div></Section>
          <label className="ui-field"><span className="ui-label">Заметки об инвентаре</span><textarea name="inventory" maxLength={100000} rows={4} defaultValue={game.inventory || ''}/></label>
        </SheetPanel>
      </form>
    </div>
  </Modal>;
}

// Notes the master wrote for this hero; the player may edit titles and texts.
export function PlayerNotesEditor({ game, busy, post }: { game: Game; busy: boolean; post: PlayerPost }) {
  if (!game.blocks.length) return null;
  return <details className="editor-card player-sheet player-notes-edit"><summary>Редактировать заметки</summary>
      <form className="player-notes-form" key={JSON.stringify(game.blocks)} onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); const blocks = game.blocks.map((b, i) => ({ ...b, title: String(data.get(`title-${i}`)), text: String(data.get(`text-${i}`)) })); void post('/api/player/command', { id: newId(), type: 'player.update', blocks }); }}>
        {game.blocks.map((block, index) => <label key={block.id}><input aria-label={`Заголовок заметки ${index + 1}`} name={`title-${index}`} maxLength={500} defaultValue={block.title}/><textarea aria-label={`Текст заметки ${index + 1}`} name={`text-${index}`} maxLength={50000} rows={4} defaultValue={block.text}/></label>)}
        <button className="primary" disabled={busy}>Сохранить заметки</button>
      </form>
  </details>;
}
