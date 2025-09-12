import { test } from "@playwright/test";
import { assertPage, getPage, linkNavigate, load } from "./util.js";

test.describe("Qwik Router Auth", () => {
  test.describe("mpa", () => {
    test.use({ javaScriptEnabled: false });
    tests();
  });

  test.describe("spa", () => {
    test.use({ javaScriptEnabled: true });
    tests();
  });
});

function tests() {
  test("Qwik Router Auth", async ({ context, javaScriptEnabled }) => {
    const ctx = await load(
      context,
      javaScriptEnabled,
      "/qwikrouter-test/sign-in/",
    );

    /***********  Sign In  ***********/
    await assertPage(ctx, {
      pathname: "/qwikrouter-test/sign-in/",
      title: "Sign In - Qwik",
      layoutHierarchy: ["root", "auth"],
      h1: "Sign In",
      activeHeaderLink: "Sign In",
    });

    let page = getPage(ctx);
    await page.focus('input[name="username"]');
    await page.keyboard.type("quick");

    await page.focus('input[name="password"]');
    await page.keyboard.type("dev");

    await page.focus('input[name="confirmPassword"]');
    await page.keyboard.type("dev");

    /***********  Unsuccessful Sign In  ***********/
    await linkNavigate(ctx, "[data-test-sign-in]", 403);

    page = getPage(ctx);
    await page.focus('input[name="username"]');
    await page.keyboard.type("qwik");

    await page.focus('input[name="password"]');
    await page.keyboard.type("dev");

    await page.focus('input[name="confirmPassword"]');
    await page.keyboard.type("deva");

    /***********  Unsuccessful Sign In  ***********/
    await linkNavigate(ctx, "[data-test-sign-in]", 400);

    page = getPage(ctx);
    await page.focus('input[name="username"]');
    await page.keyboard.type("qwik");

    await page.focus('input[name="password"]');
    await page.keyboard.type("dev");

    await page.focus('input[name="confirmPassword"]');
    await page.keyboard.type("dev");

    /***********  Successful Sign In, Dashboard  ***********/
    await linkNavigate(ctx, "[data-test-sign-in]", 302);

    await assertPage(ctx, {
      pathname: "/qwikrouter-test/dashboard/",
      title: "Dashboard Home - Qwik",
      layoutHierarchy: ["dashboard"],
      h1: "Dashboard",
    });

    /***********  Go to Dashboard again, shouldn't redirect if signed in  ***********/
    await assertPage(ctx, {
      pathname: "/qwikrouter-test/dashboard/",
      title: "Dashboard Home - Qwik",
      layoutHierarchy: ["dashboard"],
      h1: "Dashboard",
    });

    /***********  Go to Dashboard settings, shouldn't redirect if signed in  ***********/
    await page.locator('[data-test-link="dashboard-settings"]').click();
    await page.waitForURL("/qwikrouter-test/dashboard/settings/");
    await assertPage(ctx, {
      pathname: "/qwikrouter-test/dashboard/settings/",
      title: "Dashboard Settings - Qwik",
      layoutHierarchy: ["dashboard"],
      h1: "Settings",
    });

    /***********  Sign out  ***********/
    await page.locator('[data-test-link="dashboard-sign-out"]').click();
    await page.waitForURL("/qwikrouter-test/sign-in/");
    await assertPage(ctx, {
      pathname: "/qwikrouter-test/sign-in/",
    });

    /***********  Dashboard not signed in, redirected to signed in  ***********/
    page = getPage(ctx);
    await page.goto("/qwikrouter-test/dashboard/");
    await assertPage(ctx, {
      pathname: "/qwikrouter-test/sign-in/",
      title: "Sign In - Qwik",
      layoutHierarchy: ["root", "auth"],
      h1: "Sign In",
      activeHeaderLink: "Sign In",
    });
  });
}
