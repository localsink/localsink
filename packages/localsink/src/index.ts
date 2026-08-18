export { createApp } from './app.ts';
export type { CreateAppOptions } from './app.ts';
export {
  makeDatabase,
  initializeDatabase,
  InvalidQueryError,
} from './database.ts';
export type { Database } from './database.ts';
export { applySchema } from './migrate.ts';
export { startServer } from './server.ts';
export type { ServerHandle, StartServerOptions } from './server.ts';
export {
  DEFAULT_DB_FILE_NAME,
  DEFAULT_PORT,
  DEFAULT_SERVER_URL,
} from './config.ts';

// Re-exported so consumers don't have to depend on @localsink/contract
export type { LogFilter, LogMeta, LogPage, LogRow } from '@localsink/contract';
export { logsQuerySchema } from '@localsink/contract';
