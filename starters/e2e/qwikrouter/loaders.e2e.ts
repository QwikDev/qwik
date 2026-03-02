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
      await page.goto("/qwikrouter-test/loaders/hola");

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
      await page.goto("/qwikrouter-test/issue-loader");

      const realDate = page.locator("#real-date");
      const value = await realDate.textContent();
      const submit = page.locator("#submit");

      await submit.click();

      await expect(realDate).not.toHaveText(value!);
    });

    test("serialization of loaders", async ({ page, javaScriptEnabled }) => {
      await page.goto("/qwikrouter-test/issue-loader-serialization/");
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

    test("should work loader result as component prop", async ({ page }) => {
      await page.goto("/qwikrouter-test/loaders/prop");
      await expect(page.locator("#prop")).toHaveText("test");
      await expect(page.locator("#prop-unwrapped")).toHaveText("test");
    });

    test("should modify ServerError in middleware", async ({ page }) => {
      const response = await page.goto("/qwikrouter-test/loaders/loader-error");
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
        "/qwikrouter-test/loaders/loader-error/uncaught-server",
      );
      const contentType = await response?.headerValue("Content-Type");
      const status = response?.status();

      expect(status).toEqual(401);
      expect(contentType).toEqual("text/html; charset=utf-8");
      const body = page.locator("body");
      await expect(body).toContainText("server-error-data");
    });

    test("should not serialize loaders by default and serialize with serializationStrategy: always", async ({
      page,
      javaScriptEnabled,
    }) => {
      await page.goto("/qwikrouter-test/loaders-serialization/");
      const stateData = page.locator('script[type="qwik/state"]');

      expect(await stateData.textContent()).not.toContain("some test value");
      expect(await stateData.textContent()).not.toContain(
        "should not serialize this",
      );
      expect(await stateData.textContent()).toContain("some eager test value");
      expect(await stateData.textContent()).toContain("should serialize this");

      if (javaScriptEnabled) {
        await page.locator("#toggle-child").click();
        await expect(page.locator("#prop1")).toHaveText("some test value");
        await expect(page.locator("#prop2")).toHaveText(
          "should not serialize this",
        );
        await expect(page.locator("#prop3")).toHaveText(
          "some eager test value",
        );
        await expect(page.locator("#prop4")).toHaveText(
          "should serialize this",
        );
        await expect(page.locator("#prop5")).toHaveText(
          "some test value nested",
        );
        await expect(page.locator("#prop6")).toHaveText(
          "should not serialize this nested",
        );
      }
    });

    test("should retry with all loaders if one fails", async ({
      page,
      javaScriptEnabled,
    }) => {
      let loadersRequestCount = 0;
      let allLoadersRequestCount = 0;
      page.on("request", (request) => {
        if (request.url().includes("q-data.json?qloaders")) {
          loadersRequestCount++;
        }
        if (request.url().endsWith("q-data.json")) {
          allLoadersRequestCount++;
        }
      });

      await page.route(
        "*/**/qwikrouter-test/loaders-serialization/q-data.json?qloaders=*",
        async (route) => {
          await route.fulfill({ status: 404 });
        },
      );
      await page.goto("/qwikrouter-test/loaders-serialization/");

      if (javaScriptEnabled) {
        await page.locator("#toggle-child").click();
        await page.waitForLoadState("networkidle");
        expect(loadersRequestCount).toBe(2);
        expect(allLoadersRequestCount).toBe(1);
        await expect(page.locator("#prop1")).toHaveText("some test value");
        await expect(page.locator("#prop2")).toHaveText(
          "should not serialize this",
        );
        await expect(page.locator("#prop3")).toHaveText(
          "some eager test value",
        );
        await expect(page.locator("#prop4")).toHaveText(
          "should serialize this",
        );
        await expect(page.locator("#prop5")).toHaveText(
          "some test value nested",
        );
        await expect(page.locator("#prop6")).toHaveText(
          "should not serialize this nested",
        );
      }
    });
  }
});
