import { test, expect } from "@playwright/test";

test.describe("computed", () => {
  function tests() {
    test("should implement basic computed values", async ({ page }) => {
      const result = page.locator(".result");
      const increment = page.locator("#increment");

      await expect(result).toHaveText([
        "count: 0",
        "double: 0",
        "plus3: 3",
        "triple: 9",
        "sum: 12",
      ]);

      await increment.click();
      await expect(result).toHaveText([
        "count: 1",
        "double: 2",
        "plus3: 5",
        "triple: 15",
        "sum: 22",
      ]);

      await increment.click();
      await expect(result).toHaveText([
        "count: 2",
        "double: 4",
        "plus3: 7",
        "triple: 21",
        "sum: 32",
      ]);
    });

    test("should early resolve computed qrl", async ({ page }) => {
      const button = page.locator("#early-computed-qrl");
      await expect(button).not.toHaveAttribute("data-test");
      await expect(button).toContainText("Click me!");

      await button.click();

      await expect(button).toHaveAttribute("data-test", "5");
      await expect(button).toContainText("Click me! 5");
    });

    test("should retry when there is no qrl", async ({ page }) => {
      const button = page.locator("#retry-no-qrl");
      await expect(button).toContainText("0");

      await button.click();

      await expect(button).toContainText("1");
    });

    test("issue 3482", async ({ page }) => {
      const button = page.locator("#issue-3482-button");
      const div = page.locator("#issue-3482-div");
      const classEl = page.locator("#issue-3482-class");
      const datanuEl = page.locator("#issue-3482-datanu");
      await expect(div).toHaveAttribute("class", "class-0");
      await expect(div).toHaveAttribute("data-nu", "0");
      await expect(classEl).toHaveText("class: class-0");
      await expect(datanuEl).toHaveText("data-nu: 0");

      await button.click();
      await expect(div).toHaveAttribute("class", "class-1");
      await expect(div).toHaveAttribute("data-nu", "1");
      await expect(classEl).toHaveText("class: class-1");
      await expect(datanuEl).toHaveText("data-nu: 1");

      await button.click();
      await expect(div).toHaveAttribute("class", "class-2");
      await expect(div).toHaveAttribute("data-nu", "2");
      await expect(classEl).toHaveText("class: class-2");
      await expect(datanuEl).toHaveText("data-nu: 2");
    });

    test("issue 3488", async ({ page }) => {
      const result = page.locator("#issue-3488-result");
      const button = page.locator("#issue-3488-button");
      await expect(result).toHaveText("class-0");
      await button.click();
      await expect(result).toHaveText("class-1");
      await button.click();
      await expect(result).toHaveText("class-2");
    });

    test("dirty tasks", async ({ page }) => {
      const result = page.locator("#issue-5738-result");
      await expect(result).toHaveText("Calc: 2");
    });
  }

  test.beforeEach(async ({ page }) => {
    await page.goto("/e2e/computed");
    page.on("pageerror", (err) => expect(err).toEqual(undefined));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });

  tests();

  test.describe("client rerender", () => {
    test.beforeEach(async ({ page }) => {
      const rerender = page.locator("#rerender");
      await rerender.click();
      await expect(page.locator("#render-count")).toHaveText("Renders: 1");
    });
    tests();
  });
});
