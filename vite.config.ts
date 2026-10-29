import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { createService } from './backend/service';

export default defineConfig({
  plugins: [{
    name: 'arcane-local-backend',
    async configureServer(server) {
      const service = await createService(resolve('.arcane-data'), { staticRoot: resolve('dist') });
      server.middlewares.use((req, res, next) => { void service.handle(req, res, next); });
      if (server.httpServer) {
        service.attach(server.httpServer);
        server.httpServer.once('listening', () => {
          const address = server.httpServer!.address();
          if (address && typeof address !== 'string') {
            const url = `http://127.0.0.1:${address.port}/?master=${service.master}`;
            writeFileSync(resolve('.arcane-data/dev-session-url.txt'), url);
            writeFileSync(resolve('.arcane-data/agent.json'), JSON.stringify({ origin: `http://127.0.0.1:${address.port}`, token: service.master, pid: process.pid }));
            console.log(`\nПанель мастера: ${url}\n`);
          }
        });
        server.httpServer.once('close', () => service.close());
      }
    }
  }]
});
