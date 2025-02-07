import { expect, test } from "@playwright/test";

test.describe("loaders", () => {
  test.describe("mpa", () => {
    test.use({ javaScriptEnabled: false });
    tests();
  });

  test.describe("spa", () => {
    test.use({ javaScriptEnabled: true });
    tests();
  });

  function tests() {
    test("should run loaders", async ({ page }) => {
      await page.goto("/qwikcity-test/loaders/hola");

      const date = page.locator("#date");
      const slow = page.locator("#slow");

      const title = page.locator("title");
      const nestedDate = page.locator("#nested-date");
      const nestedDep = page.locator("#nested-dep");
      const nestedName = page.locator("#nested-name");
      const formName = page.locator("#form-name");
      const metaDate = page.locator('meta[name="date"]');
      const metaDep = page.locator('meta[name="dep"]');

      const submit = page.locator("#form-submit");

      await expect(title).toHaveText("Loaders - Qwik", { useInnerText: true });
      await expect(date).toHaveText("date: 2021-01-01T00:00:00.000Z");
      await expect(slow).toHaveText("slow: 123");
      await expect(nestedDate).toHaveText("date: 2021-01-01T00:00:00.000Z");
      await expect(nestedDep).toHaveText("dep: 84");
      await expect(metaDate).toHaveAttribute(
        "content",
        "2021-01-01T00:00:00.000Z",
      );
      await expect(metaDep).toHaveAttribute("content", "42");

      await expect(nestedName).toHaveText("name: hola");
      await formName.fill("Manuel");
      await submit.click();
      await expect(title).toHaveText("Loaders - ACTION: Manuel - Qwik", {
        useInnerText: true,
      });
      await expect(date).toHaveText("date: 2021-01-01T00:00:00.000Z");
      await expect(slow).toHaveText("slow: 123");
      await expect(nestedDate).toHaveText("date: 2021-01-01T00:00:00.000Z");
      await expect(nestedDep).toHaveText("dep: 84");
      await expect(nestedName).toHaveText("name: Manuel");

      await page.locator("#link-stuff").click();
      await expect(title).toHaveText("Loaders - Qwik", { useInnerText: true });
      await expect(date).toHaveText("date: 2021-01-01T00:00:00.000Z");
      await expect(slow).toHaveText("slow: 123");
      await expect(nestedDate).toHaveText("date: 2021-01-01T00:00:00.000Z");
      await expect(nestedDep).toHaveText("dep: 84");
      await expect(nestedName).toHaveText("name: stuff");

      await page.locator("#link-welcome").click();
      await expect(title).toHaveText("Loaders - Qwik", { useInnerText: true });
      await expect(date).toHaveText("date: 2021-01-01T00:00:00.000Z");
      await expect(slow).toHaveText("slow: 123");
      await expect(nestedDate).toHaveText("date: 2021-01-01T00:00:00.000Z");
      await expect(nestedDep).toHaveText("dep: 84");
      await expect(nestedName).toHaveText("name: welcome");
    });

    test("should pass reactivity issue", async ({ page }) => {
      await page.goto("/qwikcity-test/issue-loader");

      const realDate = page.locator("#real-date");
      const value = await realDate.textContent();
      const submit = page.locator("#submit");

      await submit.click();

      await expect(realDate).not.toHaveText(value!);
    });

    test("serialization of loaders", async ({ page, javaScriptEnabled }) => {
      await page.goto("/qwikcity-test/issue-loader-serialization/");
      const loaderData = page.locator(".loader-data");

      await expect(loaderData).toHaveText([
        javaScriptEnabled ? "loader-cmp1" : "empty",
        "empty",
        "loader-cmp4",
        '{"message":"loader-cmp5"}',
      ]);

      if (javaScriptEnabled) {
        await page.locator("#update-cmp2").click();
        await expect(loaderData).toHaveText([
          "loader-cmp1",
          "loader-cmp2",
          "loader-cmp4",
          '{"message":"loader-cmp5"}',
        ]);

        await page.locator("#update-cmp3").click();
        await expect(loaderData).toHaveText([
          "loader-cmp1",
          "loader-cmp2",
          "loader-cmp3",
          "loader-cmp4",
          '{"message":"loader-cmp5"}',
        ]);

        await page.locator("#update-cmp5").click();
        await expect(loaderData).toHaveText([
          "loader-cmp1",
          "loader-cmp2",
          "loader-cmp3",
          "loader-cmp4",
          '{"message":"loader-cmp5"}',
        ]);
      }
    });
    test("should modify ServerError in middleware", async ({ page }) => {
      const response = await page.goto("/qwikcity-test/loaders/loader-error");
      const contentType = await response?.headerValue("Content-Type");
      const status = response?.status();

      expect(status).toEqual(401);
      expect(contentType).toEqual("text/html; charset=utf-8");
      const body = page.locator("body");
      await expect(body).toContainText("loader-error-caught");
    });
    test("should return html with uncaught ServerErrors thrown in loaders", async ({
      page,
    }) => {
      const response = await page.goto(
        "/qwikcity-test/loaders/loader-error/uncaught-server",
      );
      const contentType = await response?.headerValue("Content-Type");
      const status = response?.status();

      expect(status).toEqual(401);
      expect(contentType).toEqual("text/html; charset=utf-8");
      const body = page.locator("body");
      await expect(body).toContainText("server-error-data");
    });
  }
});
