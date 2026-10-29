import React, { useEffect, useState } from 'react';
import { copyText } from './ui';
import QRCode from 'qrcode';
import type { NetworkView, Workspace } from './contracts';

export function Connections({ workspace, api }: { workspace: Workspace; api: <T>(path: string, options?: RequestInit) => Promise<T> }) {
  const [network, setNetwork] = useState<NetworkView | null>(null);
  const [address, setAddress] = useState('');
  const [role, setRole] = useState('player');
  const [label, setLabel] = useState('');
  const [hours, setHours] = useState(8);
  const [projectId, setProjectId] = useState(workspace.activeId);
  const [link, setLink] = useState('');
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { let alive = true; void api<NetworkView>('/api/network').then(value => { if (!alive) return; setNetwork(value); setAddress(value.address || value.interfaces[0]?.address || ''); }).catch(err => { if (alive) setError(err.message); }); return () => { alive = false; }; }, [api]);
  // While the network is on, a TV waiting at /tv shows up here within a few seconds.
  useEffect(() => { if (!network?.enabled) return; const timer = setInterval(() => { void api<NetworkView>('/api/network').then(setNetwork).catch(() => {}); }, 3000); return () => clearInterval(timer); }, [api, network?.enabled]);
  useEffect(() => { let alive = true; setCopied(false); if (!link) { setQr(''); return; } void QRCode.toDataURL(link, { width: 256, margin: 2, errorCorrectionLevel: 'M' }).then(value => { if (alive) setQr(value); }).catch(() => setError('Не удалось создать QR-код')); return () => { alive = false; }; }, [link]);
  async function post(path: string, value: unknown) {
    setBusy(true); setError('');
    try { const data = await api<NetworkView>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }); setNetwork(data); if (data.link) setLink(data.link); else if (path === '/api/network' || path.endsWith('/revoke')) setLink(''); }
    catch (err) { setError(err instanceof Error ? err.message : 'Ошибка подключения'); }
    finally { setBusy(false); }
  }
  return <div className="connections-editor">{error && <p role="alert" className="error-banner">{error}</p>}<div className="settings-grid"><section className="editor-card"><h2>Локальная сеть</h2><p>Компьютер и телефоны должны быть в одной доверенной Wi-Fi сети. Подключение использует HTTP.</p><label>Сетевой интерфейс<select disabled={busy} value={address} onChange={e => setAddress(e.target.value)}>{network?.interfaces.map(item => <option key={item.address} value={item.address}>{item.name} · {item.address}</option>)}</select></label><button className="primary" disabled={busy || !address} onClick={() => void post('/api/network', { enabled: !network?.enabled, address })}>{network?.enabled ? 'Выключить сетевые подключения' : 'Включить локальную сеть'}</button>{network?.enabled && <p>Сервер запущен: {network.url}</p>}{network && !network.interfaces.length && <p>Не найден частный IPv4-адрес. Подключите компьютер к локальной сети.</p>}<p>Если телефон не подключается, проверьте одну Wi-Fi сеть, гостевую изоляцию роутера и разрешение Arcane Table в брандмауэре Windows.</p></section>
    <section className="editor-card"><h2>Приглашение</h2><label>Роль<select value={role} onChange={e => setRole(e.target.value)}><option value="player">Игрок — только свой персонаж</option><option value="master">Мастер — управление кампанией</option><option value="display">Экран — только презентация</option></select></label><label>Название подключения<input aria-label="Имя подключения" value={label} maxLength={100} onChange={e => setLabel(e.target.value)} placeholder="Например, Алексей"/></label>{role === 'player' && <label>Кампания игрока<select value={projectId} onChange={e => setProjectId(e.target.value)}>{workspace.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>}<label>Действует<select value={hours} onChange={e => setHours(Number(e.target.value))}>{[1,4,8,24,72,168].map(value => <option key={value} value={value}>{value} ч.</option>)}</select></label><button disabled={busy || !network?.enabled || !label.trim()} onClick={() => void post('/api/connections/create', { role, label, hours, projectId })}>Создать ссылку и QR</button></section></div>
    {link && <section className="editor-card invitation-card"><div>{qr && <img src={qr} width="256" height="256" alt="QR-код приглашения"/>}</div><div><h2>Откройте на устройстве</h2><p>Эта ссылка даёт выбранную роль. Передайте её нужному участнику; доступ можно отозвать ниже.</p><input aria-label="Ссылка приглашения" readOnly value={link}/><button onClick={() => { void copyText(link).then(() => setCopied(true)).catch(() => setError('Скопируйте ссылку из поля вручную')); }}>{copied ? 'Скопировано' : 'Скопировать ссылку'}</button></div></section>}
    {network && <TvConnect network={network} busy={busy} post={post}/>}
    {network && <SharedInvite network={network} workspace={workspace} busy={busy} post={post}/>}
    <section className="editor-card"><div className="section-heading"><h2>Устройства и доступ</h2><button disabled={busy} onClick={() => { void api<NetworkView>('/api/network').then(setNetwork).catch(err => setError(err.message)); }}>Обновить статус</button></div>{network?.connections.length === 0 && <p>Создайте отдельное приглашение для каждого игрока.</p>}<div className="connection-list">{network?.connections.map(item => <div key={item.id}><div><strong>{item.label}</strong><p>{item.role === 'player' ? 'Игрок' : item.role === 'master' ? 'Мастер' : 'Экран'} · {item.active ? item.online ? 'В сети' : 'Ожидает подключения' : 'Доступ завершён'}</p>{item.playerName && <p>{item.playerName} {item.characterId ? `· ${item.characterId}` : ''}</p>}<small>До {new Date(item.expiresAt).toLocaleString('ru-RU')}</small></div><div className="action-row">{item.characterId && <button disabled={busy || !item.active} onClick={() => void post('/api/connections/release', { id: item.id })}>Освободить персонажа</button>}<button disabled={busy || !item.active} onClick={() => void post('/api/connections/revoke', { id: item.id })}>Отозвать доступ</button></div></div>)}</div></section></div>;
}

// A TV gets the short address: it shows a 4-digit code, the master compares it and connects the screen.
function TvConnect({ network, busy, post }: { network: NetworkView; busy: boolean; post: (path: string, value: unknown) => Promise<void> }) {
  const waiting = network.tvPairs || [];
  return <section className="editor-card tv-connect">
    <h2>Телевизор</h2>
    {!network.enabled ? <p className="ui-note">Сначала включите локальную сеть выше.</p> : <>
      <p>Откройте в браузере телевизора короткий адрес. На экране появится код из четырёх цифр — подключите его здесь.</p>
      <p className="tv-connect-address">{network.url.replace('http://', '')}/tv</p>
      {waiting.length === 0 ? <p className="ui-note">Пока никто не ждёт подключения.</p> : <div className="tv-connect-list">{waiting.map(pair => <div key={pair.id}>
        <strong>{pair.code}</strong>
        <button className="primary" disabled={busy} onClick={() => void post('/api/connections/tv-approve', { id: pair.id })}>Подключить экран</button>
        <button disabled={busy} onClick={() => void post('/api/connections/tv-reject', { id: pair.id })}>Отклонить</button>
      </div>)}</div>}
    </>}
  </section>;
}

// One QR for the whole table, shown in the corner of the shared screen. Each phone that scans it gets its own player link.
function SharedInvite({ network, workspace, busy, post }: { network: NetworkView; workspace: Workspace; busy: boolean; post: (path: string, value: unknown) => Promise<void> }) {
  const invite = network.invite;
  const [projectId, setProjectId] = useState(invite?.projectId || workspace.activeId);
  const [hours, setHours] = useState(8);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => { let alive = true; setCopied(false); if (!invite) { setQr(''); return; } void QRCode.toDataURL(invite.link, { width: 220, margin: 2, errorCorrectionLevel: 'M' }).then(value => { if (alive) setQr(value); }).catch(() => {}); return () => { alive = false; }; }, [invite?.link]);
  return <section className="editor-card shared-invite">
    <div className="section-heading"><h2>Общий QR на экране</h2>{invite && <span className={invite.shown ? 'shared-invite-state on' : 'shared-invite-state'}>{invite.shown ? 'Показан на экране' : 'Скрыт'}</span>}</div>
    <p>Один код для всего стола: игроки сканируют его с общего экрана, каждый телефон получает свою ссылку и выбирает героя. Отдельные подключения появятся ниже, их можно отозвать по одному.</p>
    {!network.enabled ? <p className="ui-note">Сначала включите локальную сеть выше.</p> : <>
      <div className="settings-grid"><label>Кампания<select value={projectId} onChange={e => setProjectId(e.target.value)}>{workspace.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label>Действует<select value={hours} onChange={e => setHours(Number(e.target.value))}>{[1, 4, 8, 24, 72, 168].map(value => <option key={value} value={value}>{value} ч.</option>)}</select></label></div>
      <div className="action-row">
        <button className="primary" disabled={busy} onClick={() => void post('/api/connections/invite', { projectId, hours })}>{invite ? 'Создать новый QR' : 'Создать и показать на экране'}</button>
        {invite && <button disabled={busy} onClick={() => void post('/api/connections/invite-show', { shown: !invite.shown })}>{invite.shown ? 'Скрыть с экрана' : 'Показать на экране'}</button>}
        {invite && <button className="danger" disabled={busy} onClick={() => void post('/api/connections/revoke', { id: invite.id })}>Отозвать</button>}
      </div>
      {invite && <div className="invitation-card">{qr && <img src={qr} width="220" height="220" alt="Общий QR-код"/>}<div>
        <p>Подключилось устройств: <strong>{invite.uses}</strong> · действует до {new Date(invite.expiresAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
        <input aria-label="Общая ссылка" readOnly value={invite.link}/>
        <button onClick={() => void copyText(invite.link).then(() => setCopied(true)).catch(() => {})}>{copied ? 'Скопировано' : 'Скопировать ссылку'}</button>
      </div></div>}
    </>}
  </section>;
}
