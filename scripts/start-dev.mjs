import './prepare-dev.mjs';
import { createServer } from 'vite';

const server = await createServer({
  configLoader: 'native',
  server: { host: '127.0.0.1', port: Number(process.env.LOKINVAS_TEST_PORT || 5173) },
});
await server.listen();
server.printUrls();
process.once('SIGINT', async () => { await server.close(); process.exit(0); });
process.once('SIGTERM', async () => { await server.close(); process.exit(0); });
