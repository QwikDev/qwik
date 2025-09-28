import { test, expect } from "@playwright/test";

test.describe("context", () => {
  function tests(ssr: boolean) {
    test("should load", async ({ page }) => {
      const level2State1 = page.locator(".level2-state1");
      const level2State2 = page.locator(".level2-state2");
      const level2SSlot = page.locator(".level2-slot");

      const btnRootIncrement1 = page.locator(".root-increment1");
      const btnRootIncrement2 = page.locator(".root-increment2");
      const btnLevel2Increment = page.locator(".level2-increment3").nth(0);
      const btnLevel2Increment2 = page.locator(".level2-increment3").nth(1);

      expect(await level2State1.allTextContents()).toEqual([
        "ROOT / state1 = 0",
        "ROOT / state1 = 0",
      ]);
      expect(await level2State2.allTextContents()).toEqual([
        "ROOT / state2 = 0",
        "ROOT / state2 = 0",
      ]);
      expect(await level2SSlot.allTextContents()).toEqual([
        "bar = 0",
        "bar = 0",
      ]);

      await btnRootIncrement1.click();
      await expect(level2State1.first()).toHaveText("ROOT / state1 = 1");

      expect(await level2State1.allTextContents()).toEqual([
        "ROOT / state1 = 1",
        "ROOT / state1 = 1",
      ]);
      expect(await level2State2.allTextContents()).toEqual([
        "ROOT / state2 = 0",
        "ROOT / state2 = 0",
      ]);
      expect(await level2SSlot.allTextContents()).toEqual([
        "bar = 0",
        "bar = 0",
      ]);
      await btnRootIncrement2.click();
      await expect(level2State2.first()).toHaveText("ROOT / state2 = 1");

      expect(await level2State1.allTextContents()).toEqual([
        "ROOT / state1 = 1",
        "ROOT / state1 = 1",
      ]);
      expect(await level2State2.allTextContents()).toEqual([
        "ROOT / state2 = 1",
        "ROOT / state2 = 1",
      ]);
      expect(await level2SSlot.allTextContents()).toEqual([
        "bar = 0",
        "bar = 0",
      ]);
      // Add 2 level3 components to the first level2
      await btnLevel2Increment.click();
      await btnLevel2Increment.click();
      // Add 1 level3 component to the second level2
      await btnLevel2Increment2.click();
      // Wait for all level3 to be visible
      const level3s = page.locator(".level3-state2");
      await expect(level3s).toHaveCount(3);

      const level3State1 = page.locator(".level3-state1");
      const level3State2 = page.locator(".level3-state2");
      const level3State3 = page.locator(".level3-state3");
      const level3Slot = page.locator(".level3-slot");

      await expect(level3State1.first()).toHaveText("Level2 / state1 = 0");
      expect(await level2State1.allTextContents()).toEqual([
        "ROOT / state1 = 1",
        "ROOT / state1 = 1",
      ]);
      expect(await level2State2.allTextContents()).toEqual([
        "ROOT / state2 = 1",
        "ROOT / state2 = 1",
      ]);
      expect(await level2SSlot.allTextContents()).toEqual([
        "bar = 0",
        "bar = 0",
      ]);

      expect(await level3State1.allTextContents()).toEqual([
        "Level2 / state1 = 0",
        "Level2 / state1 = 0",
        "Level2 / state1 = 0",
      ]);
      expect(await level3State2.allTextContents()).toEqual([
        "ROOT / state2 = 1",
        "ROOT / state2 = 1",
        "ROOT / state2 = 1",
      ]);
      expect(await level3State3.allTextContents()).toEqual([
        "Level2 / state3 = 2",
        "Level2 / state3 = 2",
        "Level2 / state3 = 1",
      ]);
      expect(await level3Slot.allTextContents()).toEqual([
        "bar = 0",
        "bar = 0",
        "bar = 0",
      ]);
    });

    test("issue 1971", async ({ page }) => {
      const value = page.locator("#issue1971-value");
      await expect(value).toHaveText("Value: hello!");
    });

    test("issue 2087", async ({ page }) => {
      const btn1 = page.locator("#issue2087_btn1");
      const btn2 = page.locator("#issue2087_btn2");
      const rootA = page.locator("#issue2087_symbol_RootA");
      const rootB = page.locator("#issue2087_symbol_RootB");
      const nestedA = page.locator("#issue2087_symbol_NestedA");
      const nestedB = page.locator("#issue2087_symbol_NestedB");

      // Initial state
      await expect(rootA).toHaveText("Symbol RootA, context value: yes");
      await expect(rootB).not.toBeVisible();
      await expect(nestedA).toHaveText("Symbol NestedA, context value: yes");
      await expect(nestedB).not.toBeVisible();

      // Click a
      await btn1.click();
      await expect(rootB).toBeVisible();
      await expect(rootA).toHaveText("Symbol RootA, context value: yes");
      await expect(rootB).toHaveText("Symbol RootB, context value: yes");

      // Click b
      await btn2.click();
      await expect(nestedB).toBeVisible();
      await expect(nestedA).toHaveText("Symbol NestedA, context value: yes");
      await expect(nestedB).toHaveText("Symbol NestedB, context value: yes");
    });

    test("issue 2894", async ({ page }) => {
      const btn = page.locator("#issue2894-button");
      const value = page.locator("#issue2894-value");

      if (ssr) {
        await expect(value).not.toBeVisible();
        await expect(value).toHaveText("Value: bar");
      }

      await btn.click();

      await expect(value).toHaveText("Value: bar");
      await expect(value).toBeVisible();
    });

    test("issue 5356", async ({ page }) => {
      const btn1 = page.locator("#issue5356-button-1");
      const btn2 = page.locator("#issue5356-button-2");
      const child1 = page.locator("#issue5356-child-1");
      const child2 = page.locator("#issue5356-child-2");

      await expect(child1).toContainText("Child 1, active: true");
      await expect(child2).toContainText("Child 2, active: false");

      await btn2.click();

      await expect(child1).toContainText("Child 1, active: false");
      await expect(child2).toContainText("Child 2, active: true");

      await btn1.click();

      await expect(child1).toContainText("Child 1, active: true");
      await expect(child2).toContainText("Child 2, active: false");
    });

    test("issue 5793 scalar context values", async ({ page }) => {
      const value = page.locator("#issue5793-value");

      await expect(value).toHaveText("yes");
    });
  }

  test.beforeEach(async ({ page }) => {
    await page.goto("/e2e/context");
    page.on("pageerror", (err) => expect(err).toEqual(undefined));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });
  tests(true);

  test.describe("client rerender", () => {
    test.beforeEach(async ({ page }) => {
      const rerender = page.locator("#btn-rerender");
      await rerender.click();
      await expect(page.locator("#render-count")).toHaveText("1");
    });
    tests(false);
  });
});
