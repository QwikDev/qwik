import { expect, test } from '@playwright/test';

test.describe('reactify$ [CSR]', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('reactify-link').click();
    await page.waitForURL('/reactify/', { waitUntil: 'networkidle' });
  });

  test('should render initial badge inside React tree via reactify$', async ({ page }) => {
    // The React app should be rendered
    await expect(page.getByTestId('react-app')).toBeVisible();

    // One Qwik badge should be visible initially
    await expect(page.getByTestId('qwik-badge')).toHaveCount(1);

    // Badge should show initial label with react count 0
    await expect(page.getByTestId('badge-label')).toHaveText('Badge #0 (react=0)');

    // Global count should start at 0
    await expect(page.getByTestId('global-count')).toHaveText('global count 0');
    await expect(page.getByTestId('badge-global')).toHaveText('global=0');
  });

  test('should update all badge props when React state changes', async ({ page }) => {
    // Add a second badge
    await page.getByTestId('add-badge').click();
    await expect(page.getByTestId('qwik-badge')).toHaveCount(2);

    // Click react inc to update props passed to badges
    await page.getByTestId('react-inc').click();
    await expect(page.getByTestId('react-count')).toHaveText('react count 1');

    // Both badge labels should update with new react count
    const labels = page.getByTestId('badge-label');
    await expect(labels.nth(0)).toHaveText('Badge #0 (react=1)');
    await expect(labels.nth(1)).toHaveText('Badge #1 (react=1)');
  });

  test('should support Qwik reactivity inside reactify$ component', async ({ page }) => {
    // Click the badge button - Qwik's own reactivity should work
    await page.getByTestId('badge-btn').click();
    await expect(page.getByTestId('badge-btn')).toHaveText('clicked 1');

    await page.getByTestId('badge-btn').click();
    await expect(page.getByTestId('badge-btn')).toHaveText('clicked 2');
  });

  test('should add and remove badges dynamically', async ({ page }) => {
    // Start with 1 badge
    await expect(page.getByTestId('badge-count')).toHaveText('badges: 1');
    await expect(page.getByTestId('qwik-badge')).toHaveCount(1);

    // Add badges
    await page.getByTestId('add-badge').click();
    await expect(page.getByTestId('badge-count')).toHaveText('badges: 2');
    await expect(page.getByTestId('qwik-badge')).toHaveCount(2);

    await page.getByTestId('add-badge').click();
    await expect(page.getByTestId('badge-count')).toHaveText('badges: 3');
    await expect(page.getByTestId('qwik-badge')).toHaveCount(3);

    // Remove a badge
    await page.getByTestId('remove-badge').click();
    await expect(page.getByTestId('badge-count')).toHaveText('badges: 2');
    await expect(page.getByTestId('qwik-badge')).toHaveCount(2);

    // Remove all badges
    await page.getByTestId('remove-badge').click();
    await page.getByTestId('remove-badge').click();
    await expect(page.getByTestId('badge-count')).toHaveText('badges: 0');
    await expect(page.getByTestId('qwik-badge')).toHaveCount(0);
  });

  test('should share global count via Qwik context', async ({ page }) => {
    // Increment global count from top-level Qwik button
    await page.getByTestId('global-inc').click();
    await expect(page.getByTestId('global-count')).toHaveText('global count 1');

    // Badge should reflect updated global count
    await expect(page.getByTestId('badge-global')).toHaveText('global=1');

    // Increment from within the badge
    await page.getByTestId('badge-global-inc').click();
    await expect(page.getByTestId('global-count')).toHaveText('global count 2');
    await expect(page.getByTestId('badge-global')).toHaveText('global=2');
  });

  test('should share global count across multiple badges', async ({ page }) => {
    // Add a second badge
    await page.getByTestId('add-badge').click();
    await expect(page.getByTestId('qwik-badge')).toHaveCount(2);

    // Increment global count from the first badge
    await page.getByTestId('badge-global-inc').nth(0).click();

    // Both badges and top-level should show global=1
    await expect(page.getByTestId('global-count')).toHaveText('global count 1');
    await expect(page.getByTestId('badge-global').nth(0)).toHaveText('global=1');
    await expect(page.getByTestId('badge-global').nth(1)).toHaveText('global=1');

    // Increment from second badge
    await page.getByTestId('badge-global-inc').nth(1).click();

    // All should show global=2
    await expect(page.getByTestId('global-count')).toHaveText('global count 2');
    await expect(page.getByTestId('badge-global').nth(0)).toHaveText('global=2');
    await expect(page.getByTestId('badge-global').nth(1)).toHaveText('global=2');
  });

  test('should maintain independent click counts per badge', async ({ page }) => {
    // Add a second badge
    await page.getByTestId('add-badge').click();
    await expect(page.getByTestId('qwik-badge')).toHaveCount(2);

    // Click first badge twice
    await page.getByTestId('badge-btn').nth(0).click();
    await page.getByTestId('badge-btn').nth(0).click();
    await expect(page.getByTestId('badge-btn').nth(0)).toHaveText('clicked 2');

    // Second badge should still be at 0
    await expect(page.getByTestId('badge-btn').nth(1)).toHaveText('clicked 0');

    // Click second badge once
    await page.getByTestId('badge-btn').nth(1).click();
    await expect(page.getByTestId('badge-btn').nth(1)).toHaveText('clicked 1');

    // First badge should still be at 2
    await expect(page.getByTestId('badge-btn').nth(0)).toHaveText('clicked 2');
  });

  test('should re-add badges after removing all', async ({ page }) => {
    // Remove all badges
    await page.getByTestId('remove-badge').click();
    await expect(page.getByTestId('qwik-badge')).toHaveCount(0);

    // Re-add a badge
    await page.getByTestId('add-badge').click();
    await expect(page.getByTestId('qwik-badge')).toHaveCount(1);

    // New badge should work (Qwik reactivity)
    await page.getByTestId('badge-btn').click();
    await expect(page.getByTestId('badge-btn')).toHaveText('clicked 1');

    // Global count context should still work
    await page.getByTestId('badge-global-inc').click();
    await expect(page.getByTestId('global-count')).toHaveText('global count 1');
    await expect(page.getByTestId('badge-global')).toHaveText('global=1');
  });
});
