import { expect, test } from "@playwright/test";

test.describe("actions", () => {
  test.describe("mpa", () => {
    test.use({ javaScriptEnabled: false });
    MPA_and_SPA_tests();
  });

  test.describe("spa", () => {
    test.use({ javaScriptEnabled: true });
    MPA_and_SPA_tests();

    test.describe("issue4679", () => {
      test("should serialize Form without action", async ({ page }) => {
        await page.goto("/qwikrouter-test/issue4679/");
        const button = page.locator("#issue-4679-button");
        await expect(button).toHaveText("Toggle False");
        await button.click();
        await expect(button).toHaveText("Toggle True");
      });
    });
    test.describe("multiple-handlers", () => {
      test("should allow multiple handlers", async ({ page }) => {
        await page.goto("/qwikrouter-test/actions/multiple-handlers/");
        const success = page.locator("#multiple-handlers-success");

        await expect(success).toBeHidden();
        await page.locator("#multiple-handlers-button").click();
        await expect(success).toHaveText(
          '{"arrayOld":["0","1"],"arrayNew":["0","1"],"people":[{"name":"Fred"},{"name":"Sam"}]}',
        );
        const finished = page.locator("#multiple-handlers-finished");
        await expect(finished).toContainText("true");
      });
    });
  });

  function MPA_and_SPA_tests() {
    test.describe("login form", () => {
      test.beforeEach(async ({ page }) => {
        await page.goto("/qwikrouter-test/actions/");
      });

      test("should run actions programmatically", async ({
        page,
        javaScriptEnabled,
      }) => {
        if (javaScriptEnabled) {
          const success = page.locator("#other-success");
          const btn = page.locator("#other-button");

          await expect(success).toBeHidden();
          await btn.click();
          await expect(success).toHaveText("Success");
          await expect(page.locator("#other-store")).toHaveText(
            'false:::{"success":true}',
          );
        }
      });

      test("should run actions", async ({ page, javaScriptEnabled }) => {
        const other = page.locator("#other-store");
        const running = page.locator("#running");
        const errorMessage = page.locator("#form-error");
        const successMessage = page.locator("#form-success");
        const username = page.locator("#label-username > input");
        const usernameError = page.locator("#label-username > p");
        const code = page.locator("#label-code > input");
        const codeError = page.locator("#label-code > p");
        const submit = page.locator("#submit");

        await expect(other).toHaveText("false:::");
        await submit.click();
        await expect(usernameError).toHaveText(
          "String must contain at least 3 character(s)",
        );
        await expect(codeError).toBeHidden();
        await expect(other).toHaveText("false:::");

        await username.fill("Manuel");
        await code.fill("text");
        await submit.click();
        await expect(usernameError).toBeHidden();
        await expect(codeError).toHaveText("Expected number, received nan");
        await expect(username).toHaveValue("Manuel");
        await expect(code).toHaveValue("text");
        await expect(other).toHaveText("false:::");

        await username.clear();
        await username.fill("Ma");
        await submit.click();
        await expect(usernameError).toHaveText(
          "String must contain at least 3 character(s)",
        );
        await expect(codeError).toHaveText("Expected number, received nan");
        await expect(username).toHaveValue("Ma");
        await expect(code).toHaveValue("text");
        await expect(other).toHaveText("false:::");

        await username.clear();
        await username.fill("Test");
        await code.clear();
        await code.fill("123");
        await submit.click();
        await expect(usernameError).toBeHidden();
        await expect(codeError).toBeHidden();
        await expect(username).toHaveValue("Test");
        await expect(code).toHaveValue("123");
        await expect(errorMessage).toHaveText("Invalid username or code");
        await expect(other).toHaveText("false:::");

        await username.clear();
        await username.fill("admin");
        await submit.click();
        if (javaScriptEnabled) {
          await expect(running).toHaveText("Running...");
        }
        await expect(running).toBeHidden();
        await expect(errorMessage).toBeHidden();
        await expect(successMessage).toHaveText("this is the secret");
        await expect(other).toHaveText("false:::");

        await username.clear();
        await username.fill("redirect");
        await submit.click();

        await expect(page).toHaveURL("/qwikrouter-test/");
      });

      test("issue with action", async ({ page }) => {
        const errorMessage = page.locator("#form-error");
        const username = page.locator("#label-username > input");
        const code = page.locator("#label-code > input");
        const submit = page.locator("#submit");

        await username.fill("123");
        await submit.click();
        await expect(errorMessage).toHaveText("Invalid username or code");
        await expect(username).toHaveValue("123");
        await expect(code).toHaveValue("");
      });
    });

    test.describe("issue2644", () => {
      test("should submit items", async ({ page }) => {
        await page.goto("/qwikrouter-test/issue2644/");
        await page.locator("#issue2644-input").fill("AAA");
        await page.locator("#issue2644-submit").click();

        await expect(page.locator("#issue2644-list > li")).toHaveText(["AAA"]);
        await expect(page).toHaveURL("/qwikrouter-test/issue2644/other/");

        await page.locator("#issue2644-input").fill("BBB");
        await page.locator("#issue2644-submit").click();
        await expect(page).toHaveURL(
          new RegExp("/qwikrouter-test/issue2644/other/"),
        );

        await expect(page.locator("#issue2644-list > li")).toHaveText([
          "AAA",
          "BBB",
        ]);
      });
    });

    test.describe("issue3497", () => {
      test("should parse formdata", async ({ page }) => {
        await page.goto("/qwikrouter-test/actions/issue3497/");
        const success = page.locator("#issue3497-success");

        await expect(success).toBeHidden();
        await page.locator("#issue3497-button").click();
        await expect(success).toHaveText(
          '{"credentials":{"username":"user","password":"pass"},"array":["1","2"]}',
        );
        await expect(true).toBeTruthy();
      });
    });

    test.describe("issue3183", () => {
      test("should parse dot notation index array formdata", async ({
        page,
      }) => {
        await page.goto("/qwikrouter-test/actions/issue3183/");
        const success = page.locator("#issue3183-success");

        await expect(success).toBeHidden();
        await page.locator("#issue3183-button").click();
        await expect(success).toHaveText(
          '{"arrayOld":["0","1"],"arrayNew":["0","1"],"people":[{"name":"Fred"},{"name":"Sam"}]}',
        );
      });
    });
  }
});
