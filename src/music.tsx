import React, { useEffect, useRef, useState } from 'react';
import type { Command, Workspace } from './contracts';

export function MusicEngine({ workspace, send, onStatus, enabled = true }: { enabled?: boolean; workspace: Workspace; send: (command: Omit<Command, 'id'>) => void; onStatus: (message: string) => void }) {
  const [owner, setOwner] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const retiring = useRef<HTMLAudioElement | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const fading = useRef(false);
  const latest = useRef({ workspace, send, onStatus }); latest.current = { workspace, send, onStatus };
  const music = workspace.music;
  const track = workspace.projects.find(p => p.id === music?.projectId)?.tracks.find(t => t.id === music?.trackId);
  useEffect(() => {
    if (!enabled) { setOwner(false); return; }
    let disposed = false; let release: (() => void) | undefined; let timer: ReturnType<typeof setTimeout>;
    function acquire() {
      if (disposed) return;
      if (!navigator.locks) { setOwner(true); return; }
      void navigator.locks.request('arcane-audio-output', { ifAvailable: true }, lock => {
        if (!lock) { setOwner(false); timer = setTimeout(acquire, 2000); return; }
        if (disposed) return;
        setOwner(true);
        return new Promise<void>(resolve => { release = resolve; });
      });
    }
    acquire();
    return () => { disposed = true; clearTimeout(timer); release?.(); };
  }, [enabled]);
  useEffect(() => {
    if (!owner || !track || !music) {
      audio.current?.pause(); audio.current?.removeAttribute('src'); audio.current = null;
      retiring.current?.pause(); retiring.current?.removeAttribute('src'); retiring.current = null;
      clearInterval(fadeTimer.current); fading.current = false; setBlocked(false); return;
    }
    const previous = audio.current;
    retiring.current?.pause(); retiring.current?.removeAttribute('src');
    clearInterval(fadeTimer.current);
    retiring.current = previous;
    if (previous) { previous.onended = null; previous.onerror = null; previous.onplaying = null; }
    const player = new Audio(track.url); player.preload = 'auto'; player.volume = 0; audio.current = player;
    player.onended = () => {
      const state = latest.current.workspace.music;
      if (audio.current === player && state?.playing) latest.current.send({ type: 'music.next', projectId: state.projectId });
    };
    player.ontimeupdate = () => { if (audio.current === player) setElapsed(player.currentTime); };
    player.onerror = () => { retiring.current?.pause(); retiring.current?.removeAttribute('src'); retiring.current = null; clearInterval(fadeTimer.current); fading.current = false; setBlocked(false); latest.current.onStatus('Не удалось воспроизвести трек. Проверьте файл или выберите другой.'); };
    player.onloadedmetadata = () => {
      const state = latest.current.workspace.music;
      if (!state || state.trackId !== music.trackId) return;
      const position = state.position + (state.playing ? (Date.now() - state.startedAt) / 1000 : 0);
      if (Number.isFinite(player.duration)) player.currentTime = Math.min(position, Math.max(0, player.duration - 0.05));
      if (state.playing) void player.play().then(() => { setBlocked(false); latest.current.onStatus(''); }).catch(() => setBlocked(true));
    };
    fading.current = false;
    let started = false;
    player.onplaying = () => {
      if (started || audio.current !== player) return;
      started = true; fading.current = true;
      const previousVolume = previous?.volume || 0; const start = performance.now();
      fadeTimer.current = setInterval(() => {
        const progress = Math.min(1, (performance.now() - start) / 600);
        player.volume = (latest.current.workspace.music?.volume ?? 0.5) * progress;
        if (previous) previous.volume = previousVolume * (1 - progress);
        if (progress === 1) { clearInterval(fadeTimer.current); fading.current = false; previous?.pause(); previous?.removeAttribute('src'); retiring.current = null; }
      }, 30);
    };
    if (!music.playing) { previous?.pause(); previous?.removeAttribute('src'); retiring.current = null; }

  }, [owner, track?.url, music?.projectId, music?.trackId]);
  useEffect(() => {
    const player = audio.current; if (!player || !music || !owner) return;
    if (!fading.current) player.volume = music.volume;
    if (player.readyState >= 1) {
      const position = music.position + (music.playing ? (Date.now() - music.startedAt) / 1000 : 0);
      if (Math.abs(player.currentTime - position) > 0.25 && Number.isFinite(player.duration)) player.currentTime = Math.min(position, Math.max(0, player.duration - 0.05));
    }
    if (music.playing) void player.play().then(() => { setBlocked(false); latest.current.onStatus(''); }).catch(() => setBlocked(true)); else { player.pause(); retiring.current?.pause(); setBlocked(false); }
  }, [owner, music?.playing, music?.startedAt, music?.position, music?.volume, music?.trackId]);
  useEffect(() => {
    if (!owner) return;
    const timer = setInterval(() => {
      const state = latest.current.workspace.music; const player = audio.current;
      if (state?.playing && player && !player.paused && Number.isFinite(player.currentTime)) latest.current.send({ type: 'music.transport', projectId: state.projectId, position: player.currentTime });
    }, 10000);
    return () => clearInterval(timer);
  }, [owner]);
  useEffect(() => () => { clearInterval(fadeTimer.current); audio.current?.pause(); audio.current?.removeAttribute('src'); retiring.current?.pause(); retiring.current?.removeAttribute('src'); }, []);
  if (!music) return null;
  return <div className="audio-notice" role="status">{!enabled ? 'Звук воспроизводится на компьютере мастера.' : !owner ? 'Музыка управляется другим окном мастерской.' : blocked ? <><span>Браузер ожидает разрешения на звук.</span><button onClick={() => { void audio.current?.play().then(() => { setBlocked(false); onStatus(''); }).catch(() => onStatus('Не удалось запустить звук')); }}>Включить звук</button></> : <span>♫ {track?.name} · {music.playing ? 'Воспроизводится' : 'Пауза'} · <time aria-label="Позиция воспроизведения">{Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, '0')}</time></span>}</div>;
}
