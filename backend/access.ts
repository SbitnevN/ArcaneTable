import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';

export type Grant = { id: string; hash: string; role: 'player' | 'master' | 'display'; label: string; expiresAt: number; revoked: boolean; projectId?: string; characterId?: string; playerName?: string };
export type Identity = { id: string; role: Grant['role']; root?: boolean };
export class Access {
  private records: Grant[] = [];
  private filename: string;
  constructor(directory: string) {
    this.filename = join(directory, 'access.json');
    if (existsSync(this.filename)) {
      const data: unknown = JSON.parse(readFileSync(this.filename, 'utf8'));
      if (!Array.isArray(data) || !data.every(record => record && typeof record.id === 'string' && /^[a-f0-9]{64}$/.test(record.hash) && ['player', 'master', 'display'].includes(record.role) && typeof record.label === 'string' && Number.isFinite(record.expiresAt) && typeof record.revoked === 'boolean')) throw new Error('Повреждено хранилище подключений');
      this.records = data;
    }
  }
  private flush() {
    writeFileSync(`${this.filename}.tmp`, JSON.stringify(this.records), { flush: true });
    renameSync(`${this.filename}.tmp`, this.filename);
  }
  list() { return this.records.map(({ hash: _hash, ...record }) => ({ ...record, active: !record.revoked && record.expiresAt > Date.now() })); }
  find(id: string) { return this.records.find(record => record.id === id && !record.revoked && record.expiresAt > Date.now()); }
  resolve(token: string | null | undefined): Identity | null {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const hash = createHash('sha256').update(token).digest('hex');
    const record = this.records.find(item => item.hash === hash && !item.revoked && item.expiresAt > Date.now());
    return record ? { id: record.id, role: record.role } : null;
  }
  create(role: unknown, label: unknown, hours: unknown, projectId?: string) {
    if (!['player', 'master', 'display'].includes(String(role))) throw new Error('Неизвестная роль');
    if (typeof label !== 'string' || !label.trim() || label.trim().length > 100) throw new Error('Введите имя подключения');
    if (typeof hours !== 'number' || !Number.isInteger(hours) || hours < 1 || hours > 168) throw new Error('Срок ссылки — от 1 до 168 часов');
    const token = randomBytes(32).toString('hex');
    const grant: Grant = { id: randomUUID(), hash: createHash('sha256').update(token).digest('hex'), role: role as Grant['role'], label: label.trim(), expiresAt: Date.now() + hours * 3600000, revoked: false, ...(role === 'player' ? { projectId } : {}) };
    this.records.push(grant); this.flush(); return { token, id: grant.id };
  }
  revoke(id: string) {
    const record = this.records.find(item => item.id === id);
    if (!record) throw new Error('Подключение не найдено');
    record.revoked = true; delete record.characterId; this.flush();
  }
  release(id: string) { const record = this.find(id); if (!record) throw new Error('Подключение не найдено'); delete record.characterId; this.flush(); }
  claim(id: string, characterId: string, name: string) {
    const record = this.find(id);
    if (!record || record.role !== 'player') throw new Error('Нужна действующая ссылка игрока');
    if (!name.trim() || name.trim().length > 100) throw new Error('Введите имя игрока');
    if (this.records.some(other => other.id !== id && other.projectId === record.projectId && other.characterId === characterId && !other.revoked && other.expiresAt > Date.now())) throw new Error('Персонаж занят. Мастер может освободить его в подключениях');
    record.characterId = characterId; record.playerName = name.trim(); this.flush();
  }
  occupied(projectId: string, characterId: string, except: string) { return this.records.some(other => other.id !== except && other.projectId === projectId && other.characterId === characterId && !other.revoked && other.expiresAt > Date.now()); }
}
