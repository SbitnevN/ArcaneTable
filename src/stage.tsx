import React, { useEffect, useRef, useState } from 'react';
import { characters, defaultLayout, defaultHandLayout, type Layout, type PublicView, type Scene } from './contracts';
import { TableCard } from './table-card';

// Plays a short star + location name reveal whenever the shown scene changes (not on first render).
export function LocationReveal({ scene }: { scene: Scene | null }) {
  const previous = useRef(scene?.id);
  const [shown, setShown] = useState<{ key: number; name: string } | null>(null);
  useEffect(() => {
    if (previous.current === scene?.id) return;
    previous.current = scene?.id;
    if (!scene) return;
    setShown({ key: Date.now(), name: scene.name });
    const timer = setTimeout(() => setShown(null), 3300);
    return () => clearTimeout(timer);
  }, [scene?.id]);
  if (!shown) return null;
  return <div className="location-reveal" key={shown.key} role="status"><span className="location-reveal-star" aria-hidden="true">✦</span><span className="location-reveal-line" aria-hidden="true"/><span className="location-reveal-name">{shown.name}</span></div>;
}

export function SceneMedia({ scene, layout }: { scene: Scene | null; layout: Layout }) {
  const [error, setError] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => { setError(''); }, [scene?.url]);
  if (!scene) return null;
  const style: React.CSSProperties = { transform: `translate(${layout.x - 50}%, ${layout.y - 50}%) scale(${layout.scale})` };
  return <>{scene.type === 'video' ? <video key={scene.url} ref={video} className="scene-media" style={style} src={scene.url} autoPlay muted loop playsInline onError={() => setError('Браузер не поддерживает кодек видео или файл повреждён')} onLoadedData={() => { void video.current?.play().catch(() => setError('Нажмите, чтобы запустить видео')); }}/>
    : <img className="scene-media" style={style} src={scene.url} alt="" onError={() => setError('Не удалось загрузить изображение')}/>}
    {error && <button className="media-error" onClick={() => { void video.current?.play().then(() => setError('')).catch(() => setError('Не удалось воспроизвести видео: проверьте кодек')); }}>{error}</button>}</>;
}
export function StageCanvas({ view, edit = false, onLayout }: { view: PublicView; edit?: boolean; onLayout?: (layout: Layout, target: string) => void }) {
  const [layout, setLayout] = useState(view.layout);
  const [background, setBackground] = useState(view.background);
  const [target, setTarget] = useState('card');
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; layout: Layout; target: string } | null>(null);
  const latest = useRef({ layout, background }); latest.current = { layout, background };
  useEffect(() => setLayout(view.layout), [view.layout.scale, view.layout.x, view.layout.y]);
  useEffect(() => setBackground(view.background), [view.background.scale, view.background.x, view.background.y]);
  const character = view.character || characters.find(item => item.id === view.characterId)!;
  const party = view.party || (character ? [{ id: character.id, name: character.name, side: 'ally' as const, characterId: character.id, portrait: character, hp: view.hp, ac: view.ac, initiative: 0, statuses: [] }] : []);
  const value = target === 'card' ? layout : background;
  function update(next: Layout) { if (target === 'card') setLayout(next); else setBackground(next); }
  function save() { onLayout?.(target === 'card' ? latest.current.layout : latest.current.background, target); }
  return <div className={edit ? 'stage-editor' : 'stage-display'}>
    {edit && <div className="layout-tools"><label>Объект<select value={target} onChange={e => setTarget(e.target.value)}><option value="card">Рука игроков</option><option value="background">Фон стола</option></select></label>
      {(['scale', 'x', 'y'] as const).map(key => <label key={key}>{key === 'scale' ? 'Масштаб' : key === 'x' ? 'По горизонтали' : 'По вертикали'} · {key === 'scale' ? Math.round(value[key] * 100) : Math.round(value[key])}%<input aria-label={key === 'scale' ? 'Масштаб' : key === 'x' ? 'По горизонтали' : 'По вертикали'} type="range" min={key === 'scale' ? 0.3 : 0} max={key === 'scale' ? 3 : 100} step={key === 'scale' ? 0.01 : 1} value={value[key]} onChange={e => update({ ...value, [key]: Number(e.target.value) })} onPointerUp={save} onKeyUp={save} onBlur={save}/></label>)}
      <button onClick={() => { const reset = target === 'card' ? defaultHandLayout : defaultLayout; update({ ...reset }); onLayout?.({ ...reset }, target); }}>Сбросить положение</button><span>Перетащите выбранный объект в предпросмотре</span></div>}
    <div className="canvas card-table" ref={surface} onPointerDown={e => {
      if (!edit || e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
      const isCard = Boolean((e.target as HTMLElement).closest('.table-party'));
      if ((target === 'card') !== isCard) return;
      e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { x: e.clientX, y: e.clientY, layout: { ...value }, target };
    }} onPointerMove={e => {
      const start = drag.current; if (!start || !surface.current) return;
      const rect = surface.current.getBoundingClientRect();
      const next = { ...start.layout, x: Math.max(0, Math.min(100, start.layout.x + (e.clientX - start.x) / rect.width * 100)), y: Math.max(0, Math.min(100, start.layout.y + (e.clientY - start.y) / rect.height * 100)) };
      if (start.target === 'card') setLayout(next); else setBackground(next);
    }} onPointerUp={() => { if (drag.current) { onLayout?.(drag.current.target === 'card' ? latest.current.layout : latest.current.background, drag.current.target); drag.current = null; } }} onPointerCancel={() => { drag.current = null; setLayout(view.layout); setBackground(view.background); }}>
      <SceneMedia scene={view.scene} layout={background}/>
      <div className="table-vignette"/>
      <LocationReveal scene={view.scene}/>
      <section className="table-party" style={{ left: `${layout.x}%`, top: `${layout.y}%`, transform: `translate(-50%, -50%) scale(${layout.scale})` }}>
        <div className="table-hand" aria-label="Герои игроков">{party.map(item => <TableCard key={item.id} item={item}/>)}</div><span className="table-side-label">РУКА ИГРОКОВ</span>
      </section>
    </div>
  </div>;
}
