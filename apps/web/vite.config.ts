import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => {
  // A NODE_ENV left over in the shell would otherwise bundle React's
  // development build into production.
  if (command === 'build') process.env['NODE_ENV'] = 'production';
  return {
    plugins: [react()],
    // The design system lives at the repository root, outside this app.
    server: { host: '0.0.0.0', port: 5173, fs: { allow: ['../..'] } },
    build: { target: 'es2022', sourcemap: true },
  };
});
