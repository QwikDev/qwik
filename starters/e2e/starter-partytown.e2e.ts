import { test, expect } from "@playwright/test";

test("rendered", async ({ page }) => {
  await page.goto("/starter-partytown-test/");
  page.on("pageerror", (err) => expect(err).toEqual(undefined));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      expect(msg.text()).toEqual(undefined);
    }
  });

  const congrats = page.locator(".congrats");
  const state = page.locator("#state");
  await expect(congrats).toContainText(
    "Congratulations Qwik with Partytown is working!",
  );
  await expect(state).toHaveText("running");

  await expect(state).toHaveText("finished");
});

test("update text", async ({ page }) => {
  await page.goto("/starter-partytown-test/");
  page.on("pageerror", (err) => expect(err).toEqual(undefined));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      expect(msg.text()).toEqual(undefined);
    }
  });

  await page.fill("input", "QWIK");
  await page.dispatchEvent("input", "keyup");
  await expect(page.locator("ol")).toContainText("Hello QWIK!");
});
