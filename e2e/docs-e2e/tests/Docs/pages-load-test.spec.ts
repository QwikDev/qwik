import { test, expect } from '@playwright/test';

test('home page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Framework reimagined for the edge! 📚 Qwik Documentation');
});

test('docs page loads', async ({ page }) => {
  await page.goto('/docs/');

  await expect(page).toHaveTitle('Overview | Introduction 📚 Qwik Documentation');

  const introductionLinksOnPage = await page
    .locator('#qwik-sidebar')
    .locator('details:has(summary h5:text("Introduction")) ul li a')
    .allTextContents();

  const expectedIntroductionLinks = ['Overview', 'Getting Started', 'Project structure', 'FAQ'];

  expect(introductionLinksOnPage).toStrictEqual(expectedIntroductionLinks);

  const componentsLinksOnPage = await page
    .locator('#qwik-sidebar')
    .locator('details:has(summary h5:text("Components")) ul li a')
    .allTextContents();

  const expectedComponentLinks = [
    'Overview',
    'State',
    'Events',
    'Tasks & Lifecycle',
    'Context',
    'Slots',
    'Rendering',
    'Styling',
    'API Reference',
  ];

  expect(componentsLinksOnPage).toStrictEqual(expectedComponentLinks);

  const qwikRouterLinksOnPage = await page
    .locator('#qwik-sidebar')
    .locator('details:has(summary h5:text("Qwik Router")) ul li a')
    .allTextContents();

  const expectedQwikRouterLinks = [
    'Overview',
    'Routing',
    'Pages',
    'Layouts',
    'Loaders',
    'Actions',
    'Validators',
    'Endpoints',
    'Middleware',
    'server$',
    'Error handling',
    'Re-exporting loaders',
    'Caching',
    'HTML attributes',
    'API reference',
  ];

  expect(qwikRouterLinksOnPage).toStrictEqual(expectedQwikRouterLinks);

  const cookbookLinksOnPage = await page
    .locator('#qwik-sidebar')
    .locator('details:has(summary h5:text("Cookbook")) ul li a')
    .allTextContents();

  const expectedCookbookLinks = [
    'Overview',
    'Algolia Search',
    'Combine Handlers',
    'Debouncer',
    'Fonts',
    'Glob Import',
    'Media Controller',
    'NavLink',
    'Node Docker deploy',
    'Portals',
    'Streaming loaders',
    'Sync events w state',
    'Theme Management',
    'Drag & Drop',
    'View Transition',
    'Detect img tag onLoad',
  ];

  // if you are adding a new page to the cookbook, please add a new test for the page to load too
  expect(cookbookLinksOnPage).toStrictEqual(expectedCookbookLinks);

  const integrationsLinksOnPage = await page
    .locator('#qwik-sidebar')
    .locator('details:has(summary h5:text("Integrations")) ul li a')
    .allTextContents();

  const expectedIntegrationsLinks = [
    'Overview',
    'Astro',
    'Auth.js',
    'Bootstrap',
    'Builder.io',
    'Cypress',
    'Drizzle',
    'i18n',
    'Icons',
    'Image Optimization',
    'Leaflet Map',
    'Modular Forms',
    'Nx Monorepos',
    'OG Image',
    'Orama',
    'Panda CSS',
    'Partytown',
    'Playwright',
    'PostCSS',
    'Prisma',
    'React',
    'Storybook',
    'Styled Vanilla Extract',
    'Supabase',
    'Tailwind',
    'Tauri',
    'Turso',
    'Vitest',
  ];

  expect(integrationsLinksOnPage).toStrictEqual(expectedIntegrationsLinks);

  const deploymentsLinksOnPage = await page
    .locator('#qwik-sidebar')
    .locator('details:has(summary h5:text("Deployments")) ul li a')
    .allTextContents();

  const expectedDeploymentsLinks = [
    'Overview',
    'Azure SWA',
    'AWS',
    'Firebase',
    'Google Cloud Run',
    'Cloudflare Pages',
    'Deno',
    'Bun',
    'Netlify Edge',
    'Node',
    'Self-Hosting',
    'Vercel Edge',
    'Static Site',
    'GitHub Pages',
    'Azion',
  ];

  expect(deploymentsLinksOnPage).toStrictEqual(expectedDeploymentsLinks);

  const guidesLinksOnPage = await page
    .locator('#qwik-sidebar')
    .locator('details:has(summary h5:text("Guides")) ul li a')
    .allTextContents();

  const expectedGuidesLinks = [
    'Qwik in a nutshell',
    'Markdown & MDX',
    'SSG',
    'Qwik Native Apps',
    'React Cheat Sheet',
    'Debugging',
    'Best Practices',
    'Bundle Optimization',
    'Env variables',
    'Rewrites',
  ];

  expect(guidesLinksOnPage).toStrictEqual(expectedGuidesLinks);

  const conceptsLinksOnPage = await page
    .locator('#qwik-sidebar')
    .locator('details:has(summary h5:text("Concepts")) ul li a')
    .allTextContents();

  const expectedConceptsLinks = ['Think Qwik', 'Resumable', 'Progressive', 'Reactivity'];

  expect(conceptsLinksOnPage).toStrictEqual(expectedConceptsLinks);

  const advancedLinksOnPage = await page
    .locator('#qwik-sidebar')
    .locator('details:has(summary h5:text("Advanced")) ul li a')
    .allTextContents();

  const expectedAdvancedLinks = [
    'The $ dollar sign',
    'Containers',
    'QRL',
    'Library mode',
    'Qwikloader',
    'Optimizer',
    'Modules Prefetching',
    'Build Directory',
    'Vite',
    'Advanced Routing',
    'Qwik Plugins',
    'Request Handling',
    'Speculative Module Fetching',
    'Menus',
    'Static Assets',
    'Sitemaps',
    'ESLint-Rules',
    'Content Security Policy',
    'Complex Forms',
  ];

  expect(advancedLinksOnPage).toStrictEqual(expectedAdvancedLinks);

  const referenceLinksOnPage = await page
    .locator('#qwik-sidebar')
    .locator('details:has(summary h5:text("Reference")) ul li a')
    .allTextContents();

  const expectedReferenceLinks = ['API Reference', 'Deprecated Features'];

  expect(referenceLinksOnPage).toStrictEqual(expectedReferenceLinks);

  const ExperimentalLinksOnPage = await page
    .locator('#qwik-sidebar')
    .locator('details:has(summary h5:text("Experimental 🧪")) ul li a')
    .allTextContents();

  const expectedExperimentalLinks = [
    'Overview',
    'Insights',
    'Typed Routes',
    'Devtools',
    'usePreventNavigate',
  ];

  expect(ExperimentalLinksOnPage).toStrictEqual(expectedExperimentalLinks);

  const communityLinksOnPage = await page
    .locator('#qwik-sidebar')
    .locator('details:has(summary h5:text("Community")) ul li a')
    .allTextContents();

  const expectedCommunityLinks = ['GitHub', '@QwikDev', 'Discord', 'Community Projects', 'Values'];

  expect(communityLinksOnPage).toStrictEqual(expectedCommunityLinks);
});

test('getting started page loads', async ({ page }) => {
  await page.goto('/docs/getting-started/');
  await expect(page).toHaveTitle('Getting Started | Introduction 📚 Qwik Documentation');
});

test('Project Structure page loads', async ({ page }) => {
  await page.goto('/docs/project-structure/');
  await expect(page).toHaveTitle('Project Structure | Qwik Router 📚 Qwik Documentation');
});

test('FAQ page loads', async ({ page }) => {
  await page.goto('/docs/faq/');
  await expect(page).toHaveTitle('Frequently Asked Questions | Introduction 📚 Qwik Documentation');
});
