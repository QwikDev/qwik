import { expect, test } from '@playwright/test';
import { assertPage, linkNavigate, load, locator } from './util.js';

test.describe('Qwik Router Menu', () => {
  test.describe('mpa', () => {
    test.use({ javaScriptEnabled: false });
    tests();
  });
  test.describe('spa', () => {
    test.use({ javaScriptEnabled: true });
    tests();
  });
});

function tests() {
  test('Qwik Router Menu', async ({ context, javaScriptEnabled }) => {
    const ctx = await load(context, javaScriptEnabled, '/qwikrouter-test/');

    /** Docs: home ********** */
    await linkNavigate(ctx, '[data-test-link="docs-home"]');
    await assertPage(ctx, {
      pathname: '/qwikrouter-test/docs/',
      title: 'Docs: Welcome! - Qwik',
      layoutHierarchy: ['docs'],
      h1: 'Welcome to the Docs!',
      activeHeaderLink: 'Docs',
    });

    let menuHeader = locator(ctx, `[data-test-menu-header="0"]`);
    await expect(menuHeader).toHaveText('Introduction', { useInnerText: true });

    let breadcrumb0 = locator(ctx, `[data-test-breadcrumb="0"]`);
    if (await breadcrumb0.isVisible()) {
      expect(true, `Breadcrumb selector ${breadcrumb0} found`).toBe(false);
    }

    /** Docs: overview ********** */
    await linkNavigate(ctx, '[data-test-menu-link="/qwikrouter-test/docs/overview/"]');
    await assertPage(ctx, {
      pathname: '/qwikrouter-test/docs/overview/',
      title: 'Docs: Overview - Qwik',
      layoutHierarchy: ['docs'],
      h1: 'Overview',
      activeHeaderLink: 'Docs',
    });

    menuHeader = locator(ctx, `[data-test-menu-header="0"]`);
    await expect(menuHeader).toHaveText('Introduction', { useInnerText: true });

    breadcrumb0 = locator(ctx, `[data-test-breadcrumb="0"]`);
    await expect(breadcrumb0).toHaveText('Introduction', { useInnerText: true });

    let breadcrumb1 = locator(ctx, `[data-test-breadcrumb="1"]`);
    await expect(breadcrumb1).toHaveText('Overview', { useInnerText: true });

    /** Docs: getting-started ********** */
    await linkNavigate(ctx, '[data-test-menu-link="/qwikrouter-test/docs/getting-started/"]');
    await assertPage(ctx, {
      pathname: '/qwikrouter-test/docs/getting-started/',
      title: 'Docs: @qwik.dev/core Getting Started - Qwik',
      layoutHierarchy: ['docs'],
      h1: 'Getting Started',
      activeHeaderLink: 'Docs',
    });

    menuHeader = locator(ctx, `[data-test-menu-header="0"]`);
    await expect(menuHeader).toHaveText('Introduction', { useInnerText: true });

    breadcrumb0 = locator(ctx, `[data-test-breadcrumb="0"]`);
    await expect(breadcrumb0).toHaveText('Introduction', { useInnerText: true });

    breadcrumb1 = locator(ctx, `[data-test-breadcrumb="1"]`);
    await expect(breadcrumb1).toHaveText('Getting Started', { useInnerText: true });

    /** Docs: core/basics ********** */
    await linkNavigate(ctx, '[data-test-menu-link="/qwikrouter-test/docs/core/basics/"]');
    await assertPage(ctx, {
      pathname: '/qwikrouter-test/docs/core/basics/',
      title: 'Docs: core basics - Qwik',
      layoutHierarchy: ['docs'],
      h1: 'Docs: core basics',
      activeHeaderLink: 'Docs',
    });

    menuHeader = locator(ctx, `[data-test-menu-header="0"]`);
    await expect(menuHeader).toHaveText('Introduction', { useInnerText: true });

    breadcrumb0 = locator(ctx, `[data-test-breadcrumb="0"]`);
    await expect(breadcrumb0).toHaveText('Core', { useInnerText: true });

    breadcrumb1 = locator(ctx, `[data-test-breadcrumb="1"]`);
    await expect(breadcrumb1).toHaveText('Basics', { useInnerText: true });

    /** Docs: core/listeners ********** */
    await linkNavigate(ctx, '[data-test-menu-link="/qwikrouter-test/docs/core/listeners/"]');
    await assertPage(ctx, {
      pathname: '/qwikrouter-test/docs/core/listeners/',
      title: 'Docs: core listeners - Qwik',
      layoutHierarchy: ['docs'],
      h1: 'Docs: core listeners',
      activeHeaderLink: 'Docs',
    });

    menuHeader = locator(ctx, `[data-test-menu-header="0"]`);
    await expect(menuHeader).toHaveText('Introduction', { useInnerText: true });

    breadcrumb0 = locator(ctx, `[data-test-breadcrumb="0"]`);
    await expect(breadcrumb0).toHaveText('Core', { useInnerText: true });

    breadcrumb1 = locator(ctx, `[data-test-breadcrumb="1"]`);
    await expect(breadcrumb1).toHaveText('Listeners', { useInnerText: true });
  });
}
