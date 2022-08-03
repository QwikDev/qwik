import { expect, test } from '@playwright/test';
import { assertPage, getPage, linkNavigate, load, locator } from './util.js';

test('Qwik City Page', async ({ context, javaScriptEnabled }) => {
  const ctx = await load(context, javaScriptEnabled, '/');

  /***********  Home Page  ***********/
  await assertPage(ctx, {
    pathname: '/',
    title: 'Welcome to Qwik City - Qwik',
    layoutHierarchy: ['root'],
    h1: 'Welcome to Qwik City',
    activeHeaderLink: false,
  });

  /***********  Blog: home  ***********/
  await linkNavigate(ctx, '[data-test-link="blog-home"]');
  await assertPage(ctx, {
    pathname: '/blog',
    title: 'Welcome to our Blog! - Qwik',
    layoutHierarchy: ['root', 'blog'],
    h1: 'Welcome to our Blog!',
    activeHeaderLink: 'Blog',
  });

  /***********  Blog: resumability  ***********/
  await linkNavigate(ctx, '[data-test-link="blog-resumability"]');
  await assertPage(ctx, {
    pathname: '/blog/what-is-resumability',
    title: 'Blog: what-is-resumability - Qwik',
    layoutHierarchy: ['root', 'blog'],
    h1: 'Blog: what-is-resumability',
    activeHeaderLink: 'Blog',
  });

  /***********  Blog: serializing-props  ***********/
  await linkNavigate(ctx, '[data-test-link="blog-serializing-props"]');
  await assertPage(ctx, {
    pathname: '/blog/serializing-props',
    title: 'Blog: serializing-props - Qwik',
    layoutHierarchy: ['root', 'blog'],
    h1: 'Blog: serializing-props',
    activeHeaderLink: 'Blog',
  });

  /***********  Docs: home  ***********/
  await linkNavigate(ctx, '[data-test-link="docs-home"]');
  await assertPage(ctx, {
    pathname: '/docs',
    title: 'Docs: Welcome! - Qwik',
    layoutHierarchy: ['docs'],
    h1: 'Welcome to the Docs!',
    activeHeaderLink: 'Docs',
  });

  /***********  Docs: overview  ***********/
  await linkNavigate(ctx, '[data-test-menu-link="/docs/overview"]');
  await assertPage(ctx, {
    pathname: '/docs/overview',
    title: 'Docs: Overview - Qwik',
    layoutHierarchy: ['docs'],
    h1: 'Overview',
    activeHeaderLink: 'Docs',
  });

  /***********  Products: hat  ***********/
  await linkNavigate(ctx, '[data-test-link="products-hat"]');
  await assertPage(ctx, {
    pathname: '/products/hat',
    title: 'Product hat, $21.96 - Qwik',
    layoutHierarchy: ['root'],
    h1: 'Product: hat',
    activeHeaderLink: 'Products',
  });

  /***********  Products: jacket  ***********/
  await linkNavigate(ctx, '[data-test-link="products-jacket"]');
  await assertPage(ctx, {
    pathname: '/products/jacket',
    title: 'Product jacket, $48.96 - Qwik',
    layoutHierarchy: ['root'],
    h1: 'Product: jacket',
    activeHeaderLink: 'Products',
  });

  /***********  Products: shirt (301 redirect to /products/tshirt)  ***********/
  await linkNavigate(ctx, '[data-test-link="products-shirt"]');
  await assertPage(ctx, {
    pathname: '/products/tshirt',
    title: 'Product tshirt, $18.96 - Qwik',
    layoutHierarchy: ['root'],
    h1: 'Product: tshirt',
    activeHeaderLink: 'Products',
  });

  /***********  Products: hoodie (404)  ***********/
  await linkNavigate(ctx, '[data-test-link="products-hoodie"]', 404);
  const page = getPage(ctx);
  const html = page.locator('html');
  expect(await html.getAttribute('data-qwik-city-status')).toBe('404');

  await page.goBack();

  /***********  About Us  ***********/
  await linkNavigate(ctx, '[data-test-link="about-us"]');
  await assertPage(ctx, {
    pathname: '/about-us',
    title: 'About Us - Qwik',
    layoutHierarchy: ['root'],
    h1: 'About Us',
    activeHeaderLink: 'About Us',
  });

  /***********  API: home  ***********/
  await linkNavigate(ctx, '[data-test-link="api-home"]');
  await assertPage(ctx, {
    pathname: '/api',
    title: 'API: /api - Qwik',
    layoutHierarchy: ['api'],
    h1: 'Qwik City Test API!',
    activeHeaderLink: 'API',
  });

  const nodeVersion = locator(ctx, '[data-test-api-node]');
  if (javaScriptEnabled) {
    // TODO!!
  } else {
    // no useClientEffect()
    expect(await nodeVersion.innerText()).toBe('');
  }

  /***********  MIT  ***********/
  await linkNavigate(ctx, '[data-test-link="mit"]');
  await assertPage(ctx, {
    pathname: '/mit',
    title: 'MIT License - Qwik',
    layoutHierarchy: [],
    h1: 'MIT License',
  });
});
