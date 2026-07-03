import path from 'node:path';

import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

// In prod the SPA is served by localsink itself, so /api is same-origin. In dev
// the SPA runs on Vite while the server runs separately (default :3000), so we
// proxy the API + MCP paths to it — same-origin from the browser's view, no
// CORS. Override the target with VITE_API_TARGET if the server uses another port.
const API_TARGET = process.env['VITE_API_TARGET'] ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    babel({
      presets: [reactCompilerPreset()],
    }),
  ],
  server: {
    proxy: {
      '/api': API_TARGET,
      '/mcp': API_TARGET,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
    conditions: ['@localsink/source', ...defaultClientConditions],
  },
});
