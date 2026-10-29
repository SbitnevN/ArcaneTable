import React, { useEffect, useState } from 'react';

// The TV opens the short address /tv instead of a long link: it shows a code, the master confirms it
// in «Подключения», and the TV switches to the shared screen with its own link.
async function post<T>(path: string, value: unknown): Promise<T> {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Нет связи с Arcane Table');
  return data as T;
}

export function TvPairing() {
  const [pair, setPair] = useState<{ id: string; secret: string; code: string } | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true; setError(''); setPair(null);
    void post<{ id: string; secret: string; code: string }>('/api/tv/pair', {}).then(value => { if (alive) setPair(value); }).catch(err => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [attempt]);
  useEffect(() => {
    if (!pair) return;
    const timer = setInterval(() => {
      void post<{ token?: string }>('/api/tv/status', { id: pair.id, secret: pair.secret })
        .then(value => { if (value.token) { clearInterval(timer); location.replace(`/?join=${value.token}`); } })
        .catch(err => { clearInterval(timer); setError(err.message); });
    }, 2000);
    return () => clearInterval(timer);
  }, [pair]);
  return <main className="tv-pairing">
    <span className="tv-pairing-kicker">Arcane Table · общий экран</span>
    {error ? <><p className="tv-pairing-error">{error}</p><button onClick={() => setAttempt(value => value + 1)}>Получить новый код</button></>
      : pair ? <><p>Код подключения</p><strong className="tv-pairing-code">{pair.code}</strong><p>На компьютере мастера откройте «Подключения» и нажмите «Подключить» у этого кода.</p></>
      : <p>Получаю код…</p>}
  </main>;
}
