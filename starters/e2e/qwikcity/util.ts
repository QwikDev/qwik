/* eslint-disable */
import type { BrowserContext, Page, Response } from "@playwright/test";
import { expect } from "@playwright/test";

export async function assertPage(ctx: TestContext, test: AssertPage) {
  const page = getPage(ctx);
  const pageUrl = new URL(page.url());
  const html = page.locator("html");

  expect(await html.getAttribute("q:version")).toBeDefined();
  expect(await html.getAttribute("q:base")).toBeDefined();
  expect(await html.getAttribute("q:id")).toBeDefined();

  const head = html.locator("head");
  expect(await head.getAttribute("q:id")).toBeDefined();

  if (test.pathname) {
    expect(pageUrl.pathname).toBe(test.pathname);

    const canonical = head.locator('link[rel="canonical"]');
    const href = await canonical.getAttribute("href");
    const canonicalUrl = new URL(href!);
    expect(canonicalUrl.pathname).toBe(test.pathname);
  }

  if (test.title) {
    const title = head.locator("title");
    expect(await title.innerText()).toBe(test.title);
  }

  let parentLocator = page.locator("body");
  if (test.layoutHierarchy) {
    for (const layoutName of test.layoutHierarchy) {
      const selector = `[data-test-layout="${layoutName}"]`;
      parentLocator = parentLocator.locator(selector);
      expect(
        await parentLocator.isVisible(),
        `Incorrect layout hierarchy, did not find "${selector}", pathname: ${pageUrl.pathname}`,
      ).toBe(true);
    }

    const noFindChildLayout = parentLocator.locator(`[data-test-layout]`);
    if (await noFindChildLayout.isVisible()) {
      const layoutName =
        await noFindChildLayout.getAttribute("data-test-layout")!;
      expect(
        layoutName,
        `Should not be another nested layout, but found [data-test-layout="${layoutName}"], pathname: ${pageUrl.pathname}`,
      ).toBe(null);
    }
  }

  if (test.h1) {
    const h1 = parentLocator.locator("h1");
    expect(await h1.innerText()).toBe(test.h1);
  }

  const activeLink = locator(
    ctx,
    `header [data-test-header-links] a[class="active"]`,
  );
  if (typeof test.activeHeaderLink === "string") {
    if (await activeLink.isVisible()) {
      expect(await activeLink.innerText()).toBe(test.activeHeaderLink);
    } else {
      expect(true, `Header link "${test.activeHeaderLink}" not active`).toBe(
        false,
      );
    }
  } else if (test.activeHeaderLink === false) {
    if (await activeLink.isVisible()) {
      expect(true, `There should not be an active header link`).toBe(false);
    }
  }
}

interface AssertPage {
  pathname?: string;
  title?: string;
  h1?: string;
  layoutHierarchy?: string[];
  activeHeaderLink?: string | false;
}

export async function linkNavigate(
  ctx: TestContext,
  linkSelector: string,
  responseStatus = 200,
) {
  const page = getPage(ctx);
  const link = page.locator(linkSelector);

  if (!(await link.isVisible())) {
    expect(true, `Link selector ${linkSelector} not found`).toBe(false);
  }

  const href = await link.getAttribute("href")!;
  console.log(`       ${href}`);

  if (ctx.javaScriptEnabled) {
    // SPA
    await link.click();
    await page.waitForTimeout(500);
  } else {
    // MPA
    const [rsp] = await Promise.all([page.waitForNavigation(), link.click()]);

    const rspStatus = rsp!.status();
    if (rspStatus !== responseStatus) {
      const content = await rsp?.text();
      expect(rspStatus, `${href} (${rspStatus})\n${content}`).toBe(
        responseStatus,
      );
    }
  }
}

export async function getScrollHeight(page: Page) {
  return await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
}

export async function getWindowScrollXY(page: Page) {
  return await page.evaluate<[number, number]>(() => [
    window.scrollX,
    window.scrollY,
  ]);
}

export async function scrollTo(page: Page, x: number, y: number) {
  return await page.evaluate<void, [number, number]>(
    ([x, y]) => window.scrollTo(x, y),
    [x, y],
  );
}

export async function scrollDetector(page: Page) {
  return page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        document.addEventListener("scroll", () => resolve(), { once: true }),
      ),
  );
}

export async function scrollDebounceDetector(page: Page) {
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (!window["_qCityScrollDebounce"]) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 50);
    });
  });
}

export function locator(ctx: TestContext, selector: string) {
  const page = getPage(ctx);
  return page.locator(selector);
}

export function getPage(ctx: TestContext) {
  return ctx.browserContext.pages()[0]!;
}

export async function load(
  browserContext: BrowserContext,
  javaScriptEnabled: boolean | undefined,
  pathname: string,
): Promise<TestContext> {
  console.log(
    `Load: ${pathname} (js ${javaScriptEnabled ? "enabled" : "disabled"})`,
  );

  const page = await browserContext.newPage();
  const response = (await page.goto(pathname))!;
  const status = response.status();

  if (status !== 200) {
    const text = await response.text();
    expect(status, `${pathname} (${status})\n${text}`).toBe(200);
  }

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
