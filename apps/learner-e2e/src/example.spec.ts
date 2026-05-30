import { test, expect } from '@playwright/test';

test.describe('Learner App – unauthenticated smoke tests', () => {
  test('login page has a heading, email input, password input and sign-in button', async ({
    page,
  }) => {
    await page.goto('/login');

    // Page title / heading is present
    await expect(page).toHaveTitle(/.+/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Credential inputs
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();

    // Submit control (button or input[type=submit])
    await expect(page.getByRole('button', { name: /sign.?in/i })).toBeVisible();
  });

  test('navigating to / while unauthenticated redirects to /login', async ({ page }) => {
    await page.goto('/');

    // Allow time for any client-side redirect guard to run
    await page.waitForURL('**/login', { timeout: 10_000 });

    expect(page.url()).toContain('/login');
  });
});
