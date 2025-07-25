import { $ } from "bun";
import {
  assertPage,
  getScrollHeight,
  getWindowScrollXY,
  linkNavigate,
  load,
  scrollDebounceDetector,
  scrollDetector,
  scrollTo,
} from "./util.js";
import { expect, test } from "@playwright/test";

test.describe("actions", () => {
  test.describe("mpa", () => {
    test.use({ javaScriptEnabled: false });
    tests();
  });

  test.describe("spa", () => {
    test.use({ javaScriptEnabled: true });
    tests();
    spaOnlyTests();
  });

  function spaOnlyTests() {
    test("issue4100", async ({ page }) => {
      await page.goto("/qwikcity-test/issue4100/");
      const increment = page.locator("button");
      const link = page.locator("a");

      await expect(increment).toHaveText("Click me 0");
      await increment.click();
      await expect(increment).toHaveText("Click me 1");
      await link.click();
      await expect(new URL(page.url()).hash).toBe("#navigate");
      await expect(increment).toHaveText("Click me 1");
    });

    test.describe("scroll-restoration", () => {
      test("should not refresh again on popstate after manual refresh", async ({
        page,
      }) => {
        await page.goto("/qwikcity-test/scroll-restoration/page-long/");
        const link = page.locator("#to-page-short");
        await link.click();

        await expect(page.locator("h1")).toHaveText("Page Short");

        await page.reload();
        await expect(page.locator("h1")).toHaveText("Page Short");

        await page.goBack();

        await expect(page.locator("h1")).toHaveText("Page Long");
      });
      test("should scroll on hash change", async ({ page }) => {
        await page.goto("/qwikcity-test/scroll-restoration/hash/");
        expect(page).toHaveURL("/qwikcity-test/scroll-restoration/hash/");

        const link = page.locator("#hash-1");
        await link.click();
        // Without this, sometimes the URL is #hash-1
        await page.waitForTimeout(100);

        expect(page).toHaveURL(
          "/qwikcity-test/scroll-restoration/hash/#hash-2",
        );
        let scrollY1;
        do {
          await page.waitForTimeout(10);
          scrollY1 = (await getWindowScrollXY(page))[1];
        } while (scrollY1 < 1000);
        expect(scrollY1).toBeGreaterThan(1090);
        expect(scrollY1).toBeLessThan(1110);

        const link2 = page.locator("#hash-2");
        await scrollTo(page, 0, 1000);
        await link2.click();

        expect(page).toHaveURL(
          "/qwikcity-test/scroll-restoration/hash/#hash-1",
        );
        await page.waitForTimeout(50);
        const scrollY2 = (await getWindowScrollXY(page))[1];
        expect(scrollY2).toBeGreaterThan(70);
        expect(scrollY2).toBeLessThan(90);

        const link3 = page.locator("#no-hash");
        await scrollTo(page, 0, 2000);
        await link3.click();

        expect(page).toHaveURL("/qwikcity-test/scroll-restoration/hash/");
        await page.waitForTimeout(50);
        expect(await getWindowScrollXY(page)).toStrictEqual([0, 0]);
      });
      test("should restore scroll on back and forward navigations", async ({
        page,
      }) => {
        await page.goto("/qwikcity-test/scroll-restoration/page-long/");
        const link = page.locator("#to-page-short");
        const scrollHeightLong = await getScrollHeight(page);
        await scrollTo(page, 0, scrollHeightLong);
        const scrollDetector1 = scrollDetector(page);
        await link.click();

        await scrollDetector1;
        await expect(page.locator("h1")).toHaveText("Page Short");
        expect(page).toHaveURL("/qwikcity-test/scroll-restoration/page-short/");
        expect(await getWindowScrollXY(page)).toStrictEqual([0, 0]);

        const scrollHeightShort = await getScrollHeight(page);
        await scrollTo(page, 0, scrollHeightShort);

        // QwikCity relies on a debounced scroll handler to save scroll position.
        // Once a popstate occurs we cannot update scroll position.
        // We must wait for the debounce to trigger before popping.
        await page.waitForTimeout(50);
        await scrollDebounceDetector(page);

        const scrollDetector2 = scrollDetector(page);
        await page.goBack();

        await scrollDetector2;
        await expect(page.locator("h1")).toHaveText("Page Long");
        expect(page).toHaveURL("/qwikcity-test/scroll-restoration/page-long/");
        expect(await getWindowScrollXY(page)).toStrictEqual([
          0,
          scrollHeightLong,
        ]);

        const scrollDetector3 = scrollDetector(page);
        await page.goForward();

        await scrollDetector3;
        await expect(page.locator("h1")).toHaveText("Page Short");
        expect(page).toHaveURL("/qwikcity-test/scroll-restoration/page-short/");
        expect(await getWindowScrollXY(page)).toStrictEqual([
          0,
          scrollHeightShort,
        ]);
      });

      test("issue4502 (link)", async ({ page }) => {
        await page.goto("/qwikcity-test/issue4502/");
        const count = page.locator("#count");
        await expect(count).toHaveText("Count: 0");
        await count.click();
        await expect(count).toHaveText("Count: 1");
        await page.locator("#link").click();
        await page.waitForURL("/qwikcity-test/issue4502/broken/route/");
        await expect(page.locator("#route")).toHaveText(
          "welcome to /broken/route",
        );
        await expect(count).toHaveText("Count: 1");
      });
    });

    test("issue 6660 internal params should not trigger navigation", async ({
      page,
    }) => {
      await page.goto("/qwikcity-test/issue6660/");
      await expect(page.locator("#status")).toBeHidden();

      {
        const startUrl = page.url();

        await page.getByText("Submit").click();
        await page.waitForSelector("#status");

        expect(page.url()).toBe(startUrl);
      }

      await page.goto("/qwikcity-test/issue6660/?var=1&hello");
      await expect(page.locator("#status")).toBeHidden();

      {
        const startUrl = page.url();
        expect(startUrl).toContain("var=1&hello");

        await page.getByText("Submit").click();
        await page.waitForSelector("#status");

        expect(page.url()).toBe(startUrl);
      }
    });

    test("preventNavigate", async ({ page }) => {
      await page.goto("/qwikcity-test/prevent-navigate/");
      const toggleDirty = page.locator("#pn-button");
      const link = page.locator("#pn-link");
      const count = page.locator("#pn-runcount");
      const mpaLink = page.locator("#pn-a");
      const itemLink = page.locator("#pn-link-5");
      const confirmText = page.locator("#pn-confirm-text");
      const confirmYes = page.locator("#pn-confirm-yes");
      // clean SPA nav
      await expect(count).toHaveText("0");
      await link.click();
      await expect(link).not.toBeVisible();
      expect(new URL(page.url()).pathname).toBe("/qwikcity-test/");
      await page.goBack();
      await expect(count).toHaveText("0");
      await expect(toggleDirty).toHaveText("is clean");
      await toggleDirty.click();
      await expect(toggleDirty).toHaveText("is dirty");
      // dirty browser nav
      let didTrigger = false;
      page.once("dialog", async (dialog) => {
        didTrigger = true;
        expect(dialog.type()).toBe("beforeunload");
        await dialog.accept();
      });
      await page.reload();
      expect(didTrigger).toBe(true);
      await expect(count).toHaveText("0");
      await toggleDirty.click();

      // dirty SPA nav
      await link.click();
      await expect(count).toHaveText("1");
      await link.click();
      await expect(count).toHaveText("2");
      expect(new URL(page.url()).pathname).toBe(
        "/qwikcity-test/prevent-navigate/",
      );
      await expect(confirmText).toContainText("/qwikcity-test/?");
      await itemLink.click();
      await expect(confirmText).toContainText(
        "/qwikcity-test/prevent-navigate/5/?",
      );
      await confirmYes.click();
      await expect(page.locator("#pn-main")).toBeVisible();
      expect(new URL(page.url()).pathname).toBe(
        "/qwikcity-test/prevent-navigate/5/",
      );

      // dirty browser nav w/ prevent
      await toggleDirty.click();
      didTrigger = false;
      page.once("dialog", async (dialog) => {
        didTrigger = true;
        expect(dialog.type()).toBe("beforeunload");
        // dismissing doesn't work, ah well
        await dialog.accept();
      });
      await mpaLink.click();
      expect(didTrigger).toBe(true);
    });
  }

  function tests() {
    test.describe("issue2829", () => {
      test("should navigate with context", async ({ page }) => {
        await page.goto("/qwikcity-test/issue2829/a/");
        const link = page.locator("#issue2829-link");
        await link.click();

        await expect(page.locator("h1")).toHaveText("Profile");
        await expect(page.locator("#issue2829-context")).toHaveText(
          "context: __CONTEXT_VALUE__",
        );
        await expect(new URL(page.url()).pathname).toBe(
          "/qwikcity-test/issue2829/b/",
        );
      });
    });
    test.describe("issue2890", () => {
      test("should navigate (link 0)", async ({ page, javaScriptEnabled }) => {
        await page.goto("/qwikcity-test/issue2890/a/");
        const link = page.locator("#issue2890-link-0");
        await link.click();

        await expect(page.locator("h1")).toHaveText("Query");
        await expect(toPath(page.url())).toEqual("/qwikcity-test/issue2890/b/");
        await expect(page.locator("#loader")).toHaveText(
          'LOADER: {"query":"NONE","hash":"NONE"}',
        );
        if (javaScriptEnabled) {
          await expect(page.locator("#browser")).toHaveText(
            'BROWSER: {"query":"NONE","hash":""}',
          );
        } else {
          await expect(page.locator("#browser")).toHaveText("BROWSER: {}");
        }
      });

      test("should navigate (link 1)", async ({ page, javaScriptEnabled }) => {
        await page.goto("/qwikcity-test/issue2890/a/");
        const link = page.locator("#issue2890-link-1");
        await link.click();

        await expect(page.locator("h1")).toHaveText("Query");
        await expect(toPath(page.url())).toEqual(
          "/qwikcity-test/issue2890/b/?query=123",
        );
        await expect(page.locator("#loader")).toHaveText(
          'LOADER: {"query":"123","hash":"NONE"}',
        );
        if (javaScriptEnabled) {
          await expect(page.locator("#browser")).toHaveText(
            'BROWSER: {"query":"123","hash":""}',
          );
        } else {
          await expect(page.locator("#browser")).toHaveText("BROWSER: {}");
        }
      });
      test("should navigate (link 2)", async ({ page, javaScriptEnabled }) => {
        await page.goto("/qwikcity-test/issue2890/a/");
        const link = page.locator("#issue2890-link-2");
        await link.click();

        await expect(page.locator("h1")).toHaveText("Query");
        await expect(toPath(page.url())).toEqual(
          "/qwikcity-test/issue2890/b/?query=321",
        );
        await expect(page.locator("#loader")).toHaveText(
          'LOADER: {"query":"321","hash":"NONE"}',
        );
        if (javaScriptEnabled) {
          await expect(page.locator("#browser")).toHaveText(
            'BROWSER: {"query":"321","hash":""}',
          );
        } else {
          await expect(page.locator("#browser")).toHaveText("BROWSER: {}");
        }
      });
      test("should navigate (link 3)", async ({ page, javaScriptEnabled }) => {
        await page.goto("/qwikcity-test/issue2890/a/");
        const link = page.locator("#issue2890-link-3");
        await link.click();

        await expect(page.locator("h1")).toHaveText("Query");
        await expect(toPath(page.url())).toEqual(
          "/qwikcity-test/issue2890/b/?query=321&hash=true#h2",
        );
        await expect(page.locator("#loader")).toHaveText(
          'LOADER: {"query":"321","hash":"true"}',
        );
        if (javaScriptEnabled) {
          await expect(page.locator("#browser")).toHaveText(
            'BROWSER: {"query":"321","hash":"#h2"}',
          );
        } else {
          await expect(page.locator("#browser")).toHaveText("BROWSER: {}");
        }
      });
      test("should navigate (link 4)", async ({ page, javaScriptEnabled }) => {
        await page.goto("/qwikcity-test/issue2890/a/");
        const link = page.locator("#issue2890-link-4");
        await link.click();

        await expect(page.locator("h1")).toHaveText("Query");
        await expect(toPath(page.url())).toEqual(
          "/qwikcity-test/issue2890/b/?query=321&hash=true#h2",
        );
        await expect(page.locator("#loader")).toHaveText(
          'LOADER: {"query":"321","hash":"true"}',
        );
        if (javaScriptEnabled) {
          await expect(page.locator("#browser")).toHaveText(
            'BROWSER: {"query":"321","hash":"#h2"}',
          );
        } else {
          await expect(page.locator("#browser")).toHaveText("BROWSER: {}");
        }
      });
    });

    test.describe("issue 2751", () => {
      test("should navigate without crash", async ({
        context,
        javaScriptEnabled,
      }) => {
        const ctx = await load(
          context,
          javaScriptEnabled,
          "/qwikcity-test/actions/",
        );

        await linkNavigate(ctx, '[data-test-link="docs-home"]');
        await assertPage(ctx, {
          pathname: "/qwikcity-test/docs/",
          title: "Docs: Welcome! - Qwik",
          layoutHierarchy: ["docs"],
          h1: "Welcome to the Docs!",
        });

        await linkNavigate(ctx, '[data-test-link="docs-actions"]');
        await assertPage(ctx, {
          pathname: "/qwikcity-test/actions/",
          title: "Actions - Qwik",
          layoutHierarchy: ["root"],
          h1: "Actions Test",
        });

        await linkNavigate(ctx, '[data-test-link="api-home"]');
        await assertPage(ctx, {
          pathname: "/qwikcity-test/api/",
          title: "API: /qwikcity-test/api/ - Qwik",
          layoutHierarchy: ["root", "api"],
          h1: "Qwik City Test API!",
        });
      });
    });

    test("issue4502 (anchor)", async ({ page }) => {
      await page.goto("/qwikcity-test/issue4502/");
      await page.locator("#anchor").click();
      await page.waitForURL("/qwikcity-test/issue4502/broken/route/");
      await expect(page.locator("#route")).toHaveText(
        "welcome to /broken/route",
      );
    });

    test("issue4956", async ({ page }) => {
      await page.goto("/qwikcity-test/issue4956?id=1");
      const textContent = await page.locator("#routeId");

      await expect(textContent).toHaveText("1");
    });

    test("issue4531", async ({ page }) => {
      const res = await page.goto("/qwikcity-test/issue4531/");
      await expect(page.locator("#route")).toHaveText("should render");
      expect(await res?.headerValue("X-Qwikcity-Test")).toEqual("issue4531");
    });

    test("issue4792", async ({ page }) => {
      const site = "/qwikcity-test/issue4792/";
      await page.goto(site);
      const href = page.locator("#reload");
      await expect(href).toHaveAttribute("href", site);
    });

    test("issue7182", async ({ page, javaScriptEnabled }) => {
      await page.goto("/qwikcity-test/issue7182");
      const input1 = await page.locator("#input1");
      await input1.fill("4");
      await input1.dispatchEvent("change");
      const input2 = await page.locator("#input2");
      await input2.fill("4");
      await input2.dispatchEvent("change");
      const result = await page.locator("#result");
      if (javaScriptEnabled) {
        await expect(result).toHaveText("8");
      } else {
        await expect(result).toHaveText("3");
      }
    });
    test("issue7732 link/useNavigate with query params should not override loader/middleware redirect with query params", async ({
      page,
    }) => {
      await page.goto("/qwikcity-test/issue7732/a/");
      const link = page.locator("#issue7732-link-b");
      await link.click();
      await expect(page).toHaveURL(
        "/qwikcity-test/issue7732/c/?redirected=true",
      );
    });
    // TODO: Fix this test (currently not working because the action redirect adds a `/q-data.json` at the end of the path)
    test.fixme(
      "action with redirect without query params in a route with query param should redirect to route without query params",
      async ({ page }) => {
        await page.goto(
          "/qwikcity-test/action-redirect-without-search-params/?test=test",
        );
        const button = page.locator("button");
        await button.click();
        await page.waitForURL(
          "/qwikcity-test/action-redirect-without-search-params-target/",
        );
      },
    );
    test("media in home page", async ({ page }) => {
      await page.goto("/qwikcity-test/");

      await expect(page.locator("#image-jpeg")).toHaveJSProperty(
        "naturalWidth",
        520,
      );
      await expect(page.locator("#image-jpeg")).toHaveJSProperty(
        "naturalHeight",
        520,
      );

      await expect(page.locator("#image-jpeg")).toHaveJSProperty(
        "loading",
        "eager",
      );
      await expect(page.locator("#image-jpeg")).toHaveJSProperty(
        "decoding",
        "auto",
      );

      await expect(page.locator("#image-avif")).toHaveJSProperty("width", 100);
      await expect(page.locator("#image-avif")).toHaveJSProperty("height", 100);
      await expect(page.locator("#image-avif")).toHaveJSProperty(
        "naturalWidth",
        520,
      );
      await expect(page.locator("#image-avif")).toHaveJSProperty(
        "naturalHeight",
        520,
      );
    });

    test("redirects, re-runs loaders and changes the url within the same page when search params changed", async ({
      page,
    }) => {
      await page.goto("/qwikcity-test/search-params-redirect/");
      await page.getByText("Submit").click();
      await page.waitForURL(
        "**/qwikcity-test/search-params-redirect/?redirected=true",
      );

      const url = new URL(page.url());

      expect(url.href.replace(url.origin, "")).toEqual(
        "/qwikcity-test/search-params-redirect/?redirected=true",
      );

      await expect(page.locator("#redirected-result")).toHaveText("true");
    });
  }
});

function toPath(href: string) {
  const url = new URL(href);
  return url.pathname + url.search + url.hash;
}
