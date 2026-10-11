import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env['CHROMIUM_PATH'] ?? '/usr/bin/chromium',
      args: ['--no-sandbox'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: './node_modules/.bin/tsx apps/api/test/server.ts',
      url: 'http://localhost:3001/health/ready',
      timeout: 60000,
      reuseExistingServer: false,
    },
    {
      command: 'pnpm exec vite --host 127.0.0.1',
      env: { SPARKO_E2E: 'true' },
      cwd: 'apps/web',
      url: 'http://localhost:5173',
      timeout: 60000,
      reuseExistingServer: false,
    },
  ],
  reporter: [['list'], ['html', { open: 'never' }]],
});
