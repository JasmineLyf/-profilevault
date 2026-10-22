import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60000,
  workers: 1,
  fullyParallel: false,
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: `docs/validation/e2e-${process.env.PV_DIST ? 'zip-' : ''}${process.env.PV_BROWSER ?? 'chrome'}.json`,
      },
    ],
  ],
  use: { trace: 'retain-on-failure', actionTimeout: 7000 },
  webServer: { command: 'node tests/fixtures/server.mjs', port: 4317, reuseExistingServer: false },
});
