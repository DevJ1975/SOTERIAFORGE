import { test, expect } from '@playwright/test';

test('renders the home page', async ({ page }) => {
  await page.goto('/');

  expect(await page.locator('h1').innerText()).toContain('Welcome back');
});
