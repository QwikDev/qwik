import { test, expect } from "@playwright/test";

test.describe("styles", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/e2e/styles");
    page.on("pageerror", (err) => expect(err).toEqual(undefined));
    page.on("console", (msg) => {
      // console.log(msg.type(), msg.text());
      if (msg.type() === "error") {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });

  runTests();

  test.describe("client side", () => {
    test.beforeEach(async ({ page }) => {
      const reload = page.locator("#reload");
      await reload.click();
      await expect(page.locator("#renderCount")).toHaveText(`Render 1`);
    });
    runTests();
  });

  function runTests() {
    test("should load", async ({ page }) => {
      const parent = page.locator(".parent");
      const child2 = page.locator("text=Child 2");
      const inline2 = page.locator("text=Inline 2");

      const addChild = page.locator("button#add-child");

      await expect(parent).toHaveClass(/count-10/);
      await expect(parent).toHaveCSS("font-size", "200px");
      await expect(child2).toHaveCSS("font-size", "20px");
      await expect(inline2).toHaveCSS("font-size", "40px");

      const el = await page.$$("[q\\:style]");
      expect(el.length).toBe(9);
      await addChild.click();
      await expect(parent).toHaveClass(/count-11/);

      const child10 = page.locator("text=Child 10");
      const inline10 = page.locator("text=Inline 10");

      await expect(parent).toHaveCSS("font-size", "200px");
      await expect(child2).toHaveCSS("font-size", "20px");
      await expect(inline2).toHaveCSS("font-size", "40px");
      await expect(child10).toHaveCSS("font-size", "20px");
      await expect(inline10).toHaveClass(/parent-child/);
      await expect(inline10).toHaveCSS("font-size", "40px");

      const el2 = await page.$$("[q\\:style]");
      expect(el2.length).toBe(9);
    });

    test("issue 1945", async ({ page }) => {
      const btn = page.locator("#issue1945-btn");
      const h1 = page.locator("#issue1945-1");
      const h2 = page.locator("#issue1945-2");
      const h3 = page.locator("#issue1945-3");
      const h4 = page.locator("#issue1945-4");
      const h5 = page.locator("#issue1945-5");

      await expect(h1).toBeVisible();
      await expect(h2).toBeVisible();
      await expect(h3).toBeVisible();
      await expect(h4).toBeVisible();
      await expect(h5).not.toBeVisible();

      await btn.click();

      await expect(h1).toBeVisible();
      await expect(h2).toBeVisible();
      await expect(h3).toBeVisible();
      await expect(h4).toBeVisible();
      await expect(h5).toBeVisible();
      await expect(h1).toHaveCSS("background-color", "rgb(0, 0, 255)");
      await expect(h2).toHaveCSS("background-color", "rgb(0, 0, 255)");
      await expect(h3).toHaveCSS("background-color", "rgb(0, 0, 255)");
      await expect(h4).toHaveCSS("background-color", "rgb(0, 0, 255)");
      await expect(h5).toHaveCSS("background-color", "rgb(0, 0, 255)");
    });

    test("issue scoped fine grained", async ({ page }) => {
      const button = page.locator("#issue-scoped-fine-grained");
      await expect(button).toHaveCSS("background-color", "rgb(0, 128, 0)");
      await button.click();
      await expect(button).toHaveClass(/odd/);
      await expect(button).toHaveCSS("background-color", "rgb(0, 0, 255)");
      await button.click();
      await expect(button).toHaveClass(/even/);
      await expect(button).toHaveCSS("background-color", "rgb(0, 128, 0)");
    });
  }
});
