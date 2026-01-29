import { expect, test } from "@playwright/test";
import { assertPage, linkNavigate, load, locator } from "./util.js";

test.describe("Qwik City Menu", () => {
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
  test("Qwik City Menu", async ({ context, javaScriptEnabled }) => {
    const ctx = await load(context, javaScriptEnabled, "/qwikcity-test/");

    /***********  Docs: home  ***********/
    await linkNavigate(ctx, '[data-test-link="docs-home"]');
    await assertPage(ctx, {
      pathname: "/qwikcity-test/docs/",
      title: "Docs: Welcome! - Qwik",
      layoutHierarchy: ["docs"],
      h1: "Welcome to the Docs!",
      activeHeaderLink: "Docs",
    });

    let menuHeader = locator(ctx, `[data-test-menu-header="0"]`);
    expect(await menuHeader.innerText()).toBe("Introduction");

    let breadcrumb0 = locator(ctx, `[data-test-breadcrumb="0"]`);
    if (await breadcrumb0.isVisible()) {
      expect(true, `Breadcrumb selector ${breadcrumb0} found`).toBe(false);
    }

    /***********  Docs: overview  ***********/
    await linkNavigate(ctx, '[data-test-menu-link="/qwikcity-test/docs/overview/"]');
    await assertPage(ctx, {
      pathname: "/qwikcity-test/docs/overview/",
      title: "Docs: Overview - Qwik",
      layoutHierarchy: ["docs"],
      h1: "Overview",
      activeHeaderLink: "Docs",
    });

    menuHeader = locator(ctx, `[data-test-menu-header="0"]`);
    expect(await menuHeader.innerText()).toBe("Introduction");

    breadcrumb0 = locator(ctx, `[data-test-breadcrumb="0"]`);
    expect(await breadcrumb0.innerText()).toBe("Introduction");

    let breadcrumb1 = locator(ctx, `[data-test-breadcrumb="1"]`);
    expect(await breadcrumb1.innerText()).toBe("Overview");

    /***********  Docs: getting-started  ***********/
    await linkNavigate(ctx, '[data-test-menu-link="/qwikcity-test/docs/getting-started/"]');
    await assertPage(ctx, {
      pathname: "/qwikcity-test/docs/getting-started/",
      title: "Docs: @builder.io/qwik Getting Started - Qwik",
      layoutHierarchy: ["docs"],
      h1: "Getting Started",
      activeHeaderLink: "Docs",
    });

    menuHeader = locator(ctx, `[data-test-menu-header="0"]`);
    expect(await menuHeader.innerText()).toBe("Introduction");

    breadcrumb0 = locator(ctx, `[data-test-breadcrumb="0"]`);
    expect(await breadcrumb0.innerText()).toBe("Introduction");

    breadcrumb1 = locator(ctx, `[data-test-breadcrumb="1"]`);
    expect(await breadcrumb1.innerText()).toBe("Getting Started");

    /***********  Docs: core/basics  ***********/
    await linkNavigate(ctx, '[data-test-menu-link="/qwikcity-test/docs/core/basics/"]');
    await assertPage(ctx, {
      pathname: "/qwikcity-test/docs/core/basics/",
      title: "Docs: core basics - Qwik",
      layoutHierarchy: ["docs"],
      h1: "Docs: core basics",
      activeHeaderLink: "Docs",
    });

    menuHeader = locator(ctx, `[data-test-menu-header="0"]`);
    expect(await menuHeader.innerText()).toBe("Introduction");

    breadcrumb0 = locator(ctx, `[data-test-breadcrumb="0"]`);
    expect(await breadcrumb0.innerText()).toBe("Core");

    breadcrumb1 = locator(ctx, `[data-test-breadcrumb="1"]`);
    expect(await breadcrumb1.innerText()).toBe("Basics");

    /***********  Docs: core/listeners  ***********/
    await linkNavigate(ctx, '[data-test-menu-link="/qwikcity-test/docs/core/listeners/"]');
    await assertPage(ctx, {
      pathname: "/qwikcity-test/docs/core/listeners/",
      title: "Docs: core listeners - Qwik",
      layoutHierarchy: ["docs"],
      h1: "Docs: core listeners",
      activeHeaderLink: "Docs",
    });

    menuHeader = locator(ctx, `[data-test-menu-header="0"]`);
    expect(await menuHeader.innerText()).toBe("Introduction");

    breadcrumb0 = locator(ctx, `[data-test-breadcrumb="0"]`);
    expect(await breadcrumb0.innerText()).toBe("Core");

    breadcrumb1 = locator(ctx, `[data-test-breadcrumb="1"]`);
    expect(await breadcrumb1.innerText()).toBe("Listeners");
  });
}
