import { test, expect } from "@playwright/test";

test.describe("attributes", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/e2e/attributes");
    page.on("pageerror", (err) => expect(err).toEqual(undefined));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });

  function tests() {
    test("initial render is correctly", async ({ page }) => {
      const input = page.locator("#input");
      const label = page.locator("#label");
      const svg = page.locator("#svg");

      const renders = page.locator("#renders");

      await expect(input).toHaveAttribute("aria-hidden", "true");
      await expect(input).toHaveAttribute("aria-label", "even");
      await expect(input).toHaveAttribute("tabindex", "-1");
      await expect(input).toHaveAttribute("aria-required", "false");
      await expect(input).toHaveAttribute("draggable", "false");
      await expect(input).toHaveAttribute("spellcheck", "false");
      await expect(input).not.hasAttribute("required");
      await expect(input).not.hasAttribute("title");

      await expect(label).toHaveAttribute("for", "even");
      await expect(label).toHaveAttribute("form", "my-form");
      await expect(label).not.hasAttribute("title");

      await expect(svg).toHaveAttribute("width", "15");
      await expect(svg).toHaveAttribute("height", "15");
      await expect(svg).toHaveAttribute(
        "preserveAspectRatio",
        "xMidYMin slice",
      );
      await expect(svg).toHaveClass("is-svg");
      await expect(svg).toHaveAttribute("aria-hidden", "true");

      await expect(renders).toHaveText("1");
    });

    test("should type and reflect changes", async ({ page }) => {
      const input = page.locator("#input");
      const svg = page.locator("#svg");
      const inputCopy = page.locator("#input-copy");
      const inputValue = page.locator("#input-value");
      const stuffBtn = page.locator("#stuff");
      const renders = page.locator("#renders");

      await expect(inputCopy).toHaveJSProperty("value", "");
      await input.type("Hello");
      await expect(input).toHaveJSProperty("value", "Hello");
      await expect(inputCopy).toHaveJSProperty("value", "Hello");
      await expect(inputValue).toHaveText("Hello");
      await expect(renders).toHaveText("1");

      await stuffBtn.click();
      await expect(inputCopy).toHaveJSProperty("value", "Hello");
      await expect(inputValue).toHaveText("Hello");
      await expect(renders).toHaveText("2");

      await input.type("Bye");
      await expect(inputCopy).toHaveJSProperty("value", "ByeHello");
      await expect(inputValue).toHaveText("ByeHello");
      await expect(renders).toHaveText("2");

      await expect(svg).toHaveAttribute("width", "15");
      await expect(svg).toHaveAttribute("height", "15");
      await expect(svg).toHaveAttribute(
        "preserveAspectRatio",
        "xMidYMin slice",
      );
      await expect(svg).toHaveClass("is-svg");
      await expect(svg).toHaveAttribute("aria-hidden", "true");
    });

    test("should update aria-label", async ({ page }) => {
      const input = page.locator("#input");
      const renders = page.locator("#renders");
      const countBtn = page.locator("#count");
      await countBtn.click();

      await expect(input).toHaveAttribute("aria-hidden", "true");
      await expect(input).toHaveAttribute("aria-label", "odd");
      await expect(input).toHaveAttribute("tabindex", "-1");
      await expect(input).toHaveAttribute("aria-required", "false");
      await expect(input).toHaveAttribute("draggable", "false");
      await expect(input).toHaveAttribute("spellcheck", "false");
      await expect(input).not.hasAttribute("required");
      await expect(renders).toHaveText("1");
    });

    test("should update title", async ({ page }) => {
      const input = page.locator("#input");
      const label = page.locator("#label");

      const renders = page.locator("#renders");
      const countBtn = page.locator("#title");
      await countBtn.click();

      await expect(input).toHaveAttribute("title", "some title");
      await expect(label).toHaveAttribute("title", "some title");
      await expect(renders).toHaveText("1");

      await countBtn.click();
      await expect(input).not.toHaveAttribute("title", "some title");
      await expect(input).not.hasAttribute("title");
      await expect(label).not.hasAttribute("title");
      await expect(renders).toHaveText("1");
    });

    test("should update aria-hidden", async ({ page }) => {
      const input = page.locator("#input");
      const svg = page.locator("#svg");
      const renders = page.locator("#renders");
      const countBtn = page.locator("#aria-hidden");
      await countBtn.click();

      await expect(input).toHaveAttribute("aria-hidden", "false");
      await expect(input).toHaveAttribute("aria-label", "even");
      await expect(input).toHaveAttribute("tabindex", "-1");
      await expect(input).toHaveAttribute("aria-required", "false");
      await expect(input).toHaveAttribute("draggable", "false");
      await expect(input).toHaveAttribute("spellcheck", "false");
      await expect(input).not.hasAttribute("required");
      await expect(svg).toHaveAttribute("aria-hidden", "false");
      await expect(renders).toHaveText("1");
    });

    test("should update required", async ({ page }) => {
      const input = page.locator("#input");
      const renders = page.locator("#renders");
      const countBtn = page.locator("#required");
      await countBtn.click();

      await expect(input).toHaveAttribute("aria-hidden", "true");
      await expect(input).toHaveAttribute("aria-label", "even");
      await expect(input).toHaveAttribute("tabindex", "-1");
      await expect(input).toHaveAttribute("aria-required", "true");
      await expect(input).toHaveAttribute("draggable", "true");
      await expect(input).toHaveAttribute("spellcheck", "true");
      await expect(input).hasAttribute("required");
      await expect(renders).toHaveText("1");
    });

    test("should hide all attributes", async ({ page }) => {
      const input = page.locator("#input");
      const renders = page.locator("#renders");

      const requiredBtn = page.locator("#required");
      await requiredBtn.click();

      const countBtn = page.locator("#hide");
      await countBtn.click();
      await expect(input).not.toHaveAttribute("aria-hidden", "true");

      await expect(input).not.hasAttribute("aria-hidden");
      await expect(input).not.hasAttribute("aria-label");
      await expect(input).not.hasAttribute("tabindex");
      await expect(input).not.hasAttribute("required");
      await expect(input).not.hasAttribute("aria-required");
      await expect(input).not.hasAttribute("draggable");
      await expect(input).not.hasAttribute("spellcheck");
      await expect(renders).toHaveText("2");
    });

    test("should toggle attributes several times", async ({ page }) => {
      const input = page.locator("#input");
      const label = page.locator("#label");
      const svg = page.locator("#svg");

      const renders = page.locator("#renders");
      const countBtn = page.locator("#hide");

      await countBtn.click();
      await expect(input).not.toHaveAttribute("aria-hidden", "true");

      await expect(input).not.hasAttribute("aria-hidden");
      await expect(input).not.hasAttribute("aria-label");
      await expect(input).not.hasAttribute("tabindex");
      await expect(input).not.hasAttribute("required");
      await expect(input).not.hasAttribute("aria-required");
      await expect(input).not.hasAttribute("draggable");
      await expect(input).not.hasAttribute("spellcheck");
      await expect(label).not.hasAttribute("for");
      await expect(label).not.hasAttribute("form");
      await expect(svg).not.hasAttribute("width");
      await expect(svg).not.hasAttribute("height");
      await expect(svg).not.hasAttribute("preserveAspectRatio");
      await expect(svg).toHaveClass("");
      await expect(svg).not.hasAttribute("aria-hidden");

      await expect(renders).toHaveText("2");

      await countBtn.click();

      await expect(input).toHaveAttribute("aria-hidden", "true");
      await expect(input).toHaveAttribute("aria-label", "even");
      await expect(input).toHaveAttribute("tabindex", "-1");
      await expect(input).not.hasAttribute("required");
      await expect(input).toHaveAttribute("aria-required", "false");
      await expect(input).toHaveAttribute("draggable", "false");
      await expect(input).toHaveAttribute("spellcheck", "false");

      await expect(label).toHaveAttribute("for", "even");
      await expect(label).toHaveAttribute("form", "my-form");
      await expect(svg).toHaveAttribute("width", "15");
      await expect(svg).toHaveAttribute("height", "15");
      await expect(svg).toHaveAttribute(
        "preserveAspectRatio",
        "xMidYMin slice",
      );
      await expect(svg).toHaveClass("is-svg");
      await expect(svg).toHaveAttribute("aria-hidden", "true");

      await expect(renders).toHaveText("3");

      await countBtn.click();
      await expect(svg).not.toHaveAttribute("aria-hidden", "true");
      await expect(input).not.hasAttribute("aria-hidden");
      await expect(input).not.hasAttribute("aria-label");
      await expect(input).not.hasAttribute("tabindex");
      await expect(input).not.hasAttribute("required");
      await expect(input).not.hasAttribute("aria-required");
      await expect(input).not.hasAttribute("draggable");
      await expect(input).not.hasAttribute("spellcheck");
      await expect(label).not.hasAttribute("for");
      await expect(label).not.hasAttribute("form");
      await expect(svg).not.hasAttribute("width");
      await expect(svg).not.hasAttribute("height");
      await expect(svg).not.hasAttribute("preserveAspectRatio");
      await expect(svg).not.hasAttribute("aria-hidden");
      await expect(svg).toHaveClass("");
      await expect(renders).toHaveText("4");

      await countBtn.click();

      await expect(input).toHaveAttribute("aria-hidden", "true");
      await expect(input).toHaveAttribute("aria-label", "even");
      await expect(input).toHaveAttribute("tabindex", "-1");
      await expect(input).not.hasAttribute("required");
      await expect(input).toHaveAttribute("aria-required", "false");
      await expect(input).toHaveAttribute("draggable", "false");
      await expect(input).toHaveAttribute("spellcheck", "false");
      await expect(label).toHaveAttribute("for", "even");
      await expect(label).toHaveAttribute("form", "my-form");
      await expect(svg).toHaveAttribute("width", "15");
      await expect(svg).toHaveAttribute("height", "15");
      await expect(svg).toHaveAttribute(
        "preserveAspectRatio",
        "xMidYMin slice",
      );
      await expect(svg).toHaveClass("is-svg");
      await expect(svg).toHaveAttribute("aria-hidden", "true");

      await expect(renders).toHaveText("5");
    });

    test("issue 3622", async ({ page }) => {
      const select = page.locator("#issue-3622-result");
      await expect(select).toHaveValue("option1");
    });

    test("issue 4718 (null)", async ({ page }) => {
      const button = page.locator("#issue-4718-null-result");

      await expect(button).toHaveAttribute("data-works", "some value");
      await expect(button).toHaveAttribute("aria-label", "some value");
      await expect(button).toHaveAttribute("title", "some value");

      await button.click();

      await expect(button).toHaveClass("moop");
      await expect(button).not.hasAttribute("data-works");
      await expect(button).not.hasAttribute("aria-label");
      await expect(button).not.hasAttribute("title");
    });

    test("issue 4718 (undefined)", async ({ page }) => {
      const button = page.locator("#issue-4718-undefined-result");

      await expect(button).toHaveAttribute("data-works", "some value");
      await expect(button).toHaveAttribute("aria-label", "some value");
      await expect(button).toHaveAttribute("title", "some value");

      await button.click();

      await expect(button).toHaveClass("moop");
      await expect(button).not.hasAttribute("data-works");
      await expect(button).not.hasAttribute("aria-label");
      await expect(button).not.hasAttribute("title");
    });
  }

  tests();

  test.describe("client rerender", () => {
    test.beforeEach(async ({ page }) => {
      const toggleRender = page.locator("#force-rerender");
      const v = Number(await toggleRender.getAttribute("data-v"));
      await toggleRender.click();
      await expect(page.locator("#renderCount")).toHaveText(`Render ${v}`);
      // Without this the tests still fail?
      await page.waitForTimeout(50);
    });
    tests();
  });
});
