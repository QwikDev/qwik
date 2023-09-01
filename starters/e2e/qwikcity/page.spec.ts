import { expect, test } from "@playwright/test";
import { assertPage, linkNavigate, load, locator } from "./util.js";

test.describe("Qwik City Page", () => {
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
  test("Qwik City Page", async ({ context, javaScriptEnabled }) => {
    const ctx = await load(context, javaScriptEnabled, "/qwikcity-test/");

    /***********  Home Page  ***********/
    await assertPage(ctx, {
      pathname: "/qwikcity-test/",
      title: "Welcome to Qwik City - Qwik",
      layoutHierarchy: ["root"],
      h1: "Welcome to Qwik City",
      activeHeaderLink: false,
    });

    /***********  Blog: home  ***********/
    await linkNavigate(ctx, '[data-test-link="blog-home"]');
    await assertPage(ctx, {
      pathname: "/qwikcity-test/blog/",
      title: "Welcome to our Blog! - Qwik",
      layoutHierarchy: ["root", "blog"],
      h1: "Welcome to our Blog!",
      activeHeaderLink: "Blog",
    });

    /***********  Blog: resumability  ***********/
    await linkNavigate(ctx, '[data-test-link="blog-resumability"]');
    await assertPage(ctx, {
      pathname: "/qwikcity-test/blog/what-is-resumability/",
      title: "Blog: what-is-resumability - Qwik",
      layoutHierarchy: ["root", "blog"],
      h1: "Blog: what-is-resumability",
      activeHeaderLink: "Blog",
    });

    /***********  Blog: serializing-props  ***********/
    await linkNavigate(ctx, '[data-test-link="blog-serializing-props"]');
    await assertPage(ctx, {
      pathname: "/qwikcity-test/blog/serializing-props/",
      title: "Blog: serializing-props - Qwik",
      layoutHierarchy: ["root", "blog"],
      h1: "Blog: serializing-props",
      activeHeaderLink: "Blog",
    });

    /***********  Docs: home  ***********/
    await linkNavigate(ctx, '[data-test-link="docs-home"]');
    await assertPage(ctx, {
      pathname: "/qwikcity-test/docs/",
      title: "Docs: Welcome! - Qwik",
      layoutHierarchy: ["docs"],
      h1: "Welcome to the Docs!",
      activeHeaderLink: "Docs",
    });

    /***********  Docs: overview  ***********/
    await linkNavigate(
      ctx,
      '[data-test-menu-link="/qwikcity-test/docs/overview/"]',
    );
    await assertPage(ctx, {
      pathname: "/qwikcity-test/docs/overview/",
      title: "Docs: Overview - Qwik",
      layoutHierarchy: ["docs"],
      h1: "Overview",
      activeHeaderLink: "Docs",
    });

    /***********  Products: hat  ***********/
    await linkNavigate(ctx, '[data-test-link="products-hat"]');
    await assertPage(ctx, {
      pathname: "/qwikcity-test/products/hat/",
      title: "Product hat - Qwik",
      layoutHierarchy: ["root"],
      h1: "Product: hat",
      activeHeaderLink: "Products",
    });

    /***********  Products: jacket  ***********/
    await linkNavigate(ctx, '[data-test-link="products-jacket"]');
    await assertPage(ctx, {
      pathname: "/qwikcity-test/products/jacket/",
      title: "Product jacket - Qwik",
      layoutHierarchy: ["root"],
      h1: "Product: jacket",
      activeHeaderLink: "Products",
    });

    if (!javaScriptEnabled) {
      /***********  Products: shirt (301 redirect to /products/tshirt)  ***********/
      await linkNavigate(ctx, '[data-test-link="products-shirt"]');
      await assertPage(ctx, {
        pathname: "/qwikcity-test/products/tshirt/",
        title: "Product tshirt - Qwik",
        layoutHierarchy: ["root"],
        h1: "Product: tshirt",
        activeHeaderLink: "Products",
      });
    }

    /***********  Products: hoodie (404)  ***********/
    await linkNavigate(ctx, '[data-test-link="products-hoodie"]', 404);
    await assertPage(ctx, {
      pathname: "/qwikcity-test/products/hoodie/",
      title: "Product hoodie - Qwik",
      layoutHierarchy: ["root"],
      h1: "Product: hoodie",
      activeHeaderLink: "Products",
    });

    /***********  About Us  ***********/
    await linkNavigate(ctx, '[data-test-link="about-us"]');
    await assertPage(ctx, {
      pathname: "/qwikcity-test/about-us/",
      title: "About Us - Qwik",
      layoutHierarchy: ["root"],
      h1: "About Us",
      activeHeaderLink: "About Us",
    });

    /***********  API: home  ***********/
    await linkNavigate(ctx, '[data-test-link="api-home"]');
    await assertPage(ctx, {
      pathname: "/qwikcity-test/api/",
      title: "API: /qwikcity-test/api/ - Qwik",
      layoutHierarchy: ["api"],
      h1: "Qwik City Test API!",
      activeHeaderLink: "API",
    });

    const nodeVersion = locator(ctx, "[data-test-api-node]");
    if (javaScriptEnabled) {
      // TODO!!
    } else {
      // no useBrowserVisibleTask()
      expect(await nodeVersion.innerText()).toBe("");
    }

    /***********  MIT  ***********/
    await linkNavigate(ctx, '[data-test-link="mit"]');
    await assertPage(ctx, {
      pathname: "/qwikcity-test/mit/",
      title: "MIT License - Qwik",
      layoutHierarchy: [],
      h1: "MIT License",
    });
  });
}
