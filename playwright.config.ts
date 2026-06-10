import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 15000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  // Requires both servers to be running before tests
  webServer: [
    {
      command: 'npm run server',
      port: 3001,
      reuseExistingServer: true,
      timeout: 20000,
    },
    {
      command: 'npm start',
      port: 3000,
      reuseExistingServer: true,
      timeout: 20000,
    },
  ],
})
