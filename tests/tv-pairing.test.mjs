import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { createService } from '../build-desktop/backend/service.js';

test('A TV at the short /tv address gets a screen link only after the master confirms its code', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'arcane-tv-'));
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
    const tv = network.url;
    const tvPost = (path, value) => fetch(tv + path, { method: 'POST', headers: { Origin: tv, 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    assert.equal((await fetch(tv + '/tv')).status, 200, 'the short address serves the app');
    const pair = await (await tvPost('/api/tv/pair', {})).json();
    assert.match(pair.code, /^\d{4}$/);
    assert.deepEqual(await (await tvPost('/api/tv/status', { id: pair.id, secret: pair.secret })).json(), { waiting: true });
    assert.equal((await tvPost('/api/tv/status', { id: pair.id, secret: 'wrong' })).status, 404, 'the code alone does not let anyone in');
    network = await (await fetch(origin + '/api/network', { headers: rootHeaders })).json();
    assert.deepEqual(network.tvPairs.map(item => item.code), [pair.code], 'the master sees the waiting code');
    assert.equal((await fetch(tv + '/api/connections/tv-approve', { method: 'POST', headers: { Origin: tv, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pair.id }) })).status, 401, 'the TV cannot approve itself');
    network = await rootPost('/api/connections/tv-approve', { id: pair.id });
    assert.equal(network.tvPairs.length, 0);
    const { token } = await (await tvPost('/api/tv/status', { id: pair.id, secret: pair.secret })).json();
    const session = await (await fetch(tv + '/api/session?token=' + token)).json();
    assert.equal(session.role, 'display');
    assert.equal((await tvPost('/api/tv/status', { id: pair.id, secret: pair.secret })).status, 404, 'the link is handed out once');
    const rejected = await (await tvPost('/api/tv/pair', {})).json();
    await rootPost('/api/connections/tv-reject', { id: rejected.id });
    assert.equal((await tvPost('/api/tv/status', { id: rejected.id, secret: rejected.secret })).status, 404, 'a rejected TV gets nothing');
    await rootPost('/api/network', { enabled: false });
  } finally { server.close(); service.close(); rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
