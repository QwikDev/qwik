import { expect, test } from "@playwright/test";
import {
  assertPage,
  getPage,
  linkNavigate,
  load,
  locator,
  setPage,
} from "./util.js";

test.describe("Qwik Router Page", () => {
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
  test("Qwik Router Page", async ({ context, javaScriptEnabled }) => {
    const ctx = await load(context, javaScriptEnabled, "/qwikrouter-test/");

    /***********  Home Page  ***********/
    await assertPage(ctx, {
      pathname: "/qwikrouter-test/",
      title: "Qwik Router Test - Qwik",
      layoutHierarchy: ["root"],
      h1: "Welcome to Qwik Router",
      activeHeaderLink: false,
    });

    /***********  Blog: home  ***********/
    await linkNavigate(ctx, '[data-test-link="blog-home"]');
    await assertPage(ctx, {
      pathname: "/qwikrouter-test/blog/",
      title: "Welcome to our Blog! - Qwik",
      layoutHierarchy: ["root", "blog"],
      h1: "Welcome to our Blog!",
      activeHeaderLink: "Blog",
    });

    /***********  Blog: resumability  ***********/
    await linkNavigate(ctx, '[data-test-link="blog-resumability"]', 301);
    await assertPage(ctx, {
      pathname: "/qwikrouter-test/blog/what-is-resumability/",
      title: "Blog: what-is-resumability - Qwik",
      layoutHierarchy: ["root", "blog"],
      h1: "Blog: what-is-resumability",
      activeHeaderLink: "Blog",
    });

    /***********  Blog: serializing-props  ***********/
    await linkNavigate(ctx, '[data-test-link="blog-serializing-props"]');
    await assertPage(ctx, {
      pathname: "/qwikrouter-test/blog/serializing-props/",
      title: "Blog: serializing-props - Qwik",
      layoutHierarchy: ["root", "blog"],
      h1: "Blog: serializing-props",
      activeHeaderLink: "Blog",
    });

    /***********  Docs: home  ***********/
    await linkNavigate(ctx, '[data-test-link="docs-home"]');
    await assertPage(ctx, {
      pathname: "/qwikrouter-test/docs/",
      title: "Docs: Welcome! - Qwik",
      layoutHierarchy: ["docs"],
      h1: "Welcome to the Docs!",
      activeHeaderLink: "Docs",
    });

    /***********  Docs: overview  ***********/
    await linkNavigate(
      ctx,
      '[data-test-menu-link="/qwikrouter-test/docs/overview/"]',
    );
    await assertPage(ctx, {
      pathname: "/qwikrouter-test/docs/overview/",
      title: "Docs: Overview - Qwik",
      layoutHierarchy: ["docs"],
      h1: "Overview",
      activeHeaderLink: "Docs",
    });

    /***********  Products: hat  ***********/
    await linkNavigate(ctx, '[data-test-link="products-hat"]');
    await assertPage(ctx, {
      pathname: "/qwikrouter-test/products/hat/",
      title: "Product hat - Qwik",
      layoutHierarchy: ["root"],
      h1: "Product: hat",
      activeHeaderLink: "Products",
    });

    /***********  Products: jacket  ***********/
    await linkNavigate(ctx, '[data-test-link="products-jacket"]');
    await assertPage(ctx, {
      pathname: "/qwikrouter-test/products/jacket/",
      title: "Product jacket - Qwik",
      layoutHierarchy: ["root"],
      h1: "Product: jacket",
      activeHeaderLink: "Products",
    });

    if (!javaScriptEnabled) {
      /***********  Products: shirt (301 redirect to /products/tshirt)  ***********/
      await linkNavigate(ctx, '[data-test-link="products-shirt"]', 301);
      await assertPage(ctx, {
        pathname: "/qwikrouter-test/products/tshirt/",
        title: "Product tshirt - Qwik",
        layoutHierarchy: ["root"],
        h1: "Product: tshirt",
        activeHeaderLink: "Products",
      });

      /***********  Products: shirt (rewrite to /products/tshirt)  ***********/
      await linkNavigate(ctx, '[data-test-link="products-shirt-rewrite"]', 200);
      await assertPage(ctx, {
        pathname: "/qwikrouter-test/products/shirt-rewrite/",
        title: "Product tshirt - Qwik",
        layoutHierarchy: ["root"],
        h1: "Product: tshirt",
        activeHeaderLink: "Products",
      });

      /***********  Products: shirt (rewrite to /products/tshirt)  ***********/
      await linkNavigate(
        ctx,
        '[data-test-link="products-shirt-rewrite-with-search"]',
      );
      await assertPage(ctx, {
        pathname: "/qwikrouter-test/products/shirt-rewrite/",
        title: "Product tshirt - Qwik",
        layoutHierarchy: ["root"],
        h1: "Product: tshirt",
        activeHeaderLink: "Products",
        searchParams: { search: "true" },
      });

      /***********  Products: shirt (rewrite to /products/tshirt)  ***********/
      await linkNavigate(
        ctx,
        '[data-test-link="products-shirt-rewrite-absolute-url"]',
        400,
      );
      await assertPage(ctx, {
        title: "400 Rewrite does not support absolute urls",
      });
      // Recover from error
      await setPage(ctx, "/qwikrouter-test/products/hat/");

      /***********  Products: shirt (rewrite to /products/tshirt)  ***********/
      await linkNavigate(
        ctx,
        '[data-test-link="products-shirt-rewrite-no-trailing-slash"]',
        301,
      );
      await assertPage(ctx, {
        pathname: "/qwikrouter-test/products/shirt-rewrite/",
        title: "Product tshirt - Qwik",
        layoutHierarchy: ["root"],
        h1: "Product: tshirt",
        activeHeaderLink: "Products",
      });
    }

    /***********  Products: hoodie (404)  ***********/
    await linkNavigate(ctx, '[data-test-link="products-hoodie"]', 404);
    await assertPage(ctx, {
      pathname: "/qwikrouter-test/products/hoodie/",
      title: "Product hoodie - Qwik",
      layoutHierarchy: ["root"],
      h1: "Product: hoodie",
      activeHeaderLink: "Products",
    });

    /***********  About Us  ***********/
    await linkNavigate(ctx, '[data-test-link="about-us"]');
    await assertPage(ctx, {
      pathname: "/qwikrouter-test/about-us/",
      title: "About Us - Qwik",
      layoutHierarchy: ["root"],
      h1: "About Us",
      activeHeaderLink: "About Us",
    });

    /***********  API: home  ***********/
    await linkNavigate(ctx, '[data-test-link="api-home"]');
    await assertPage(ctx, {
      pathname: "/qwikrouter-test/api/",
      title: "API: /qwikrouter-test/api/ - Qwik",
      layoutHierarchy: ["api"],
      h1: "Qwik Router Test API!",
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
      pathname: "/qwikrouter-test/mit/",
      title: "MIT License - Qwik",
      layoutHierarchy: [],
      h1: "MIT License",
    });
  });
}
