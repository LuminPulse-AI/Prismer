import { defineConfig } from '@playwright/test';

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  outputDir: 'tests/output/results',
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'tests/output/reports' }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 960 },
  },
  projects: [
    {
      name: 'layer1',
      testMatch: ['tests/layer1/**/*.spec.ts'],
      timeout: 120_000,
      use: {
        browserName: 'chromium',
      },
    },
    {
      name: 'layer2',
      testMatch: ['tests/layer2/**/*.spec.ts'],
      timeout: 90_000,
      use: {
        browserName: 'chromium',
      },
    },
    {
      name: 'layer3',
      testMatch: ['tests/layer3/**/*.spec.ts'],
      timeout: 180_000,
      use: {
        browserName: 'chromium',
      },
    },
  ],
  webServer: {
    command: 'npx prisma generate && npx prisma db push && npm run dev -- --hostname 127.0.0.1 --port 3100',
    url: BASE_URL,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      DATABASE_URL: 'file:/tmp/prismer-playwright.db',
      DEV_USER_EMAIL: 'playwright@localhost',
      NEXT_TELEMETRY_DISABLED: '1',
      NODE_ENV: 'development',
      PORT: String(PORT),
    },
  },
});
