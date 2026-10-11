import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    hmr: process.env['SPARKO_E2E'] !== 'true',
    port: 5173,
    proxy: {
      '/health': { target: 'http://localhost:3001', changeOrigin: false },
      '/api/v1': { target: 'http://localhost:3001', changeOrigin: false },
      '/ws/events': { target: 'ws://localhost:3001', ws: true },
    },
  },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 600 },
});
