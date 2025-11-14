import { expect, test, type Page } from "@playwright/test";

const HOME_ROUTE = "/qwikcity-test/issue5511/";
type MetaSnapshot = Array<{
  name?: string;
  property?: string;
  content?: string;
}>;

const collectMetaSnapshot = async (page: Page): Promise<MetaSnapshot> => {
  await page.waitForLoadState("networkidle");
  return await page.evaluate(() =>
    Array.from(document.head.querySelectorAll("meta")).map((meta) => ({
      name: meta.getAttribute("name") ?? undefined,
      property: meta.getAttribute("property") ?? undefined,
      content: meta.getAttribute("content") ?? undefined,
    })),
  );
};

const expectNoMixedEntries = (snapshot: MetaSnapshot) => {
  const mixed = snapshot.filter((meta) => meta.name && meta.property);
  expect(
    mixed,
    `Expected no <meta> elements to contain both name and property attributes.\n${mixed
      .map((m) => JSON.stringify(m))
      .join("\n")}`,
  ).toHaveLength(0);
};

const navigateHome = async (page: Page) => {
  await page.goto(HOME_ROUTE);
  await page.waitForLoadState("networkidle");
};

const navigateViaLink = async (page: Page, selector: string) => {
  const link = page.locator(selector);
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForLoadState("networkidle");
};

test.describe("Meta tags stay consistent (#5511)", () => {
  test.describe("MPA (server navigation)", () => {
    test.use({ javaScriptEnabled: false });

    test("each route keeps meta tags unmixed", async ({ page }) => {
      await navigateHome(page);
      expectNoMixedEntries(await collectMetaSnapshot(page));

      await navigateViaLink(page, '[data-test-link="issue5511-blog"]');
      expectNoMixedEntries(await collectMetaSnapshot(page));
    });
  });

  test.describe("SPA (client navigation)", () => {
    test.use({ javaScriptEnabled: true });

    test("Link navigation swaps meta tags without mixing attributes", async ({
      page,
    }) => {
      await navigateHome(page);
      expectNoMixedEntries(await collectMetaSnapshot(page));

      await navigateViaLink(page, '[data-test-link="issue5511-blog"]');
      expectNoMixedEntries(await collectMetaSnapshot(page));
    });

    test("navigating back restores original meta tags", async ({ page }) => {
      await navigateHome(page);
      await navigateViaLink(page, '[data-test-link="issue5511-blog"]');
      await navigateViaLink(page, '[data-test-link="issue5511-home"]');

      expectNoMixedEntries(await collectMetaSnapshot(page));
    });
  });
});
