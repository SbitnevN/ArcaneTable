import { createServer, type Server } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SpotifyPlayback, SpotifyStatus } from '../src/contracts.js';

export const spotifyPort = 43821;
export const spotifyRedirect = `http://127.0.0.1:${spotifyPort}/callback`;
const scopes = 'user-read-playback-state user-modify-playback-state user-read-private';
type Config = { clientId: string; refreshToken?: string; accessToken?: string; expiresAt?: number; user?: string; premium?: boolean };
class SpotifyError extends Error { constructor(message: string, public status = 0, public reason = '') { super(message); } }

export class Spotify {
  private config: Config = { clientId: '' };
  private file: string;
  private login?: { verifier: string; state: string; server: Server; timer: ReturnType<typeof setTimeout> };
  private queue: Promise<void> = Promise.resolve();
  private applied: SpotifyPlayback | null = null;
  private device = '';
  private error = '';
  constructor(directory: string, private onChange: () => void, private launch?: () => Promise<void>) {
    this.file = join(directory, 'spotify.json');
    try { const stored = JSON.parse(readFileSync(this.file, 'utf8')); if (typeof stored.clientId === 'string') this.config = stored; } catch { /* Spotify is not configured yet. */ }
  }
  status(): SpotifyStatus {
    return { configured: Boolean(this.config.clientId), clientId: this.config.clientId, connected: Boolean(this.config.refreshToken), user: this.config.user || '', premium: this.config.premium ?? null, device: this.device, error: this.error, redirectUri: spotifyRedirect };
  }
  setClientId(value: unknown) {
    if (typeof value !== 'string' || !/^[a-f0-9]{32}$/i.test(value.trim())) throw new Error('Client ID — 32 символа из панели Spotify Developer');
    this.config = { clientId: value.trim().toLowerCase() }; this.applied = null; this.error = ''; this.save();
  }
  logout() { this.config = { clientId: this.config.clientId }; this.applied = null; this.device = ''; this.error = ''; this.save(); }
  async authorize(): Promise<string> {
    if (!this.config.clientId) throw new Error('Сначала укажите Client ID');
    this.closeLogin();
    const verifier = randomBytes(48).toString('base64url');
    const state = randomBytes(16).toString('hex');
    const server = createServer((request, response) => { void this.callback(request.url || '/', response); });
    await new Promise<void>((resolve, reject) => {
      server.once('error', () => reject(new Error(`Порт ${spotifyPort} занят. Закройте программу, которая его использует`)));
      server.listen(spotifyPort, '127.0.0.1', () => resolve());
    });
    this.login = { verifier, state, server, timer: setTimeout(() => this.closeLogin(), 10 * 60000) };
    const url = new URL('https://accounts.spotify.com/authorize');
    url.search = new URLSearchParams({ client_id: this.config.clientId, response_type: 'code', redirect_uri: spotifyRedirect, scope: scopes, state, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') }).toString();
    return url.toString();
  }
  sync(playback: SpotifyPlayback | null | undefined) {
    const target = playback ? { ...playback } : null;
    this.queue = this.queue.then(() => this.apply(target)).catch(() => {});
  }
  close() { this.closeLogin(); }

  private async apply(target: SpotifyPlayback | null) {
    const previous = this.applied;
    if (!this.config.refreshToken) return;
    if (!target && !previous?.playing) { this.applied = null; return; }
    if (target && previous && target.uri === previous.uri && target.playing === previous.playing && target.volume === previous.volume && target.startedAt === previous.startedAt) return;
    try {
      if (!target || !target.playing) { if (previous?.playing) await this.api('PUT', '/me/player/pause').catch(error => { if (!(error instanceof SpotifyError && error.status === 404)) throw error; }); }
      else {
        const device = await this.findDevice();
        if (previous?.uri !== target.uri || !previous.playing || target.startedAt !== previous.startedAt) {
          const kind = target.uri.split(':')[1];
          const body = kind === 'track' ? { uris: [target.uri] } : { context_uri: target.uri };
          if (previous?.uri === target.uri && !previous.playing) await this.api('PUT', `/me/player/play?device_id=${device}`);
          else await this.api('PUT', `/me/player/play?device_id=${device}`, body);
        }
        if (previous?.volume !== target.volume) await this.api('PUT', `/me/player/volume?volume_percent=${Math.round(target.volume * 100)}&device_id=${device}`).catch(() => { /* Some devices do not allow remote volume. */ });
      }
      this.applied = target; this.error = '';
    } catch (error) {
      this.applied = null;
      this.error = error instanceof SpotifyError && error.status === 403 ? 'Spotify отклонил команду: для управления нужен Spotify Premium' : error instanceof Error ? error.message : 'Ошибка Spotify';
    }
    this.onChange();
  }
  private async findDevice(): Promise<string> {
    for (let attempt = 0; attempt < 6; attempt++) {
      const { devices } = await this.api('GET', '/me/player/devices') as { devices: { id: string | null; name: string; type: string; is_active: boolean; is_restricted: boolean }[] };
      const usable = devices.filter(device => device.id && !device.is_restricted);
      const device = usable.find(item => item.is_active) || usable.find(item => item.type === 'Computer') || usable[0];
      if (device?.id) { this.device = device.name; return device.id; }
      if (attempt === 0 && this.launch) await this.launch().catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    this.device = '';
    throw new Error('Spotify не найден. Откройте приложение Spotify на этом компьютере');
  }
  private async api(method: string, path: string, body?: unknown): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch(`https://api.spotify.com/v1${path}`, { method, headers: { Authorization: `Bearer ${await this.token(attempt > 0)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : method === 'PUT' ? '' : undefined });
      if (response.status === 401 && attempt === 0) continue;
      if (response.status === 204 || response.status === 202) return {};
      const text = await response.text();
      const value = text ? JSON.parse(text) : {};
      if (!response.ok) throw new SpotifyError(value.error?.message || `Spotify ответил ${response.status}`, response.status, value.error?.reason || '');
      return value;
    }
    throw new SpotifyError('Вход в Spotify устарел. Подключите аккаунт заново', 401);
  }
  private async token(force = false): Promise<string> {
    if (!force && this.config.accessToken && (this.config.expiresAt || 0) > Date.now() + 30000) return this.config.accessToken;
    if (!this.config.refreshToken) throw new Error('Подключите аккаунт Spotify');
    const value = await this.exchange({ grant_type: 'refresh_token', refresh_token: this.config.refreshToken, client_id: this.config.clientId });
    return value;
  }
  private async exchange(params: Record<string, string>): Promise<string> {
    const response = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
    const value = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string; error?: string };
    if (!response.ok || !value.access_token) {
      if (params.grant_type === 'refresh_token' && value.error === 'invalid_grant') this.logout();
      throw new Error(value.error_description || 'Spotify не выдал доступ');
    }
    this.config.accessToken = value.access_token; this.config.expiresAt = Date.now() + (value.expires_in || 3600) * 1000;
    if (value.refresh_token) this.config.refreshToken = value.refresh_token;
    this.save(); return value.access_token;
  }
  private async callback(path: string, response: import('node:http').ServerResponse) {
    const url = new URL(path, spotifyRedirect);
    const page = (title: string, text: string) => { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" }); response.end(`<!doctype html><meta charset="utf-8"><title>Arcane Table</title><body style="font:16px system-ui;background:#121a1c;color:#eee;display:grid;place-items:center;height:90vh;text-align:center"><div><h1>${title}</h1><p>${text}</p></div>`); };
    if (url.pathname !== '/callback' || !this.login) { response.writeHead(404); response.end(); return; }
    const login = this.login;
    if (url.searchParams.get('state') !== login.state) { page('Ошибка входа', 'Ссылка устарела. Нажмите «Подключить Spotify» ещё раз.'); return; }
    this.closeLogin();
    const code = url.searchParams.get('code');
    if (!code) { this.error = 'Вход в Spotify отменён'; page('Вход отменён', 'Можно закрыть эту вкладку.'); this.onChange(); return; }
    try {
      this.config.refreshToken = undefined;
      await this.exchange({ grant_type: 'authorization_code', code, redirect_uri: spotifyRedirect, client_id: this.config.clientId, code_verifier: login.verifier });
      const me = await this.api('GET', '/me') as { display_name?: string; id?: string; product?: string };
      this.config.user = me.display_name || me.id || 'Spotify'; this.config.premium = me.product ? me.product === 'premium' : undefined;
      this.error = this.config.premium === false ? 'Аккаунт без Premium: Spotify не разрешает управлять воспроизведением' : '';
      this.applied = null; this.save();
      page('Spotify подключён', 'Вернитесь в Arcane Table — эту вкладку можно закрыть.');
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Не удалось подключить Spotify';
      page('Не удалось подключить', this.error.replace(/[<>&]/g, ''));
    }
    this.onChange();
  }
  private closeLogin() {
    if (!this.login) return;
    clearTimeout(this.login.timer); this.login.server.closeAllConnections(); this.login.server.close(); this.login = undefined;
  }
  private save() {
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.config), { flush: true, mode: 0o600 });
    renameSync(`${this.file}.tmp`, this.file);
  }
}
