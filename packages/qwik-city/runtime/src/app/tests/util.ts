/* eslint-disable */
import type { BrowserContext, Response } from '@playwright/test';
import { expect } from '@playwright/test';

export async function assertPage(ctx: TestContext, test: AssertPage) {
  const page = getPage(ctx);
  const html = page.locator('html');

  expect(await html.getAttribute('q:version')).toBeDefined();
  expect(await html.getAttribute('q:base')).toBeDefined();
  expect(await html.getAttribute('q:id')).toBeDefined();

  const head = html.locator('head');
  expect(await head.getAttribute('q:host')).toBeDefined();
  expect(await head.getAttribute('q:id')).toBeDefined();

  const pageUrl = new URL(page.url());
  expect(pageUrl.pathname).toBe(test.pathname);

  const title = head.locator('title');
  expect(await title.innerText()).toBe(test.title);

  const canonical = head.locator('link[rel="canonical"]');
  const href = await canonical.getAttribute('href');
  const canonicalUrl = new URL(href!);
  expect(canonicalUrl.pathname).toBe(test.pathname);

  const twitterTitle = head.locator('meta[name="twitter:title"]');
  expect(await twitterTitle.getAttribute('content')).toBe('Qwik');

  let parentLocator = page.locator('body');
  for (const layoutName of test.layoutHierarchy) {
    const selector = `[data-test-layout="${layoutName}"]`;
    parentLocator = parentLocator.locator(selector);
    expect(
      await parentLocator.isVisible(),
      `Incorrect layout hierarchy, did not find "${selector}"`
    ).toBe(true);
  }

  const noFindChildLayout = parentLocator.locator(`[data-test-layout]`);
  if (await noFindChildLayout.isVisible()) {
    const layoutName = await noFindChildLayout.getAttribute('data-test-layout')!;
    expect(
      layoutName,
      `Should not be another nested layout, but found [data-test-layout="${layoutName}"]`
    ).toBe(null);
  }

  const h1 = parentLocator.locator('h1');
  expect(await h1.innerText()).toBe(test.h1);

  const activeLink = locator(ctx, `header [data-test-header-links] a[class="active"]`);
  if (typeof test.activeHeaderLink === 'string') {
    if (await activeLink.isVisible()) {
      expect(await activeLink.innerText()).toBe(test.activeHeaderLink);
    } else {
      expect(true, `Header link "${test.activeHeaderLink}" not active`).toBe(false);
    }
  } else if (test.activeHeaderLink === false) {
    if (await activeLink.isVisible()) {
      expect(true, `There should not be an active header link`).toBe(false);
    }
  }
}

interface AssertPage {
  pathname: string;
  title: string;
  h1: string;
  layoutHierarchy: string[];
  activeHeaderLink: string | false;
}

export async function linkNavigate(ctx: TestContext, linkSelector: string, responseStatus = 200) {
  const page = getPage(ctx);
  const link = page.locator(linkSelector);

  if (!(await link.isVisible())) {
    expect(true, `Link selector ${linkSelector} not found`).toBe(false);
  }

  console.log(`Navigate: ${await link.getAttribute('href')!}`);

  if (ctx.javaScriptEnabled) {
    // SPA
    await link.click();
    await page.waitForTimeout(250);
  } else {
    // MPA
    const [rsp] = await Promise.all([page.waitForNavigation(), link.click()]);
    expect(rsp!.status()).toBe(responseStatus);
  }
}

export function locator(ctx: TestContext, selector: string) {
  const page = getPage(ctx);
  return page.locator(selector);
}

function getPage(ctx: TestContext) {
  return ctx.browserContext.pages()[0]!;
}

export async function load(
  browserContext: BrowserContext,
  javaScriptEnabled: boolean | undefined,
  initUrl: string
): Promise<TestContext> {
  console.log('JavaScript Enabled:', javaScriptEnabled);

  console.log(`Load: ${initUrl}`);
  const page = await browserContext.newPage();
  const response = (await page.goto(initUrl))!;

  expect(response.status()).toBe(200);

  return {
    browserContext,
    javaScriptEnabled: !!javaScriptEnabled,
    response,
  };
}

export interface TestContext {
  browserContext: BrowserContext;
  javaScriptEnabled: boolean;
  response: Response;
}
