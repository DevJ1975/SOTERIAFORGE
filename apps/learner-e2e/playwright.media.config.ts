import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src',
  testMatch: 'engage-media.spec.ts',
  workers: 1,
  timeout: 60_000,
  use: {
    ...devices['Desktop Chrome'],
    channel: 'chrome',
    permissions: ['camera', 'microphone'],
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--auto-select-desktop-capture-source=Entire screen',
      ],
    },
  },
});
