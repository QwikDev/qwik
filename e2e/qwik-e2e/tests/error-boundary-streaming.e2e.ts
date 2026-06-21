import { test, expect, type Page } from '@playwright/test';

const assertNoBrowserErrors = (page: Page) => {
  page.on('pageerror', (err) => expect(err).toEqual(undefined));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      expect(msg.text()).toEqual(undefined);
    }
  });
};

const releaseDeferred = async (page: Page, selector: string) => {
  const releaseButton = page.locator(selector);
  await expect(releaseButton).toBeVisible();
  const releaseUrl = await releaseButton.getAttribute('data-release-url');
  expect(releaseUrl).not.toBeNull();
  const response = await page.request.post(new URL(releaseUrl!, page.url()).toString());
  expect(response.ok()).toBeTruthy();
};

test.describe('ErrorBoundary streaming swap', () => {
  test('sync throw: streams the shell, swaps to the fallback, keeps it interactive', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/error-boundary-streaming', { waitUntil: 'commit' });

    // The boundary never blocks streaming: the title and the footer AFTER the boundary both render.
    await expect(page.locator('#eb-title')).toHaveText('EB Streaming', { timeout: 10000 });
    await expect(page.locator('#eb-footer')).toHaveText('Footer shell', { timeout: 10000 });

    // The descendant threw during SSR, so the inline swap hides the content and reveals the fallback.
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: eb sync boom');
    await expect(page.locator('#eb-content')).toBeHidden();

    // The swapped-in fallback is interactive once the framework resumes.
    await page.locator('#eb-fallback-button').click();
    await expect(page.locator('#eb-fallback-count')).toHaveText('1');
  });

  test('async deferred throw: streams siblings + skeleton, then tears down the whole boundary', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/error-boundary-streaming?scenario=async&release=eb', {
      waitUntil: 'commit',
    });

    // Everything streams immediately — the boundary does not wait on the deferred child.
    await expect(page.locator('#eb-title')).toHaveText('EB Streaming', { timeout: 10000 });
    await expect(page.locator('#eb-sibling')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-skel')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-footer')).toHaveText('Footer shell', { timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toHaveCount(0);

    // Release the deferred child so it rejects.
    await releaseDeferred(page, '#eb-release');

    // The whole boundary — the streamed sibling and the Suspense — is torn down to the fallback.
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: eb async boom');
    await expect(page.locator('#eb-sibling')).toBeHidden();

    await page.locator('#eb-fallback-button').click();
    await expect(page.locator('#eb-fallback-count')).toHaveText('1');
  });

  // A client-time error on an SSR'd boundary (here in-order streaming, `outOfOrder=false`) must
  // re-render to the fallback — `fallback$` is a lazy QRL after resume, so the client render must
  // resolve it instead of calling it synchronously, and a throwing fallback render must not loop.
  test('client-time throw after resume re-renders the boundary to its fallback (in-order)', async ({
    page,
  }) => {
    // The intentional throw may log; we only care that the boundary recovers (no infinite loop).
    await page.goto('/e2e/error-boundary-streaming?scenario=client&outOfOrder=false', {
      waitUntil: 'commit',
    });

    // The boundary rendered fine — content is shown, no fallback yet.
    await expect(page.locator('#eb-content')).toHaveText('content ok', { timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toHaveCount(0);

    // A click handler that touches state then throws routes to the boundary, which re-renders to the
    // fallback (and must not infinite-loop handleError).
    await page.locator('#eb-client-throw').click();
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });

    // The recovered fallback is interactive.
    await page.locator('#eb-fallback-button').click();
    await expect(page.locator('#eb-fallback-count')).toHaveText('1');
  });

  // Same client-time throw, but on a boundary that streamed via out-of-order streaming (OOOS). The
  // fallback host holds the `qO` `<template q:r>` placeholder (no vnode), so the client re-render
  // must still tear the two-host structure down and render the fallback fresh.
  test('client-time throw after resume re-renders the boundary to its fallback (out-of-order)', async ({
    page,
  }) => {
    await page.goto('/e2e/error-boundary-streaming?scenario=client', {
      waitUntil: 'commit',
    });

    // The boundary streamed fine (no SSR error) — content is shown, no fallback yet.
    await expect(page.locator('#eb-content')).toHaveText('content ok', { timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toHaveCount(0);

    // A click handler that touches state then throws routes to the boundary. The boundary streamed
    // via OOOS (its fallback host holds only the empty `qO` placeholder), so it must re-render to the
    // fallback rather than just revealing the empty host.
    await page.locator('#eb-client-throw').click();
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });

    // The recovered fallback is interactive.
    await page.locator('#eb-fallback-button').click();
    await expect(page.locator('#eb-fallback-count')).toHaveText('1');
  });

  test('inert: a swapped-out content task does not re-run when an outside signal changes', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/error-boundary-streaming?scenario=inert', { waitUntil: 'commit' });

    // SSR threw inside the content → fallback shown, content swapped out (hidden).
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-content')).toBeHidden();

    // Baseline after resume: the dead content's task has not run on the client.
    expect(await page.evaluate(() => (window as any).__ebDeadTaskClientRuns ?? 0)).toBe(0);

    // Bump the tracked signal from OUTSIDE the boundary. The visible outside binding reacts (proving
    // the click + resume + reactivity are live)...
    await page.locator('#eb-inert-trigger').click();
    await expect(page.locator('#eb-inert-val')).toHaveText('1');

    // ...but the swapped-out (dead) content's task must NOT re-run on the client.
    expect(await page.evaluate(() => (window as any).__ebDeadTaskClientRuns ?? 0)).toBe(0);
  });

  // Happy path (replaces the legacy Qwik Router ErrorBoundary test): the content streams, stays
  // interactive after resume, ships no fallback and no swap script — and a later client throw is
  // still caught by the boundary (the second half of the old router test).
  test('happy path: content interactive after resume, no fallback or swap script, then catches a client throw', async ({
    page,
  }) => {
    const response = await page.goto('/e2e/error-boundary-streaming?scenario=happy', {
      waitUntil: 'commit',
    });
    const html = await response!.text();
    // No throw → no swap executor or swap call of either flavor is shipped in the SSR HTML.
    expect(html).not.toMatch(/qErr\(|qInstallErrorSwap|qO\(|qInstallOOOS/);

    // Content rendered, no fallback.
    await expect(page.locator('#eb-content')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toHaveCount(0);

    // Content is interactive after resume.
    await page.locator('#eb-content-button').click();
    await expect(page.locator('#eb-content-count')).toHaveText('1');

    // A client-time throw from inside the boundary is caught and the fallback is interactive.
    await page.locator('#eb-content-throw').click();
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-content')).toBeHidden();
    await page.locator('#eb-fallback-button').click();
    await expect(page.locator('#eb-fallback-count')).toHaveText('1');
  });

  // In-order SSR sync throw (`outOfOrder=false`): the simplest swap — `qErr` without any OOOS
  // machinery. The content streams, then the inline `qErr` hides it and reveals the fallback.
  test('in-order sync throw: qErr swap (no OOOS), fallback interactive', async ({ page }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/error-boundary-streaming?outOfOrder=false', { waitUntil: 'commit' });

    // The boundary never blocks: the title and the footer after it both render.
    await expect(page.locator('#eb-title')).toHaveText('EB Streaming', { timeout: 10000 });
    await expect(page.locator('#eb-footer')).toHaveText('Footer shell', { timeout: 10000 });

    // The descendant threw during SSR → fallback shown, content hidden.
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: eb sync boom');
    await expect(page.locator('#eb-content')).toBeHidden();

    await page.locator('#eb-fallback-button').click();
    await expect(page.locator('#eb-fallback-count')).toHaveText('1');
  });

  // Case b: an ErrorBoundary inside a deferred `<Suspense>` segment. The sync throw is caught within
  // the segment and a hoisted `qErr(id)` (emitted at the root right after the segment's `qO`) swaps
  // the boundary — the fallback must be interactive after resume.
  test('boundary inside a deferred <Suspense> (case b): hoisted qErr swap, fallback interactive', async ({
    page,
  }) => {
    assertNoBrowserErrors(page);
    await page.goto('/e2e/error-boundary-streaming?scenario=suspense', { waitUntil: 'commit' });

    // The page shell streams immediately; the Suspense defers into a segment.
    await expect(page.locator('#eb-title')).toHaveText('EB Streaming', { timeout: 10000 });
    await expect(page.locator('#eb-footer')).toHaveText('Footer shell', { timeout: 10000 });

    // The deferred segment resolves: the non-throwing sibling renders, the boundary is swapped to its
    // fallback within the same segment, and its content is hidden.
    await expect(page.locator('#eb-deferred-ok')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-fallback-msg')).toHaveText('caught: eb sync boom');
    await expect(page.locator('#eb-content')).toBeHidden();

    await page.locator('#eb-fallback-button').click();
    await expect(page.locator('#eb-fallback-count')).toHaveText('1');
  });

  // onError$ side-effect: a client-time throw is caught AND `onError$` fires exactly once with the
  // error, without affecting the rendered fallback.
  test('onError$ fires once with the error on a client-time throw', async ({ page }) => {
    // The intentional throw may log; we only assert the boundary recovers and onError$ ran.
    await page.goto('/e2e/error-boundary-streaming?scenario=onerror', { waitUntil: 'commit' });

    await expect(page.locator('#eb-content')).toHaveText('content ok', { timeout: 10000 });
    await page.locator('#eb-onerror-throw').click();

    // The boundary catches and shows its fallback...
    await expect(page.locator('#eb-fallback')).toBeVisible({ timeout: 10000 });
    // ...and onError$ ran exactly once with the caught error.
    await page.waitForFunction(() => (window as any).__ebOnErrorRuns === 1);
    expect(await page.evaluate(() => (window as any).__ebOnErrorMsg)).toBe('onerror boom');
  });

  // D2 cross-phase: the inner boundary errors on SSR (its fallback resumes). A later client throw
  // from a sibling of the inner boundary routes to the OUTER boundary, whose fallback replaces the
  // whole subtree — including the inner fallback — and stays interactive.
  test('D2: SSR inner error, then a client throw makes the outer boundary replace the whole subtree', async ({
    page,
  }) => {
    // The intentional outer throw may log; we only assert the boundary recovers.
    await page.goto('/e2e/error-boundary-streaming?scenario=nested', { waitUntil: 'commit' });

    // After resume the inner boundary shows its fallback; the outer boundary has not fired.
    await expect(page.locator('#eb-inner')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-inner-msg')).toHaveText('caught: eb sync boom');
    await expect(page.locator('#eb-outer')).toHaveCount(0);

    // A click on a sibling of the inner boundary throws and routes to the OUTER boundary.
    await page.locator('#eb-outer-throw').click();

    // The outer fallback replaces the whole subtree, including the inner fallback, and is interactive.
    await expect(page.locator('#eb-outer')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#eb-inner')).toHaveCount(0);
    await page.locator('#eb-outer-button').click();
    await expect(page.locator('#eb-outer-count')).toHaveText('1');
  });
});
