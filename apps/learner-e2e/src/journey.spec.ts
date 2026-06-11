import { expect, test, type Page } from '@playwright/test';
import { INSTRUCTOR_EMAIL, LEARNER_EMAIL, PASSWORD } from './seed';

const ADMIN_URL = 'http://localhost:4201';
const LEARNER_URL = 'http://localhost:4200';

/**
 * One course per run: the learner-side assertions key off this unique title,
 * so leftover courses from earlier runs against a live emulator never collide.
 */
const COURSE_TITLE = `E2E Forklift Refresher ${Date.now().toString(36)}`;

/** Signs in on the ForgeLogin form the auth guard redirected us to. */
async function signIn(page: Page, email: string): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe.configure({ mode: 'serial' });

test.describe('Phase 2 journey: author, publish, learn', () => {
  test('instructor authors and publishes a course in the admin app', async ({ page }) => {
    // /courses is auth+role guarded → we land on /login with a returnUrl.
    await page.goto(`${ADMIN_URL}/courses`);
    await signIn(page, INSTRUCTOR_EMAIL);
    await page.waitForURL(`${ADMIN_URL}/courses`);

    // Forge Studio list; first run also seeds the demo course — let it settle.
    await expect(page.getByText('Loading courses…')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'New course' })).toBeVisible();

    // A fresh course is the robust path: one lesson we fully control, no
    // knowledge checks (the seeded demo course has checks in every lesson).
    await page.getByRole('button', { name: 'New course' }).click();
    await page.waitForURL(/\/courses\/course-/);

    // Name it (contenteditable title in the top bar; Enter commits via blur).
    const titleField = page.locator('.course-title-edit');
    await expect(titleField).toBeVisible();
    await titleField.fill(COURSE_TITLE);
    await titleField.press('Enter');

    // Lesson 1 starts empty: add a heading block through the palette.
    await page.getByRole('button', { name: 'Add your first block' }).click();
    // Note: the item's accessible name starts with the icon's whitespace.
    await page.getByRole('menuitem', { name: /\bHeading\b/ }).click();
    await expect(page.getByText('New section')).toBeVisible();

    // A second lesson so completing lesson 1 yields partial (50%) progress.
    await page.getByRole('button', { name: 'Add lesson' }).click();
    // The new lesson's row appears in the outline rail (rows are role=button).
    await expect(page.getByRole('button', { name: /\bLesson 2\b/ })).toBeVisible();

    // Publish (confirm dialog), then wait for the chip + the Firestore save.
    await page.getByRole('button', { name: 'Publish' }).click();
    // PrimeNG appends the confirm dialog to <body> without a dialog role —
    // scope by its .p-dialog container instead.
    const confirmDialog = page.locator('.p-dialog');
    await expect(confirmDialog.getByText('Publish course')).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Publish' }).click();

    await expect(page.locator('.pub-chip')).toContainText('Published');
    await expect(page.locator('.save-status')).toContainText('Saved');
  });

  test('learner finds the published course, takes it, and completes a lesson', async ({ page }) => {
    await page.goto(`${LEARNER_URL}/courses`);
    await signIn(page, LEARNER_EMAIL);
    await page.waitForURL(`${LEARNER_URL}/courses`);

    // The catalog reads Firestore once per load — reload until the freshly
    // published course shows up (absorbs any propagation latency).
    const courseCard = () => page.locator('article.course-card').filter({ hasText: COURSE_TITLE });
    await expect(async () => {
      await page.reload();
      await expect(courseCard()).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 60_000 });
    await expect(courseCard().getByText('2 lessons')).toBeVisible();

    // Open the course player.
    await courseCard().getByRole('button', { name: 'Start course' }).click();
    await page.waitForURL(/\/courses\/course-/);
    await expect(page.getByRole('heading', { name: COURSE_TITLE })).toBeVisible();

    // Lesson 1 is current, its heading block renders, no progress yet.
    const rail = page.getByRole('navigation', { name: 'Lessons' });
    await expect(rail.getByRole('button', { name: 'Lesson 1' })).toBeVisible();
    await expect(rail.getByRole('button', { name: 'Lesson 2' })).toBeVisible();
    await expect(page.getByText('New section')).toBeVisible();
    await expect(page.locator('.progress-label')).toHaveText('0%');

    // Complete lesson 1 via the explicit CTA (no knowledge checks → manual).
    await page.getByRole('button', { name: 'Mark lesson complete' }).click();

    // Completion is acknowledged inline, on the rail, and in the progress bar.
    await expect(page.getByText('Lesson completed')).toBeVisible();
    await expect(
      rail.getByRole('button', { name: 'Lesson 1' }).locator('.check.done'),
    ).toBeVisible();
    await expect(page.locator('.progress-label')).toHaveText('50%');

    // Back to the catalog: the card now shows progress and a Continue CTA.
    await page.getByRole('link', { name: 'All courses' }).click();
    await page.waitForURL(`${LEARNER_URL}/courses`);
    await expect(courseCard().getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    await expect(courseCard().getByRole('button', { name: 'Continue' })).toBeVisible();
  });
});
