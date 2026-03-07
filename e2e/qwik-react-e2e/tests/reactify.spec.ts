import { expect, test } from '@playwright/test';

test.describe('reactify$ [SSR]', () => {
  test('should render React app structure during SSR', async ({ page }) => {
    const response = await page.goto('/reactify/');
    const html = await response?.text();
    // The React app structure should be present in SSR HTML
    expect(html).toContain('data-testid="react-app"');
    // Both Qwik badges should be SSR-rendered inside the React tree
    expect(html).toContain('data-testid="qwik-badge"');
    expect(html).toContain('Badge #0 (react=0)');
    expect(html).toContain('Badge #1 (react=0)');
    // Container-island markers should wrap the projected Qwik content
    expect(html).toContain('q:container-island');
  });

  test('should maintain interactivity after SSR hydration', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      errors.push(err.message);
    });
    await page.goto('/reactify/', { waitUntil: 'networkidle' });

    // Check no errors
    expect(errors).toEqual([]);

    // Both badges should be visible after SSR
    await expect(page.getByTestId('qwik-badge')).toHaveCount(2);

    // Wait for React hydration to complete (React inc button should work)
    await page.getByTestId('react-inc').click();
    await expect(page.getByTestId('react-count')).toHaveText('react count 1');

    // First badge button should work after hydration
    await page.getByTestId('badge-btn').nth(0).click();
    await expect(page.getByTestId('badge-btn').nth(0)).toHaveText('clicked 1', { timeout: 10000 });

    // Second badge button should also work after hydration (resume of 2nd child)
    await page.getByTestId('badge-btn').nth(1).click();
    await expect(page.getByTestId('badge-btn').nth(1)).toHaveText('clicked 1', { timeout: 10000 });
  });

  test('should share global context after SSR', async ({ page }) => {
    await page.goto('/reactify/', { waitUntil: 'networkidle' });

    // Both badges should be visible
    await expect(page.getByTestId('qwik-badge')).toHaveCount(2);

    // Wait for React hydration
    await page.getByTestId('react-inc').click();
    await expect(page.getByTestId('react-count')).toHaveText('react count 1');

    // Global count should start at 0
    await expect(page.getByTestId('global-count')).toHaveText('global count 0');

    // Increment from first badge should propagate to all
    await page.getByTestId('badge-global-inc').nth(0).click();
    await expect(page.getByTestId('global-count')).toHaveText('global count 1', { timeout: 10000 });
    await expect(page.getByTestId('badge-global').nth(0)).toHaveText('global=1');
    await expect(page.getByTestId('badge-global').nth(1)).toHaveText('global=1');
  });
});

test.describe('reactify$ [CSR]', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('reactify-link').click();
    await page.waitForURL('/reactify/', { waitUntil: 'networkidle' });
  });

  test('should render initial badges inside React tree via reactify$', async ({ page }) => {
    // The React app should be rendered
    await expect(page.getByTestId('react-app')).toBeVisible();

    // Two Qwik badges should be visible initially (badgeCount starts at 2)
    await expect(page.getByTestId('qwik-badge')).toHaveCount(2);

    // Badges should show initial labels with react count 0
    await expect(page.getByTestId('badge-label').nth(0)).toHaveText('Badge #0 (react=0)');
    await expect(page.getByTestId('badge-label').nth(1)).toHaveText('Badge #1 (react=0)');

    // Global count should start at 0
    await expect(page.getByTestId('global-count')).toHaveText('global count 0');
    await expect(page.getByTestId('badge-global').nth(0)).toHaveText('global=0');
  });

  test('should update all badge props when React state changes', async ({ page }) => {
    // Should start with 2 badges
    await expect(page.getByTestId('qwik-badge')).toHaveCount(2);

    // Add a third badge
    await page.getByTestId('add-badge').click();
    await expect(page.getByTestId('qwik-badge')).toHaveCount(3);

    // Click react inc to update props passed to badges
    await page.getByTestId('react-inc').click();
    await expect(page.getByTestId('react-count')).toHaveText('react count 1');

    // All badge labels should update with new react count
    const labels = page.getByTestId('badge-label');
    await expect(labels.nth(0)).toHaveText('Badge #0 (react=1)');
    await expect(labels.nth(1)).toHaveText('Badge #1 (react=1)');
    await expect(labels.nth(2)).toHaveText('Badge #2 (react=1)');
  });

  test('should support Qwik reactivity inside reactify$ component', async ({ page }) => {
    // Click the first badge button - Qwik's own reactivity should work
    await page.getByTestId('badge-btn').nth(0).click();
    await expect(page.getByTestId('badge-btn').nth(0)).toHaveText('clicked 1');

    await page.getByTestId('badge-btn').nth(0).click();
    await expect(page.getByTestId('badge-btn').nth(0)).toHaveText('clicked 2');
  });

  test('should add and remove badges dynamically', async ({ page }) => {
    // Start with 2 badges
    await expect(page.getByTestId('badge-count')).toHaveText('badges: 2');
    await expect(page.getByTestId('qwik-badge')).toHaveCount(2);

    // Add a badge
    await page.getByTestId('add-badge').click();
    await expect(page.getByTestId('badge-count')).toHaveText('badges: 3');
    await expect(page.getByTestId('qwik-badge')).toHaveCount(3);

    await page.getByTestId('add-badge').click();
    await expect(page.getByTestId('badge-count')).toHaveText('badges: 4');
    await expect(page.getByTestId('qwik-badge')).toHaveCount(4);

    // Remove badges
    await page.getByTestId('remove-badge').click();
    await expect(page.getByTestId('badge-count')).toHaveText('badges: 3');
    await expect(page.getByTestId('qwik-badge')).toHaveCount(3);

    // Remove all badges
    await page.getByTestId('remove-badge').click();
    await page.getByTestId('remove-badge').click();
    await page.getByTestId('remove-badge').click();
    await expect(page.getByTestId('badge-count')).toHaveText('badges: 0');
    await expect(page.getByTestId('qwik-badge')).toHaveCount(0);
  });

  test('should share global count via Qwik context', async ({ page }) => {
    // Increment global count from top-level Qwik button
    await page.getByTestId('global-inc').click();
    await expect(page.getByTestId('global-count')).toHaveText('global count 1');

    // Both badges should reflect updated global count
    await expect(page.getByTestId('badge-global').nth(0)).toHaveText('global=1');
    await expect(page.getByTestId('badge-global').nth(1)).toHaveText('global=1');

    // Increment from within the first badge
    await page.getByTestId('badge-global-inc').nth(0).click();
    await expect(page.getByTestId('global-count')).toHaveText('global count 2');
    await expect(page.getByTestId('badge-global').nth(0)).toHaveText('global=2');
    await expect(page.getByTestId('badge-global').nth(1)).toHaveText('global=2');
  });

  test('should share global count across multiple badges', async ({ page }) => {
    // Start with 2 badges, add a third
    await page.getByTestId('add-badge').click();
    await expect(page.getByTestId('qwik-badge')).toHaveCount(3);

    // Increment global count from the first badge
    await page.getByTestId('badge-global-inc').nth(0).click();

    // All badges and top-level should show global=1
    await expect(page.getByTestId('global-count')).toHaveText('global count 1');
    await expect(page.getByTestId('badge-global').nth(0)).toHaveText('global=1');
    await expect(page.getByTestId('badge-global').nth(1)).toHaveText('global=1');
    await expect(page.getByTestId('badge-global').nth(2)).toHaveText('global=1');

    // Increment from third badge
    await page.getByTestId('badge-global-inc').nth(2).click();

    // All should show global=2
    await expect(page.getByTestId('global-count')).toHaveText('global count 2');
    await expect(page.getByTestId('badge-global').nth(0)).toHaveText('global=2');
    await expect(page.getByTestId('badge-global').nth(1)).toHaveText('global=2');
    await expect(page.getByTestId('badge-global').nth(2)).toHaveText('global=2');
  });

  test('should maintain independent click counts per badge', async ({ page }) => {
    // Start with 2 badges
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
    // Remove all badges (start with 2)
    await page.getByTestId('remove-badge').click();
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
