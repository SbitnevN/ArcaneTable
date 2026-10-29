import React, { useEffect, useRef, useState } from 'react';

export function Modal({ title, subtitle, onClose, children, footer, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const element = dialog.current; if (!element) return;
    if (!element.open) element.showModal();
    const cancel = (event: Event) => { event.preventDefault(); close.current(); };
    element.addEventListener('cancel', cancel);
    return () => element.removeEventListener('cancel', cancel);
  }, []);
  return <dialog ref={dialog} className={wide ? 'ui-modal wide' : 'ui-modal'} aria-labelledby="ui-modal-title" onMouseDown={event => { if (event.target === dialog.current) onClose(); }}>
    <div className="ui-modal-frame">
      <header><div><h2 id="ui-modal-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button type="button" className="ui-icon-button" aria-label="Закрыть" onClick={onClose}>×</button></header>
      <div className="ui-modal-body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </div>
  </dialog>;
}

export function Field({ label, hint, children, wide = false }: { label: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={wide ? 'ui-field wide' : 'ui-field'}><span className="ui-label">{label}</span>{children}{hint && <small className="ui-hint">{hint}</small>}</label>;
}

export function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return <section className="ui-section"><div className="ui-section-title"><h3>{title}</h3>{aside}</div>{children}</section>;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string; icon?: React.ReactNode }[]; onChange: (value: T) => void; label: string }) {
  return <div className="ui-segmented" role="radiogroup" aria-label={label}>{options.map(option => <button type="button" role="radio" aria-checked={value === option.value} key={option.value} className={value === option.value ? 'active' : ''} onClick={() => onChange(option.value)}>{option.icon && <span aria-hidden="true">{option.icon}</span>}{option.label}</button>)}</div>;
}

export type SheetTab<T extends string> = { value: T; label: string; count?: number };
export function SheetTabs<T extends string>({ value, tabs, onChange, label }: { value: T; tabs: SheetTab<T>[]; onChange: (value: T) => void; label: string }) {
  return <div className="sheet-tabs" role="tablist" aria-label={label}>{tabs.map(tab => <button type="button" role="tab" key={tab.value} aria-selected={value === tab.value} className={value === tab.value ? 'active' : ''} onClick={() => onChange(tab.value)}>{tab.label}{tab.count ? <small>{tab.count}</small> : null}</button>)}</div>;
}

// Panels stay mounted while hidden so form fields and derived values (skills text) keep working across tabs.
export function SheetPanel({ active, hint, children }: { active: boolean; hint?: string; children: React.ReactNode }) {
  return <div className="sheet-panel" role="tabpanel" hidden={!active}>{hint && <p className="sheet-hint">{hint}</p>}{children}</div>;
}

export function Dropzone({ accept, onFile, children, disabled }: { accept: string; onFile: (file: File) => void; children: React.ReactNode; disabled?: boolean }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return <div className={over ? 'ui-dropzone over' : 'ui-dropzone'} role="button" tabIndex={disabled ? -1 : 0} aria-disabled={disabled}
    onClick={() => { if (!disabled) input.current?.click(); }}
    onKeyDown={event => { if (!disabled && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); input.current?.click(); } }}
    onDragOver={event => { event.preventDefault(); if (!disabled) setOver(true); }} onDragLeave={() => setOver(false)}
    onDrop={event => { event.preventDefault(); setOver(false); const file = event.dataTransfer.files[0]; if (file && !disabled) onFile(file); }}>
    {children}
    <input ref={input} type="file" hidden accept={accept} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onFile(file); }}/>
  </div>;
}

export function confirmAction(text: string) { return window.confirm(text); }

// Electron denies the async Clipboard API unless permitted, so fall back to a hidden textarea and execCommand.
export async function copyText(value: string): Promise<void> {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); return; } } catch { /* Use the fallback below. */ }
  const area = document.createElement('textarea');
  area.value = value; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0'; area.style.pointerEvents = 'none';
  (document.querySelector('dialog[open]') || document.body).appendChild(area);
  area.select();
  const copied = document.execCommand('copy');
  area.remove();
  if (!copied) throw new Error('Не удалось скопировать');
}
