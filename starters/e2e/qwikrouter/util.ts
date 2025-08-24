/* eslint-disable */
import type { BrowserContext, Page, Response } from "@playwright/test";
import { expect } from "@playwright/test";

export async function assertPage(ctx: TestContext, test: AssertPage) {
  const page = getPage(ctx);
  const pageUrl = new URL(page.url());
  const html = page.locator("html");
  const head = html.locator("head");

  if (test.pathname) {
    await expect(html).toHaveAttribute("q:version");
    await expect(html).toHaveAttribute("q:base");

    // Build expected URL with or without search params
    let expectedHref = pageUrl.origin + test.pathname;
    if (test.searchParams && test.searchParams !== "empty") {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(test.searchParams)) {
        searchParams.append(key, value);
      }
      expectedHref += "?" + searchParams.toString();
    }

    await expect(page).toHaveURL(expectedHref);

    const canonical = head.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute("href", expectedHref);
  }

  if (test.searchParams) {
    if (test.searchParams === "empty") {
      expect(pageUrl.searchParams.size).toBe(0);
    } else {
      for (const [key, value] of Object.entries(test.searchParams)) {
        expect(pageUrl.searchParams.get(key)).toBe(value);
      }
    }
  }

  if (test.title) {
    const title = head.locator("title");
    await expect(title).toHaveText(test.title, {
      useInnerText: true,
    });
  }

  let parentLocator = page.locator("body");
  if (test.layoutHierarchy) {
    for (const layoutName of test.layoutHierarchy) {
      const selector = `[data-test-layout="${layoutName}"]`;
      parentLocator = parentLocator.locator(selector);
      await expect(
        parentLocator,
        `Incorrect layout hierarchy, did not find "${selector}", pathname: ${pageUrl.pathname}`,
      ).toBeVisible();
    }

    const noFindChildLayout = parentLocator.locator(`[data-test-layout]`);
    if (await noFindChildLayout.isVisible()) {
      const layoutName =
        await noFindChildLayout.getAttribute("data-test-layout")!;

      await expect(
        noFindChildLayout,
        `Should not be another nested layout, but found [data-test-layout="${layoutName}"], pathname: ${pageUrl.pathname}`,
      ).not.toHaveAttribute("data-test-layout");
    }
  }

  if (test.h1) {
    const h1 = parentLocator.locator("h1");
    await expect(h1).toHaveText(test.h1, {
      useInnerText: true,
    });
  }

  const activeLink = locator(
    ctx,
    `header [data-test-header-links] a[class="active"]`,
  );
  if (typeof test.activeHeaderLink === "string") {
    await expect(
      activeLink,
      `Header link "${test.activeHeaderLink}" not active`,
    ).toBeVisible();
    await expect(activeLink).toHaveText(test.activeHeaderLink, {
      useInnerText: true,
    });
  } else if (test.activeHeaderLink === false) {
    await expect(
      activeLink,
      `There should not be an active header link`,
    ).not.toBeVisible();
  }
}

interface AssertPage {
  pathname?: string;
  searchParams?: Record<string, string> | "empty";
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

  await expect(link, `Link selector ${linkSelector} not found`).toBeVisible();

  const href = (await link.getAttribute("href"))!;
  console.log(`   nav>    ${href}`);

  if (ctx.javaScriptEnabled) {
    const promise =
      href &&
      page.waitForURL(href.endsWith("/") ? href : href + "/", {
        timeout: 5000,
        waitUntil: "networkidle",
      });
    await link.click();
    // give time for the head to update
    await new Promise((resolve) => setTimeout(resolve, 100));
    await promise;
  } else {
    // if we didn't get a href, just wait for the next request
    const requestPromise = page.waitForRequest(href ? href : () => true, {
      timeout: 5000,
    });
    await link.click();
    const request = (await requestPromise)!;
    const response = await request.response();
    expect(
      response?.status(),
      `Expected status ${responseStatus} for ${href}`,
    ).toBe(responseStatus);
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
        if (!window["_qRouterScrollDebounce"]) {
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

export async function setPage(ctx: TestContext, pathname: string) {
  const page = getPage(ctx);
  const response = (await page.goto(pathname))!;
  const status = response.status();
  if (status !== 200) {
    const text = await response.text();
    expect(status, `${pathname} (${status})\n${text}`).toBe(200);
  }
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
