import { expect, test, type Page } from "@playwright/test";
import { createTestDriver } from "./collapsible.driver";

async function setup(page: Page, exampleName: string) {
  await page.goto(`headless/collapsible/${exampleName}`);

  const driver = createTestDriver(page);

  return {
    driver,
  };
}

test.describe("Mouse Behavior", () => {
  test(`GIVEN a collapsible
        WHEN clicking on the trigger
        THEN the content should be visible
        AND aria-expanded is true`, async ({ page }) => {
    const { driver: d } = await setup(page, "hero");

    await d.getTrigger().click();

    await expect(d.getContent()).toBeVisible();
    await expect(d.getTrigger()).toHaveAttribute("aria-expanded", "true");
  });

  test(`GIVEN an open collapsible
        WHEN clicking on the trigger
        THEN the content should be hidden
        AND aria-expanded is false`, async ({ page }) => {
    const { driver: d } = await setup(page, "open");
    await d.getTrigger().click();

    await expect(d.getContent()).toBeHidden();
    await expect(d.getTrigger()).toHaveAttribute("aria-expanded", "false");
  });
});

test.describe("Keyboard Behavior", () => {
  test(`GIVEN a hero collapsible
        WHEN pressing the space key
        THEN the content should be visible
        AND aria-expanded is true`, async ({ page }) => {
    const { driver: d } = await setup(page, "hero");

    await d.getTrigger().press("Space");

    await expect(d.getContent()).toBeVisible();
    await expect(d.getTrigger()).toHaveAttribute("aria-expanded", "true");
  });

  test(`GIVEN an open hero collapsible
        WHEN pressing the space key
        THEN the content should be hidden
        AND aria-expanded is false`, async ({ page }) => {
    const { driver: d } = await setup(page, "open");
    await d.getTrigger().press("Space");

    await expect(d.getContent()).toBeHidden();
    await expect(d.getTrigger()).toHaveAttribute("aria-expanded", "false");
  });

  test(`GIVEN a hero collapsible
        WHEN pressing the enter key
        THEN the content should be visible
        AND aria-expanded is true`, async ({ page }) => {
    const { driver: d } = await setup(page, "hero");

    await d.getTrigger().press("Enter");

    await expect(d.getContent()).toBeVisible();
    await expect(d.getTrigger()).toHaveAttribute("aria-expanded", "true");
  });

  test(`GIVEN an open hero collapsible
        WHEN pressing the enter key
        THEN the content should be hidden
        AND aria-expanded is false`, async ({ page }) => {
    const { driver: d } = await setup(page, "open");
    await d.getTrigger().press("Enter");

    await expect(d.getContent()).toBeHidden();
    await expect(d.getTrigger()).toHaveAttribute("aria-expanded", "false");
  });
});

test.describe("Aria", () => {
  test(`GIVEN a collapsible with aria-controls
        WHEN a collapsible is rendered
        THEN the trigger's aria-controls should equal the content's id`, async ({
    page,
  }) => {
    const { driver: d } = await setup(page, "hero");
    await d.openCollapsible("Enter");

    const contentId = await d.getContent().getAttribute("id");

    await expect(d.getTrigger()).toHaveAttribute(
      "aria-controls",
      `${contentId}`,
    );
  });
});

test.describe("Reactive values", () => {
  test(`GIVEN a collapsible with a bind:open prop
        WHEN the signal value changes to true
        THEN the content should be visible
  `, async ({ page }) => {
    const { driver: d } = await setup(page, "programmatic");

    // our example uses bind:checked on the checkbox with our same signal.

    await d.locator.getByRole("checkbox").check();
    await expect(d.getContent()).toBeVisible();
  });

  test(`GIVEN a collapsible with a bind:open prop
        WHEN the signal value changes to false
        THEN the content should be hidden
  `, async ({ page }) => {
    const { driver: d } = await setup(page, "programmatic");

    await d.locator.getByRole("checkbox").uncheck();
    await expect(d.getContent()).toBeHidden();
  });
});

test.describe("Handlers", () => {
  test(`GIVEN a collapsible with an onOpenChange$ prop
        WHEN the content is opened
        THEN the handler should be called
  `, async ({ page }) => {
    const { driver: d } = await setup(page, "open-change");

    const countText = d.locator.getByRole("paragraph");
    await expect(countText).toHaveText("count: 0");
    await d.openCollapsible("click");

    await expect(countText).toHaveText("count: 1");
  });

  test(`GIVEN a collapsible with an onOpenChange$ prop
        WHEN the content is closed
        THEN the handler should be called
  `, async ({ page }) => {
    const { driver: d } = await setup(page, "open-change");

    const countText = d.locator.getByRole("paragraph");
    await d.openCollapsible("click");
    await expect(countText).toHaveText("count: 1");
    await d.getTrigger().click();

    await expect(countText).toHaveText("count: 2");
  });
});

test.describe("Disabled", () => {
  test(`GIVEN a collapsible with a disabled prop
        WHEN the trigger is clicked
        THEN the content should remain closed
  `, async ({ page }) => {
    const { driver: d } = await setup(page, "disabled");

    await expect(d.getTrigger()).toBeDisabled();

    // actionability checks are only for enabled elements
    await d.getTrigger().click({ force: true });
    await expect(d.getContent()).toBeHidden();
  });
});

test.describe("CSR", () => {
  test(`GIVEN a collapsible
        WHEN it is client-side rendered
        THEN the collapsible trigger should be visible
  `, async ({ page }) => {
    const { driver: d } = await setup(page, "csr");

    await d.locator.getByRole("button", { name: "Render Collapsible" }).click();
    await expect(d.getTrigger()).toBeVisible();
  });

  test(`GIVEN a CSR collapsible
        WHEN the trigger is clicked
        THEN the collapsible should be opened
`, async ({ page }) => {
    const { driver: d } = await setup(page, "csr");

    await d.locator.getByRole("button", { name: "Render Collapsible" }).click();
    await expect(d.getTrigger()).toBeVisible();

    await d.getTrigger().click();
    await expect(d.getContent()).toBeVisible();
  });

  test(`GIVEN an open CSR collapsible
        WHEN the trigger is clicked
        THEN the collapsible should be closed
`, async ({ page }) => {
    const { driver: d } = await setup(page, "csr");

    await d.locator.getByRole("button", { name: "Render Collapsible" }).click();
    await expect(d.getTrigger()).toBeVisible();

    await d.openCollapsible("click");
    await d.getTrigger().click();

    await expect(d.getContent()).toBeHidden();
  });
});
