import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api/v1': { target: 'http://localhost:3001', changeOrigin: false },
      '/ws/events': { target: 'ws://localhost:3001', ws: true },
    },
  },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 600 },
});
