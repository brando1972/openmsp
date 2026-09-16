import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

// Version shown in the top bar so you can tell at a glance whether a tab is on
// the latest deploy: the semver from package.json (bumped per commit) + the
// short git SHA (auto-injected by Vercel at build time; "dev" locally).
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));
const buildSha = (
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GIT_SHA ||
  ''
).slice(0, 7) || 'dev';

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_SHA__: JSON.stringify(buildSha)
  },
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true,
    open: false,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true
      }
    }
  }
});
