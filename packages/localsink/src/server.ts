import { serve } from '@hono/node-server';

import { createApp } from './app.ts';
import { initializeDatabase } from './database.ts';
import type { Database } from './database.ts';

let database: Database;
try {
  database = await initializeDatabase();
} catch (error) {
  console.error('Failed to initialize database:', error);
  process.exit(1);
}

const app = createApp(database);

const server = serve({
  fetch: app.fetch,
  port: 3000,
});

server.addListener('listening', () => {
  const addressInfo = server.address();
  if (addressInfo && typeof addressInfo === 'object') {
    console.log(
      `Server is listening on http://${addressInfo.address}:${String(addressInfo.port)}`,
    );
  } else {
    console.log('Server is listening');
  }
});

const exit = () => {
  server.close((err) => {
    let exitCode = 0;
    if (err) {
      console.error(err);
      exitCode = 1;
    }
    try {
      database.close();
    } catch (error) {
      console.error('Failed to close database connection:', error);
      exitCode = 1;
    }
    process.exit(exitCode);
  });
};
process.once('SIGINT', exit);
process.once('SIGTERM', exit);
