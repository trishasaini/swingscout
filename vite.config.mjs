import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// SwingScout is a static SPA that reads a nightly-refreshed public/data.json.
// No backend, no proxy, no env vars reach the browser.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
