import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createService } from '../build-desktop/backend/service.js';

test('The table serves unselected hero portraits and removes access when they leave the public view', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'arcane-table-party-'));
  const service = await createService(directory);
  const server = createServer((req, res) => { void service.handle(req, res, () => { res.writeHead(404); res.end(); }); });
  service.attach(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const projectId = service.store.state().activeId;
  const run = (type, extra = {}) => service.store.execute({ id: randomUUID(), type, projectId, ...extra });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV3sAAAAASUVORK5CYII=', 'base64');
  try {
    const upload = await fetch(`${origin}/api/portrait?projectId=${projectId}&characterId=tarkhun`, { method: 'POST', headers: { Authorization: `Bearer ${service.master}`, Origin: origin, 'Content-Type': 'image/png' }, body: png });
    assert.equal(upload.status, 200);
    run('character.select', { characterId: 'paladin' });
    run('project.live');
    const party = service.store.publicView().party;
    const portrait = party.find(hero => hero.characterId === 'tarkhun').portrait.image;
    const displayHeaders = { Authorization: `Bearer ${service.display}` };
    assert.equal((await fetch(origin + portrait, { headers: displayHeaders })).status, 200);
    assert.equal(service.store.publicView().layout.y, 80);
    run('combat.create', { name: 'Другие участники' });
    run('combat.add', { characterId: 'paladin' });
    run('combat.start');
    assert.equal((await fetch(origin + portrait, { headers: displayHeaders })).status, 404);
    run('combat.stop');
    assert.equal((await fetch(origin + portrait, { headers: displayHeaders })).status, 200);
  } finally {
    service.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
