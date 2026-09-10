import { defineConfig, devices } from '@playwright/test';

// e2e for Delegation Poker Phase 1. Needs BOTH the Angular SPA and the Django
// (ASGI) backend running. reuseExistingServer lets you start them yourself (the
// fast local loop); otherwise Playwright boots them via the webServer entries.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:4200',
    locale: 'en-US',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Django ASGI backend (daphne via runserver) + a seeded standard deck.
      command:
        'cd ../../PycharmProjects/Poker_server && .venv/Scripts/python.exe manage.py migrate --noinput && .venv/Scripts/python.exe manage.py seed_delegation_deck && .venv/Scripts/python.exe manage.py runserver 127.0.0.1:8000 --noreload',
      url: 'http://127.0.0.1:8000/health/',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm start',
      url: 'http://localhost:4200',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
