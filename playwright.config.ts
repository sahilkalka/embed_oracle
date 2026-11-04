import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 0,
  workers: 2,
  use: {
    baseURL: process.env.BASE_URL || 'https://embeddedindia.in',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'Desktop-Chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Mobile-Chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
});