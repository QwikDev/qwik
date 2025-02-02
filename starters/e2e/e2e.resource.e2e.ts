import { test, expect } from "@playwright/test";

test.describe("resource", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/e2e/resource");
    page.on("pageerror", (err) => expect(err).toEqual(undefined));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });

  test("should load", async ({ page }) => {
    const resource1 = page.locator(".resource1");
    const logs = page.locator(".logs");
    const increment = page.locator("button.increment");
    let logsContent = "";
    // execute first task
    logsContent += "[WATCH] 1 before\n[WATCH] 1 after\n";
    // execute second task
    logsContent += "[WATCH] 2 before\n[WATCH] 2 after\n";
    // execute the resource
    logsContent += "[RESOURCE] 1 before\n[RESOURCE] 1 after\n\n";
    await expect(resource1).toHaveText("resource 1 is 80");
    // await expect(resource2).toHaveText('resource 2 is 160');
    await expect(logs).toHaveText(logsContent);

    // Increment
    await increment.click();

    await expect(resource1).toHaveText("loading resource 1...");
    // execute first task
    logsContent += "[WATCH] 1 before\n[WATCH] 1 after\n";
    // execute second task
    logsContent += "[WATCH] 2 before\n[WATCH] 2 after\n";
    // rexecute the resource
    logsContent += "[RESOURCE] 1 before\n[RESOURCE] 1 after\n\n";
    // await expect(resource2).toHaveText('loading resource 2...');
    await expect(logs).toHaveText(logsContent);

    await expect(resource1).toHaveText("resource 1 is 88");
    // await expect(resource2).toHaveText('resource 2 is 176');
    await expect(logs).toHaveText(logsContent);
  });

  test("should track subscriptions", async ({ page }) => {
    const resource1 = page.locator(".resource1");
    const logs = page.locator(".logs");
    let logsContent = "";
    // execute first task
    logsContent += "[WATCH] 1 before\n[WATCH] 1 after\n";
    // execute second task
    logsContent += "[WATCH] 2 before\n[WATCH] 2 after\n";
    // execute the resource
    logsContent += "[RESOURCE] 1 before\n[RESOURCE] 1 after\n\n";
    await expect(resource1).toHaveText("resource 1 is 80");
    await expect(logs).toHaveText(logsContent);

    // Count
    const countBtn = page.locator("button.count");
    await expect(countBtn).toHaveText("count is 0");
    await countBtn.click();
    await expect(countBtn).toHaveText("count is 1");

    await expect(logs).toHaveText(logsContent);

    await countBtn.click();
    await expect(countBtn).toHaveText("count is 2");
  });
});

test.describe("resource serialization", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/e2e/resource-serialization");
    page.on("pageerror", (err) => expect(err).toEqual(undefined));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });

  test("should load", async ({ page }) => {
    const button1 = page.locator("button.r1");
    const button2 = page.locator("button.r2");
    const button3 = page.locator("button.r3");

    await expect(button1).toHaveText("PASS: Success 0");
    await expect(button2).toHaveText("ERROR: Error: failed 0");
    await expect(button3).toHaveText("ERROR: Error: timeout 0");

    // Click button 1
    await button1.click();

    await expect(button1).toHaveText("PASS: Success 1");
    await expect(button2).toHaveText("ERROR: Error: failed 0");
    await expect(button3).toHaveText("ERROR: Error: timeout 0");

    // Click button 2
    await button2.click();

    await expect(button1).toHaveText("PASS: Success 1");
    await expect(button2).toHaveText("ERROR: Error: failed 1");
    await expect(button3).toHaveText("ERROR: Error: timeout 1");

    // Click button 2
    await button2.click();

    await expect(button1).toHaveText("PASS: Success 1");
    await expect(button2).toHaveText("ERROR: Error: failed 2");
    await expect(button3).toHaveText("ERROR: Error: timeout 2");
  });

  test("issue 2014", async ({ page }) => {
    const button1 = page.locator("#issue-2014-btn");
    await expect(button1).toHaveText("0(count is here: 0)");
    await button1.click();
    await expect(button1).toHaveText("2(count is here: 1)");
    await button1.click();
    await expect(button1).toHaveText("4(count is here: 2)");
  });

  test("race condition", async ({ page }) => {
    const btn = page.locator("#resource-race-btn");
    const result = page.locator("#resource-race-result");

    await expect(btn).toHaveText("0");
    await expect(result).toHaveText("0");
    await btn.click();
    await expect(btn).toHaveText("1");
    await expect(result).toHaveText("0");
    await btn.click();
    await expect(btn).toHaveText("2");
    await expect(result).toHaveText("2");
    await page.waitForTimeout(1000);

    await expect(btn).toHaveText("2");
    await expect(result).toHaveText("2");
    await btn.click();

    await expect(btn).toHaveText("3");
    await expect(result).toHaveText("3");
  });
});

test.describe("resource fn", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/e2e/resource-fn");
    page.on("pageerror", (err) => expect(err).toEqual(undefined));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });

  test("should load", async ({ page }) => {
    const asyncSignal = page.locator("#asyncSignal");
    const promise = page.locator("#promise");
    const signal = page.locator("#signal");
    const resource = page.locator("#resource");

    await expect(resource).toHaveText("resource");
    await expect(asyncSignal).toHaveText("asyncSignal");
    await expect(promise).toHaveText("promise");
    await expect(signal).toHaveText("signal");
  });
});
