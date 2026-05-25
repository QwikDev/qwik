import { expect, test } from '@playwright/test';

// Regression for https://github.com/QwikDev/qwik/issues/8638.
//
// The optimizer's `transform_props_destructuring` pass used to rewrite any
// single-param destructured arrow with a `return` into a Qwik inline
// component shape, rewriting identifier *reads* of the destructured names
// to `_rawProps.<name>` but leaving assignment LHS untouched. A plain
// helper that defaulted an optional arg via reassignment then ended up
// writing to a now-undeclared identifier — hanging dev SSR (template
// literal RHS) or silently dropping the default (string literal RHS).
//
// The page below imports `buildHead` (which destructures `{ ogImage }`
// and reassigns it) and wires it through `head: DocumentHead`. The three
// assertions guard the three observed failure modes.
test.describe('issue 8638 — destructured-reassign helper called from DocumentHead', () => {
  test('renders without hang, error, or silent miscompilation', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    // Guards the dev-SSR hang: a request that never resolves would time out
    // here rather than navigating, so this implicitly asserts no hang.
    await page.goto('/qwikrouter-test/issue8638/', { timeout: 5000 });

    // Guards the production 500 / unswallowed ReferenceError mode.
    expect(pageErrors).toEqual([]);

    // Guards the silent miscompilation mode: if a downstream pass drops
    // the `ogImage = "fallback-image-url"` assignment, the meta content
    // would be empty / undefined instead of the default.
    const ogImage = page.locator('meta[property="og:image"]');
    await expect(ogImage).toHaveAttribute('content', 'fallback-image-url');

    // Sanity: confirm the route actually rendered (not an error page).
    await expect(page.locator('#issue8638-marker')).toBeVisible();
  });
});
