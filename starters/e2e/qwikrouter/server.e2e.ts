import { expect, test } from "@playwright/test";

test.describe("server$", () => {
  /** Checks that arguments weren't deduplicated or added */
  test("receives exactly the args given", async ({ page }) => {
    await page.goto("/qwikrouter-test/server-func/");
    const button = page.locator("#args-checker-button");

    await expect(button).toHaveText("Count Args: 1,1,1 / ");
    await button.click();
    await expect(button).toHaveText("Count Args: 1,1,1 / 10,10");
  });
  test("serializes scope", async ({ page }) => {
    await page.goto("/qwikrouter-test/server-func/");
    const button = page.locator("#scope-checker-button");

    await expect(button).toHaveText("local/remote: 0 / 0");
    await button.click();
    await expect(button).toHaveText("local/remote: 1 / 1");
  });

  test("this is available", async ({ page }) => {
    await page.goto("/qwikrouter-test/server-func/");
    const host = page.locator(".server-host");

    await expect(host).toHaveText([
      "localhost:3301",
      "localhost:3301",
      "localhost:3301",
      "localhost:3301",
      "",
    ]);

    const button = page.locator("#server-host-button");
    await button.click();
    await expect(host).toHaveText([
      "localhost:3301",
      "localhost:3301",
      "localhost:3301",
      "localhost:3301",
      "localhost:3301",
    ]);
  });

  test("streaming", async ({ page }) => {
    await page.goto("/qwikrouter-test/server-func/");
    const logs = page.locator(".server-streaming");
    const button = page.locator("#server-streaming-button");

    await expect(logs).toHaveText("");
    await button.click();
    await expect(logs).toHaveText("0");
    await expect(logs).toHaveText("01");
    await expect(logs).toHaveText("012");
    await expect(logs).toHaveText("0123");
    await expect(logs).toHaveText("01234");
  });

  test.describe("server$ inside resource", () => {
    test("All functions have reference to request event", async ({ page }) => {
      await page.goto("/qwikrouter-test/server-func/resource");

      await Promise.all(
        ["a", "b", "c"].map(async (letter) => {
          const result = await page.locator(`#${letter}`);

          await expect(result).toHaveText([
            "/qwikrouter-test/server-func/resource/" + letter,
          ]);
        }),
      );
    });
  });

  test.describe("Multiple server$", () => {
    test("should use the same context when invoked from useTask$ with resource", async ({
      page,
    }) => {
      await page.goto("/qwikrouter-test/server-func/");
      const methodsContainer = page.locator("#methods");
      await expect(methodsContainer).toContainText("GETGET");
    });

    test("should use the same context when invoked from useTask$ on the server", async ({
      page,
    }) => {
      await page.goto("/qwikrouter-test/server-func/context");
      const methodsContainer = page.locator("#methods");
      await expect(methodsContainer).toContainText("GETGET");
    });
    test("should have multiple user cookie values", async ({ browser }) => {
      const user1Context = await browser.newContext();
      const user2Context = await browser.newContext();

      const user1Cookies = [
        { name: "user", value: "user1", url: "http://localhost:3301" },
      ];
      const user2Cookies = [
        { name: "user", value: "user2", url: "http://localhost:3301" },
      ];
      await user1Context.addCookies(user1Cookies);
      await user2Context.addCookies(user2Cookies);

      const [user1Page, user2Page] = await Promise.all([
        user1Context.newPage(),
        user2Context.newPage(),
      ]);
      await Promise.all([
        user1Page.goto("/qwikrouter-test/server-func/cookie"),
        user2Page.goto("/qwikrouter-test/server-func/cookie"),
      ]);
      const usersContainer1 = user1Page.locator("#users");
      const usersContainer2 = user2Page.locator("#users");
      await Promise.all([
        usersContainer1.waitFor({ state: "attached" }),
        usersContainer2.waitFor({ state: "attached" }),
      ]);
      await expect(usersContainer1).toContainText("user1user1");
      await expect(usersContainer2).toContainText("user2user2");
    });
    test("should work with config custom header and GET on client", async ({
      page,
    }) => {
      await page.goto("/qwikrouter-test/server-func/server-configs");
      const serverConfigContainer = page.locator("#server-configs");

      await expect(serverConfigContainer).toContainText(
        "POST--MyCustomValue-GET--MyCustomValue",
      );
    });
    test("should modify ServerError in middleware", async ({ page }) => {
      await page.goto("/qwikrouter-test/server-func/server-error");
      const serverConfigContainer = page.locator("#server-error");

      await expect(serverConfigContainer).toContainText(
        "my errorserver-error-caughtPOST",
      );
    });
    test("should catch ServerError in routeLoader", async ({ page }) => {
      await page.goto("/qwikrouter-test/server-func/server-error/loader");
      const serverConfigContainer = page.locator("#server-error");
      await expect(serverConfigContainer).toContainText("loader-error-data");
    });
    test("should allow primitive ServerError data", async ({ page }) => {
      await page.goto("/qwikrouter-test/server-func/server-error/primitive");
      const serverConfigContainer = page.locator("#server-error");
      await expect(serverConfigContainer).toContainText("1error");
    });
  });

  test.describe("Server$ vNode serialization", () => {
    test.beforeEach(async ({ page }) => {
      page.on("pageerror", (err) => expect(err).toEqual(undefined));
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          expect(msg.text()).toEqual(undefined);
        }
      });
    });

    test("#7260 - should skip serialize vNode", async ({ page }) => {
      await page.goto("/qwikrouter-test/issue7260");

      const button = page.locator("#favorite-heart");

      await button.click();

      await expect(button).toContainText("❤️");

      await button.click();

      await expect(button).toContainText("🤍");
    });
  });

  test("should return 500 on invalid request", async ({ request }) => {
    const notExistingServerFunction = await request.post(
      "/qwikrouter-test.prod/?qfunc=ThisDoesNotExist",
      {
        headers: {
          "X-Qrl": "ThisDoesNotExist",
          "Content-Type": "application/qwik-json",
        },
        data: [20, "_#s_ThisDoesNotExist"],
      },
    );

    expect(notExistingServerFunction.status()).toBe(500);
  });
});
