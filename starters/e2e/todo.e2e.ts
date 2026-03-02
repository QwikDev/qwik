import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

test.describe("Todo", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/todo-test/");
    page.on("pageerror", (err) => expect(err).toEqual(undefined));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });

  test("todo title", async ({ page }) => {
    const title = page.locator("title");
    await expect(title).toHaveText("Qwik Demo: Todo", { useInnerText: true });
  });

  test("should start with 3 items", async ({ page }) => {
    await expect(page.locator(".todo-count > strong")).toContainText("3");
  });

  test("should add new item", async ({ page }) => {
    await addTodoItem(page, "New Item");
    await assertItemCount(page, 4);
    await expect(page.locator(".todo-list>li:last-child label")).toContainText(
      "New Item",
    );
  });

  test("should remove item", async ({ page }) => {
    await assertItemCount(page, 3);
    await page.locator(".todo-list>li:last-child").hover();
    await page.locator(".todo-list>li:last-child button").click();
    await assertItemCount(page, 2);
  });

  test("should complete an item", async ({ page }) => {
    await assertItemCount(page, 3);
    await page.locator(".todo-list>li:last-child input").click();
    await assertItemCount(page, 2, 3);
  });

  test("should edit an item", async ({ page }) => {
    await page.locator(".todo-list>li:first-child label").dblclick();
    await page.locator(".todo-list>li:first-child input.edit").fill("");
    await page.locator(".todo-list>li:first-child input.edit").press("X");
    await page.locator(".todo-list>li:first-child input.edit").press("Enter");
    await expect(page.locator(".todo-list>li:first-child")).toContainText("X");
  });

  test("should blur input.edit element", async ({ page }) => {
    await page.locator(".todo-list>li:first-child label").dblclick();
    await page
      .locator(".todo-list>li:first-child input.edit")
      .dispatchEvent("blur");
  });

  test("should clear completed", async ({ page }) => {
    await assertItemCount(page, 3);
    await page
      .locator(".todo-list>li:first-child input[type=checkbox]")
      .click();
    await page.locator("button.clear-completed").click();
    await assertItemCount(page, 2);
  });

  test("should remove first item and update last", async ({ page }) => {
    await assertItemCount(page, 3);
    await page.locator(".todo-list>li:first-child").hover();
    await page.locator(".todo-list>li:first-child button").click();
    await assertItemCount(page, 2);
    await page.waitForTimeout(100);

    await page.locator(".todo-list>li:last-child input").click();
    await assertItemCount(page, 1, 2);
  });

  // Flaky on E2E Tests (ubuntu-latest, chromium)
  // test('should add item, remove item, set filter.', async ({ page }) => {
  //   await addTodoItem(page, 'New Item');
  //   await assertItemCount(page, 4);
  //   page.locator('.todo-list>li:nth-child(2)').hover();
  //   page.locator('.todo-list>li:nth-child(2) button').click();
  //   await assertItemCount(page, 3);
  //   page.locator('.todo-list>li:last-child').hover();
  //   page.locator('.todo-list>li:last-child input').click();
  //   await assertItemCount(page, 2, 3);
  //   page.locator('footer li:first-child').click();
  //   page.locator('.clear-completed').click();
  //   await assertItemCount(page, 2);
  // });
});
async function assertItemCount(page: Page, count: number, total?: number) {
  await expect(page.locator(".todo-count > strong")).toContainText(
    String(count),
  );
  await expect(page.locator(".todo-list>li")).toHaveCount(
    total == undefined ? count : total,
  );
}

async function addTodoItem(page: Page, text: string) {
  await page.fill("input.new-todo", text);
  await page.press("input.new-todo", "Enter");
  await page.waitForTimeout(50);
}
