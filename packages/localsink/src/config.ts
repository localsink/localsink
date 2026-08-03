/** Loads a .env from the working directory if there is one. */
export function loadEnv(): void {
  try {
    process.loadEnvFile();
  } catch {
    // .env is optional
  }
}

/**
 * First value that was actually configured. Empty strings count as unset:
 * `VAR=` in a .env is a normal way to blank a variable, and `??` would pass
 * the empty string through to whatever consumes it.
 */
export function configured(
  ...values: (string | undefined)[]
): string | undefined {
  return values.find((value) => value !== undefined && value !== '');
}

/** Created in the working directory when nothing else is configured. */
export const DEFAULT_DB_FILE_NAME = 'file:localsink.db';

/** Bound when nothing else is configured. */
export const DEFAULT_PORT = 3000;

/** Where the server listens when nothing else is configured. */
export const DEFAULT_SERVER_URL = `http://localhost:${String(DEFAULT_PORT)}`;

/** Flags win over the environment, which wins over the default. */
export function resolveDbFileName(flag?: string): string {
  return configured(flag, process.env['DB_FILE_NAME']) ?? DEFAULT_DB_FILE_NAME;
}

/** Flags win over the environment, which wins over the default. */
export function resolveServerUrl(flag?: string): string {
  return configured(flag, process.env['LOCALSINK_URL']) ?? DEFAULT_SERVER_URL;
}
