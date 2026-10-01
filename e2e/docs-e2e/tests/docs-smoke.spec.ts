import { test, expect } from '@playwright/test';

test.describe('Docs site smoke tests', () => {
  test('home page loads', async ({ page }) => {
    await page.goto('/');
    // Check the page has loaded with meaningful content
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page).toHaveTitle(/Qwik/);
  });

  test('home page LCP is the hero heading rather than its decoration', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 823 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.goto('/');
    const maskImage = await page.locator('main').evaluate((element) => {
      return getComputedStyle(element, '::before').maskImage;
    });
    expect(maskImage).toBe('none');
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
    });

    const lcpTag = await page.evaluate(
      () =>
        new Promise<string | undefined>((resolve) => {
          const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries() as (PerformanceEntry & { element?: Element })[];
            resolve(entries.at(-1)?.element?.tagName);
            observer.disconnect();
          });
          observer.observe({ type: 'largest-contentful-paint', buffered: true });
        })
    );
    expect(lcpTag).toBe('H1');
  });

  test('shared grid decoration covers the blog and 404 page', async ({ page }) => {
    for (const path of ['/blog/', '/missing-grid-page/']) {
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      const container = page.locator('.bg-grid-stars');
      const grid = container.locator(':scope > svg');
      await expect(grid).toHaveAttribute('aria-hidden', 'true');
      expect(await grid.boundingBox()).toEqual(await container.boundingBox());
    }
  });

  test('desktop menu content slides in the direction of navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/docs/');

    const section = (name: string) =>
      page.locator('[ui-qds-popover-root]').filter({ has: page.getByRole('button', { name }) });

    await section('Core').locator('[ui-qds-popover-trigger]').hover();
    await expect(section('Core')).toHaveAttribute('ui-open', 'true');
    await expect(section('Core').locator('[ui-qds-popover-content]')).not.toHaveAttribute(
      'data-nav-slide',
      /.+/
    );

    await section('Router').locator('[ui-qds-popover-trigger]').hover();
    await expect(section('Router')).toHaveAttribute('ui-open', 'true');
    await expect(section('Router').locator('[ui-qds-popover-content]')).toHaveAttribute(
      'data-nav-slide',
      'right'
    );
    await expect(section('Router').locator('[ui-qds-popover-content]')).toHaveCSS(
      'animation-name',
      'nav-slide'
    );
    await expect(section('Router').locator('[ui-qds-popover-content]')).toHaveCSS(
      '--nav-slide-from',
      '-24px'
    );

    await section('Ecosystem').locator('[ui-qds-popover-trigger]').hover();
    await expect(section('Ecosystem')).toHaveAttribute('ui-open', 'true');
    await expect(section('Ecosystem').locator('[ui-qds-popover-content]')).toHaveAttribute(
      'data-nav-slide',
      'left'
    );
    await expect(section('Ecosystem').locator('[ui-qds-popover-content]')).toHaveCSS(
      'animation-name',
      'nav-slide'
    );
    await expect(section('Ecosystem').locator('[ui-qds-popover-content]')).toHaveCSS(
      '--nav-slide-from',
      '24px'
    );

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await section('Resources').locator('[ui-qds-popover-trigger]').hover();
    await expect(section('Resources')).toHaveAttribute('ui-open', 'true');
    await expect(section('Resources').locator('[ui-qds-popover-content]')).toHaveCSS(
      'animation-name',
      'none'
    );
  });

  test('tutorial starts directly below the header', async ({ page }) => {
    await page.goto('/tutorial/welcome/overview/');

    for (const width of [1600, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const nav = await page.locator('[ui-qds-navbar-root]').boundingBox();
      const main = await page.locator('.tutorial main').boundingBox();
      expect(nav).not.toBeNull();
      expect(main).not.toBeNull();
      expect(main!.y - (nav!.y + nav!.height)).toBeGreaterThanOrEqual(16);
      expect(main!.y - (nav!.y + nav!.height)).toBeLessThanOrEqual(32);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    const panelToggle = await page.locator('.tutorial .panel-toggle').boundingBox();
    const main = await page.locator('.tutorial main').boundingBox();
    expect(panelToggle).not.toBeNull();
    expect(main).not.toBeNull();
    expect(main!.y).toBe(panelToggle!.y + panelToggle!.height);
  });

  test('search suggestion points to the getting started page', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/docs/');
    await page.locator('button:has(svg.size-6.text-foreground-base):visible').first().click();
    await expect(page.locator('.search-modal:visible a[href]').first()).toHaveAttribute(
      'href',
      '/docs/getting-started/'
    );
  });

  test('search loads its index after opening the modal', async ({ page }) => {
    await page.route('**/pagefind/pagefind.js', (route) => route.abort());
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/docs/');
    await page.locator('button:has(svg.size-6.text-foreground-base):visible').first().click();
    await page.getByPlaceholder('Search docs').filter({ visible: true }).fill('qwik');
    await expect(
      page.getByText(/Search index unavailable/).filter({ visible: true })
    ).toBeVisible();
  });

  test('media controls play and pause through button events', async ({ page }) => {
    await page.goto('/demo/cookbook/mediaController/');
    await page.locator('video, audio').evaluateAll((elements) => {
      for (const element of elements) {
        const media = element as HTMLMediaElement;
        media.play = () => {
          media.dataset.action = 'play';
          media.dispatchEvent(new Event('play'));
          return Promise.resolve();
        };
        media.pause = () => {
          media.dataset.action = 'pause';
          media.dispatchEvent(new Event('pause'));
        };
      }
    });

    await page.getByRole('button', { name: 'Play Video' }).click();
    await expect(page.locator('video')).toHaveAttribute('data-action', 'play');
    await page.getByRole('button', { name: 'Pause Video' }).click();
    await expect(page.locator('video')).toHaveAttribute('data-action', 'pause');

    await page.getByRole('button', { name: 'Play Audio' }).click();
    await expect(page.locator('audio')).toHaveAttribute('data-action', 'play');
    await page.getByRole('button', { name: 'Pause Audio' }).click();
    await expect(page.locator('audio')).toHaveAttribute('data-action', 'pause');
  });

  test('html dark class applies semantic colors', async ({ page }) => {
    await page.goto('/docs/');
    await page.locator('html').evaluate((html) => html.classList.add('dark'));
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(12, 7, 20)');
  });

  test('theme switch follows the system and remembers manual choices', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');

    const html = page.locator('html');
    const themeSwitch = page.getByRole('button', { name: 'Change color theme' });
    await expect(themeSwitch).toBeVisible();
    await expect(html).toHaveClass(/\bdark\b/);
    await expect(html).toHaveAttribute('data-theme-auto', '');
    await expect(themeSwitch.locator('.themeIcon.auto')).toHaveCSS('opacity', '1');
    await expect(themeSwitch.locator('.themeIcon.auto')).toHaveCSS(
      'transition-duration',
      '0.42s, 0.18s'
    );
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBeNull();

    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await expect(themeSwitch.locator('.themeIcon.auto')).toHaveCSS('transition-duration', '0s');
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'no-preference' });

    await themeSwitch.click();
    await expect(html).not.toHaveClass(/\bdark\b/);
    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect(themeSwitch.locator('.themeIcon.light')).toHaveCSS('opacity', '1');
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('light');

    await page.reload();
    await expect(html).not.toHaveClass(/\bdark\b/);
    await expect(html).toHaveAttribute('data-theme', 'light');

    await themeSwitch.click();
    await expect(html).toHaveClass(/\bdark\b/);
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');

    await themeSwitch.click();
    await expect(html).toHaveAttribute('data-theme-auto', '');
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBeNull();
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(html).not.toHaveClass(/\bdark\b/);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(themeSwitch).toBeHidden({ timeout: 3000 });
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(themeSwitch).toBeVisible();
    await themeSwitch.click();
    await expect(themeSwitch).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('light');
  });

  test('code examples and previews follow the docs theme', async ({ page }) => {
    await page.goto('/docs/core/state/');
    const code = page.locator('article pre.shiki').first();
    const token = code.locator('span[style*="--shiki-dark"]').first();
    const highlightedLine = code.locator('.highlighted').first();
    const highlightedWord = code.locator('.highlighted-word').first();
    const preview = page.frameLocator('iframe[src*="/demo/state/counter-signal/"]');

    await page.locator('html').evaluate((html) => {
      html.classList.remove('dark');
      html.setAttribute('data-theme', 'light');
    });
    await expect(code).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(token).toHaveCSS('color', 'rgb(215, 58, 73)');
    await expect(preview.locator('html')).not.toHaveClass(/\bdark\b/);

    await page.locator('html').evaluate((html) => {
      html.classList.add('dark');
      html.setAttribute('data-theme', 'dark');
    });
    await expect(code).toHaveCSS('background-color', 'rgb(12, 7, 20)');
    await expect(token).toHaveCSS('color', 'rgb(249, 117, 131)');
    await expect(highlightedLine).toHaveCSS(
      'background-color',
      'color(srgb 0.0352941 0.118627 0.191176)'
    );
    await expect(highlightedWord).toHaveCSS(
      'background-color',
      'color(srgb 0.0305882 0.137255 0.212941)'
    );
    await expect(preview.locator('html')).toHaveClass(/\bdark\b/);
    await expect(preview.locator('body')).toHaveCSS('background-color', 'rgb(12, 7, 20)');
  });

  test('playground editor follows the docs theme', async ({ page }) => {
    await page.goto('/playground/');
    const editor = page.locator('.monaco-editor .monaco-editor-background').first();

    await page.locator('html').evaluate((html) => {
      html.classList.remove('dark');
      html.setAttribute('data-theme', 'light');
    });
    await expect(editor).toHaveCSS('background-color', 'rgb(255, 255, 255)');

    await page.locator('html').evaluate((html) => {
      html.classList.add('dark');
      html.setAttribute('data-theme', 'dark');
    });
    await expect(editor).toHaveCSS('background-color', 'rgb(30, 30, 30)');
  });

  test('docs overview page loads with sidebar', async ({ page }) => {
    await page.goto('/docs/');
    await expect(page).toHaveTitle(/Qwik/);

    const sidebar = page.locator('[data-docs-sidebar]');
    await expect(sidebar).toBeVisible();
    const fontPreloads = page.locator('link[rel="preload"][as="font"]');
    await expect(fontPreloads).toHaveCount(3);
    await expect(
      page.locator('link[rel="preload"][as="font"][href*="tomorrow-latin-600-normal"]')
    ).toHaveCount(1);
    await expect(
      page.locator('link[rel="preload"][as="font"][href*="ubuntu-sans-latin-600-normal"]')
    ).toHaveCount(1);
    await expect(
      page.locator('link[rel="preload"][as="font"][href*="ubuntu-sans-latin-700-normal"]')
    ).toHaveCount(1);

    const links = sidebar.locator('a[href]');
    expect(await links.count()).toBeGreaterThanOrEqual(5);
    await expect(sidebar.locator('a[href^="/"]:not([q\\:link])')).toHaveCount(0);
    expect(await sidebar.locator('svg.vanilla-icon').count()).toBeGreaterThanOrEqual(5);
    await expect(sidebar.locator('details').first()).toBeVisible();
    await expect(sidebar.locator('a[aria-current="page"]')).toHaveCount(1);
    await expect(page.locator('.docs-shell ~ [data-docs-sidebar]')).toHaveCount(1);
  });

  for (const viewport of [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'tablet', width: 1024, height: 768 },
  ]) {
    test(`${viewport.name} docs sidebar closes manually and after SPA navigation`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto('/docs/');

      const sidebar = page.locator('[data-docs-sidebar] nav');
      await expect(sidebar).not.toBeInViewport();
      await page.getByRole('button', { name: 'Open sidebar' }).click();
      await expect(page.getByRole('button', { name: 'Close sidebar' })).toBeVisible();
      await expect(sidebar).toBeInViewport();
      await page.getByRole('button', { name: 'Close sidebar' }).click();
      await expect(sidebar).not.toBeInViewport();

      await page.getByRole('button', { name: 'Open sidebar' }).click();
      await sidebar.getByRole('link', { name: 'Getting Started', exact: true }).click();
      await expect(page).toHaveURL(/\/docs\/getting-started\/$/);
      await expect(page.getByRole('button', { name: 'Open sidebar' })).toBeVisible();
      await expect(sidebar).not.toBeInViewport();
    });
  }

  test('getting started page loads', async ({ page }) => {
    await page.goto('/docs/getting-started/');
    await expect(page).toHaveTitle(/Getting Started/);
    await expect(page.locator('article').first()).toBeVisible();
  });

  test('routing docs page loads', async ({ page }) => {
    await page.goto('/docs/routing/');
    await expect(page).toHaveTitle(/Routing/);
    await expect(page.locator('article').first()).toBeVisible();
  });

  test('client-side navigation works', async ({ page }) => {
    await page.goto('/docs/');

    // Navigate via a direct link rather than trying to click sidebar elements
    // that may be obscured by fixed overlays
    const response = await page.goto('/docs/getting-started/');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/Getting Started/);

    // Click a link within the article content to test client-side nav
    const articleLink = page.locator('article a[href^="/docs/"]').first();
    if (await articleLink.count()) {
      const href = await articleLink.getAttribute('href');
      await articleLink.click();
      if (href) {
        await page.waitForURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      }
    }
  });

  test('ecosystem page loads', async ({ page }) => {
    await page.goto('/ecosystem/');
    await expect(page).toHaveTitle(/Qwik/);
    await expect(page.locator('main').first()).toBeVisible();
  });

  test('404 page works', async ({ page }) => {
    const response = await page.goto('/this-page-does-not-exist-12345/');
    // Should get a 404 status or show error content
    expect(response?.status()).toBe(404);
  });
});
