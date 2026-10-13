import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Two pages: the main window (index.html) and the small calendar that opens
// under the bar (popup.html). Tauri serves the built files from dist/.
export default defineConfig({
  plugins: [preact()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: '127.0.0.1' },
  build: {
    target: 'es2022',
    rollupOptions: { input: { main: 'index.html', popup: 'popup.html' } },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
    // Calendar maths depends on the local zone; the tests are written for this one.
    env: { TZ: 'Europe/Bratislava' },
  },
});
