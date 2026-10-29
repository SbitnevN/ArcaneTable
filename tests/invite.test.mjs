import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { createService } from '../build-desktop/backend/service.js';

test('The shared QR on the table screen hands every phone its own player link', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'arcane-invite-'));
  const service = await createService(directory, { staticRoot: resolve('dist') });
  const server = createServer((req, res) => { void service.handle(req, res, () => { res.writeHead(404); res.end(); }); }); service.attach(server);
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const rootHeaders = { Cookie: `arcane=${service.master}` };
  const rootPost = async (path, value) => (await fetch(origin + path, { method: 'POST', headers: { ...rootHeaders, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(value) })).json();
  try {
    let network = await (await fetch(origin + '/api/network', { headers: rootHeaders })).json();
    if (!network.interfaces.length) { t.skip('No private IPv4 adapter available'); return; }
    network = await rootPost('/api/network', { enabled: true, address: network.interfaces[0].address });
    const projectId = service.store.state().activeId;
    const display = () => fetch(origin + '/api/display-invite', { headers: { Authorization: `Bearer ${service.display}` } }).then(r => r.json());
    assert.equal(await display(), null, 'nothing on screen before the master creates a QR');
    network = await rootPost('/api/connections/invite', { projectId, hours: 4 });
    assert.match(network.invite.link, /\?invite=[a-f0-9]{64}$/);
    assert.equal(network.connections.some(item => item.role === 'invite'), false, 'the invite itself is not listed as a device');
    assert.equal((await display()).link, network.invite.link, 'the table screen shows it');
    const token = network.invite.link.split('invite=')[1];
    assert.equal((await fetch(origin + '/api/player', { headers: { Authorization: `Bearer ${token}` } })).status, 401, 'the invite itself opens no session');
    const accept = () => fetch(origin + '/api/invite/accept', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    const first = await (await accept()).json(); const second = await (await accept()).json();
    assert.notEqual(first.token, second.token, 'each phone gets its own link');
    const view = await (await fetch(origin + '/api/player', { headers: { Authorization: `Bearer ${first.token}` } })).json();
    assert.equal(view.own, null); assert.ok(view.characters.length > 0, 'the phone goes straight to choosing a hero');
    network = await (await fetch(origin + '/api/network', { headers: rootHeaders })).json();
    assert.equal(network.invite.uses, 2); assert.equal(network.connections.filter(item => item.label.startsWith('Игрок по QR')).length, 2);
    network = await rootPost('/api/connections/invite-show', { shown: false });
    assert.equal(await display(), null, 'hidden from the screen');
    await rootPost('/api/connections/revoke', { id: network.invite.id });
    assert.equal((await accept()).status, 400, 'a revoked QR no longer lets phones in');
    assert.equal((await fetch(origin + '/api/player', { headers: { Authorization: `Bearer ${first.token}` } })).status, 200, 'phones already connected stay connected');
    await rootPost('/api/network', { enabled: false });
  } finally { server.close(); service.close(); rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
