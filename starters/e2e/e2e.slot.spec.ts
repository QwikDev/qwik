import { test, expect } from "@playwright/test";

test.describe("slot", () => {
  function tests() {
    test("should update count", async ({ page }) => {
      const content1 = page.locator("#btn1");
      const content2 = page.locator("#btn2");
      const content3 = page.locator("#btn3");
      const btnCount = page.locator("#btn-count");

      await expect(content1).toHaveText("DEFAULT 0");
      await expect(content2).toHaveText("START 0");
      await expect(content3).toHaveText("INSIDE THING 0");

      // Count
      await btnCount.click();
      await expect(content1).toHaveText("DEFAULT 1");
      await expect(content2).toHaveText("START 1");
      await expect(content3).toHaveText("INSIDE THING 1");

      // Count
      await btnCount.click();
      await expect(content1).toHaveText("DEFAULT 2");
      await expect(content2).toHaveText("START 2");
      await expect(content3).toHaveText("INSIDE THING 2");
    });

    test("should toggle buttons", async ({ page }) => {
      const content1 = page.locator("#btn1");
      const content2 = page.locator("#btn2");
      const content3 = page.locator("#btn3");

      const btnToggleButtons = page.locator("#btn-toggle-buttons");

      // btnToggleButtons
      await btnToggleButtons.click();
      await expect(content1).toHaveText("", { useInnerText: true });
      await expect(content2).toHaveText("START 0", { useInnerText: true });
      await expect(content3).toHaveText("", { useInnerText: true });

      // btnToggleButtons
      await btnToggleButtons.click();
      await expect(content1).toHaveText("DEFAULT 0", { useInnerText: true });
      await expect(content2).toHaveText("START 0", { useInnerText: true });
      await expect(content3).toHaveText("INSIDE THING 0", {
        useInnerText: true,
      });
    });

    test("should toggle buttons with count", async ({ page }) => {
      const content1 = page.locator("#btn1");
      const content2 = page.locator("#btn2");
      const content3 = page.locator("#btn3");

      const btnToggleButtons = page.locator("#btn-toggle-buttons");
      const btnCount = page.locator("#btn-count");

      // btnToggleButtons
      await btnToggleButtons.click();
      await expect(content1).toHaveText("", { useInnerText: true });
      await expect(content2).toHaveText("START 0", { useInnerText: true });
      await expect(content3).toHaveText("", { useInnerText: true });

      // btnToggleButtons
      await btnCount.click();
      await expect(content1).toHaveText("", { useInnerText: true });
      await expect(content2).toHaveText("START 1", { useInnerText: true });
      await expect(content3).toHaveText("", { useInnerText: true });

      // btnToggleButtons
      await btnToggleButtons.click();
      await expect(content1).toHaveText("DEFAULT 1", { useInnerText: true });
      await expect(content2).toHaveText("START 1", { useInnerText: true });
      await expect(content3).toHaveText("INSIDE THING 1", {
        useInnerText: true,
      });

      // btnToggleButtons
      await btnToggleButtons.click();
      await expect(content1).toHaveText("", { useInnerText: true });
      await expect(content2).toHaveText("START 1", { useInnerText: true });
      await expect(content3).toHaveText("", { useInnerText: true });

      // btnToggleButtons
      await btnToggleButtons.click();
      await expect(content1).toHaveText("DEFAULT 1", { useInnerText: true });
      await expect(content2).toHaveText("START 1", { useInnerText: true });
      await expect(content3).toHaveText("INSIDE THING 1", {
        useInnerText: true,
      });
    });

    test("should toggle content", async ({ page }) => {
      const content1 = page.locator("#btn1");
      const content2 = page.locator("#btn2");
      const content3 = page.locator("#btn3");

      const btnToggleContent = page.locator("#btn-toggle-content");
      const btnCount = page.locator("#btn-count");

      // btnToggleButtons
      await btnToggleContent.click();
      await expect(content1).toHaveText("", { useInnerText: true });
      await expect(content2).toHaveText("", { useInnerText: true });
      await expect(content3).toHaveText("", { useInnerText: true });

      // btnToggleButtons
      await btnCount.click();
      await btnToggleContent.click();
      await expect(content1).toHaveText("DEFAULT 1", { useInnerText: true });
      await expect(content2).toHaveText("START 1", { useInnerText: true });
      await expect(content3).toHaveText("INSIDE THING 1", {
        useInnerText: true,
      });
    });

    test("should toggle content and buttons", async ({ page }) => {
      const content1 = page.locator("#btn1");
      const content2 = page.locator("#btn2");
      const content3 = page.locator("#btn3");

      const btnToggleButtons = page.locator("#btn-toggle-buttons");
      const btnToggleContent = page.locator("#btn-toggle-content");

      // btnToggleButtons
      await btnToggleButtons.click();
      await page.waitForTimeout(100);
      await btnToggleContent.click();
      await page.waitForTimeout(100);
      await btnToggleButtons.click();

      await expect(content1).toHaveText("", { useInnerText: true });
      await expect(content2).toHaveText("", { useInnerText: true });
      await expect(content3).toHaveText("", { useInnerText: true });
    });

    test("should toggle thing + count", async ({ page }) => {
      const content1 = page.locator("#btn1");
      const content2 = page.locator("#btn2");
      const content3 = page.locator("#btn3");

      const btnToggleThing = page.locator("#btn-toggle-thing");
      const btnCount = page.locator("#btn-count");

      // btnToggleButtons
      await btnToggleThing.click();
      await btnCount.click();
      await expect(content1).toHaveText("DEFAULT 1");
      await expect(content2).toHaveText("START 1");
      await expect(content3).toHaveText("");

      await btnToggleThing.click();
      await expect(content1).toHaveText("DEFAULT 1");
      await expect(content2).toHaveText("START 1");
      await expect(content3).toHaveText("INSIDE THING 1");
    });

    test("should not lose q context", async ({ page }) => {
      const content3 = page.locator("#btn3");
      const projected = page.locator("#projected");
      const btnToggleThing = page.locator("#btn-toggle-thing");
      const btnCount = page.locator("#btn-count");

      await btnCount.click();
      await expect(content3).toHaveText("INSIDE THING 1", {
        useInnerText: true,
      });

      // btnToggleButtons
      await btnToggleThing.click();
      await page.waitForTimeout(100);
      await btnToggleThing.click();
      await page.waitForTimeout(100);

      // Click projected
      await projected.click();

      await expect(content3).toHaveText("INSIDE THING 0", {
        useInnerText: true,
      });
    });

    test("should project cmp correctly into their selected slot", async ({
      page,
    }) => {
      const toggleBtn = page.locator("#toggle-child-slot");
      const slotChild = page.locator("#slot-child");
      const slotP = page.locator("#slot-p");
      const noslotP = page.locator("#noslot-p");

      await expect(slotChild).not.toBeHidden();
      await expect(slotP).not.toBeHidden();
      await expect(noslotP).not.toBeHidden();

      await toggleBtn.click();

      await expect(slotChild).not.toBeHidden();
      await expect(slotP).not.toBeHidden();
      await expect(noslotP).toBeHidden();
    });

    test("should toggle nested slot", async ({ page }) => {
      const toggleBtn = page.locator("#toggle-modal");
      const modalContent = page.locator("#modal-content");

      await expect(modalContent).not.toBeHidden();

      await toggleBtn.click();
      await expect(modalContent).toBeHidden();

      await toggleBtn.click();
      await expect(modalContent).not.toBeHidden();
    });

    test("issue 2688", async ({ page }) => {
      const result = page.locator("#issue-2688-result");
      const button = page.locator("#issue-2688-button");
      const count = page.locator("#btn-count");
      await expect(result).toHaveText("Alpha 0", { useInnerText: true });
      await button.click();
      await expect(result).toHaveText("Bravo 0", { useInnerText: true });
      await button.click();
      await expect(result).toHaveText("Alpha 0", { useInnerText: true });
      await count.click();
      await expect(result).toHaveText("Alpha 1", { useInnerText: true });
      await count.click();
      await expect(result).toHaveText("Alpha 2", { useInnerText: true });
      await button.click();
      await expect(result).toHaveText("Bravo 2", { useInnerText: true });
      await count.click();
      await expect(result).toHaveText("Bravo 3", { useInnerText: true });
      await count.click();
      await expect(result).toHaveText("Bravo 4", { useInnerText: true });
      await button.click();
      await expect(result).toHaveText("Alpha 4", { useInnerText: true });
      await count.click();
      await expect(result).toHaveText("Alpha 5", { useInnerText: true });
    });

    test("issue 2751", async ({ page }) => {
      const result = page.locator("#issue-2751-result");
      const button = page.locator("#issue-2751-toggle");
      await expect(result).toHaveText("Bogus 0 0 0");
      await button.click();
      await expect(result).toHaveText("Nothing");
      await button.click();
      await expect(result).toHaveText("Bogus 2 2 2");
      await button.click();
      await expect(result).toHaveText("Nothing");
      await button.click();
      await expect(result).toHaveText("Bogus 4 4 4");
      await button.click();
      await expect(result).toHaveText("Nothing");
      await button.click();
      await expect(result).toHaveText("Bogus 6 6 6");
    });

    test("issue 3565", async ({ page }) => {
      const result = page.locator("#issue-3565-result");
      await expect(result).toHaveText("Own contentcontent projected");
    });

    test("issue 3607", async ({ page }) => {
      const button = page.locator("#issue-3607-result");
      await expect(button).toHaveText("Load more");
      await button.click();
      await expect(button).toHaveText("Loading...");
      await button.click();
      await expect(button).toHaveText("Load more");
      await button.click();
      await expect(button).toHaveText("Loading...");
    });

    test("issue 3727", async ({ page }) => {
      const navigate = page.locator("#issue-3727-navigate");
      await navigate.click();
      const results = page.locator("#issue-3727-results > li");
      const add = page.locator("#issue-3727-add");
      await expect(results).toHaveText([]);
      await add.click();
      await expect(results).toHaveText(["item 0"]);
      await add.click();
      await expect(results).toHaveText(["item 0", "item 1"]);
    });

    test("issue 4215", async ({ page }) => {
      const svg = page.locator("#issue-4215-svg");
      const toggle = page.locator("#issue-4215-toggle");
      async function getNamespaceURI() {
        return (
          await (
            await svg.locator("path").elementHandle()
          )?.getProperty("namespaceURI")
        )?.jsonValue();
      }

      await expect(getNamespaceURI()).resolves.toBe(
        "http://www.w3.org/2000/svg",
      );
      await toggle.click();
      await toggle.click();
      await expect(getNamespaceURI()).resolves.toBe(
        "http://www.w3.org/2000/svg",
      );
    });

    test("issue 4283", async ({ page }) => {
      const result = page.locator("#issue-4283-result");
      await expect(result).toHaveText(
        `Hide until visible\n\nContent\n\nindex page`,
        {
          useInnerText: true,
        },
      );
    });

    test("issue 4658", async ({ page }) => {
      const button = page.locator("#issue-4658-toggle");
      const inner = page.locator("#issue-4658-inner");
      const top = page.locator("#issue-4658-top");

      await expect(inner).toHaveText("DDD");
      await expect(top).toHaveText("BBB");

      await button.click();

      await expect(inner).toHaveText("CCC");
      await expect(top).toHaveText("AAA");
    });
  }

  test("issue 5270", async ({ page }) => {
    const button = page.locator("#issue-5270-button");
    const div = page.locator("#issue-5270-div");
    await expect(div).toBeHidden();
    await button.click();
    await expect(div).toBeVisible();
    await expect(div).toHaveText("Ctx: hello");
  });

  test("issue 5506", async ({ page }) => {
    const input = page.locator("#input-5506");
    await expect(input).toBeChecked();
    await input.click();
    await expect(input).not.toBeChecked();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/e2e/slot");
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
      const toggleRender = page.locator("#btn-toggle-render");
      const rendered = page.locator("#isRendered");
      await toggleRender.click();
      await expect(rendered).toBeHidden();
      await toggleRender.click();
      await expect(rendered).toBeVisible();
    });
    tests();
  });
});
