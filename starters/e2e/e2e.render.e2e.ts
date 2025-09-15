import { test, expect } from "@playwright/test";

test.describe("render", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/e2e/render");
    page.on("pageerror", (err) => expect(err).toEqual(undefined));
    page.on("console", (msg) => {
      // console.warn(msg.type(), msg.text());
      if (msg.type() === "error") {
        expect(msg.text()).toEqual(undefined);
      }
    });
  });

  function tests(isClient: boolean) {
    test("should load", async ({ page }) => {
      const button = page.locator("button#increment");
      const text = page.locator("#rerenders");

      await expect(text).toHaveText("Rerender 0");
      await button.click();
      await expect(text).toHaveText("Rerender 1");
    });

    test("should render classes", async ({ page }) => {
      const increment = page.locator("button#increment");
      const toggle = page.locator("button#toggle");

      const attributes = page.locator("#attributes");

      await expect(attributes).toHaveClass("⚡️unvb18-1 even stable0");
      await expect(attributes).toHaveAttribute("aria-hidden", "true");
      await expect(attributes).toHaveAttribute("preventdefault:click", "");

      await increment.click();

      await expect(attributes).toHaveClass("⚡️unvb18-1 odd stable0");
      await expect(attributes).toHaveAttribute("aria-hidden", "true");
      await expect(attributes).toHaveAttribute("preventdefault:click", "");

      await toggle.click();

      await expect(attributes).toHaveClass("⚡️unvb18-1");
      await expect(attributes).not.toHaveAttribute("aria-hidden");
      await expect(attributes).not.toHaveAttribute("preventdefault:click");

      await increment.click();

      await expect(attributes).toHaveClass("⚡️unvb18-1");
      await expect(attributes).not.toHaveAttribute("aria-hidden");
      await expect(attributes).not.toHaveAttribute("preventdefault:click");

      await toggle.click();

      await expect(attributes).toHaveClass("⚡️unvb18-1 even stable0");
      await expect(attributes).toHaveAttribute("aria-hidden", "true");
      await expect(attributes).toHaveAttribute("preventdefault:click", "");
    });

    test("issue1475", async ({ page }) => {
      const button = page.locator("#issue-1475-button");
      const result = page.locator("#issue-1475-result");

      await button.click();
      await expect(result).toHaveText(
        "1. Before\n2. Some text\nMiddle\n3 After\n\nStuff",
        {
          useInnerText: true,
        },
      );
    });

    test("counter toggle", async ({ page }) => {
      const button = page.locator("#counter-toggle-btn");
      const show1 = page.locator("#counter-toggle-show");
      const show2 = page.locator("#counter-toggle-show-2");
      await expect(show1).toHaveText("even");
      await expect(show2).toHaveText("true");
      await button.click();
      await expect(show1).toHaveText("odd");
      await expect(show2).toHaveText("false");
      await button.click();
      await expect(show1).toHaveText("even");
      await expect(show2).toHaveText("true");
      await button.click();
      await expect(show1).toHaveText("odd");
      await expect(show2).toHaveText("false");
    });

    test("handle props destructuring", async ({ page }) => {
      const button = page.locator("button#increment");

      const message1 = page.locator("#props-destructuring > span");
      const renders1 = page.locator("#props-destructuring > .renders");

      const message2 = page.locator("#props-destructuring-no > span");
      const renders2 = page.locator("#props-destructuring-no > .renders");

      const message3 = page.locator("#props-destructuring-count > span");
      const renders3 = page.locator("#props-destructuring-count > .renders");

      await expect(message1).toHaveText("Hello 0");
      await expect(renders1).toHaveText("1");
      await expect(message2).toHaveText("Default 0");
      await expect(renders2).toHaveText("1");
      await expect(message3).toHaveText("Count 0");
      await expect(message3).toHaveAttribute("aria-count", "0");
      await expect(renders3).toHaveText("1");

      await button.click();

      await expect(message1).toHaveText("Hello 1");
      await expect(renders1).toHaveText("1");
      await expect(message2).toHaveText("Default 1");
      await expect(renders2).toHaveText("1");
      await expect(message3).toHaveText("Count 1");
      await expect(message3).toHaveAttribute("aria-count", "1");
      await expect(renders3).toHaveText("1");

      await button.click();

      await expect(message1).toHaveText("Hello 2");
      await expect(renders1).toHaveText("1");
      await expect(message2).toHaveText("Default 2");
      await expect(renders2).toHaveText("1");
      await expect(message3).toHaveText("Count 2");
      await expect(message3).toHaveAttribute("aria-count", "2");
      await expect(renders3).toHaveText("1");
    });

    test("issue2563", async ({ page }) => {
      const string = page.locator("#issue-2563-string");
      const obj = page.locator("#issue-2563-obj");
      const operation = page.locator("#issue-2563-operation");

      await expect(string).toHaveText("4=4");
      await expect(obj).toHaveText("4=4");
      await expect(operation).toHaveText("4+1=5");
    });

    test("issue2608", async ({ page }) => {
      const toggle = page.locator("#issue-2608-btn");
      const input = page.locator("#issue-2608-input");

      await expect(input).toHaveValue("");
      await input.fill("some text");
      await expect(input).toHaveValue("some text");
      await toggle.click();
      await expect(input).toHaveValue("some text");
      await toggle.click();
      await expect(input).toHaveValue("some text");
    });

    test("issue2800", async ({ page }) => {
      const button = page.locator("#issue-2800-btn");
      const results = page.locator("#issue-2800-result > li");

      await expect(results).toHaveText([
        "alpha - 1",
        "bravo - 2",
        "charlie - 3",
      ]);

      await button.click();
      await expect(results).toHaveText([
        "alpha - 1",
        "bravo - 2",
        "charlie - 3",
        "extra3 - 1",
      ]);
      await button.click();
      await expect(results).toHaveText([
        "alpha - 1",
        "bravo - 2",
        "charlie - 3",
        "extra3 - 1",
        "extra4 - 1",
      ]);
    });

    test("issue2889", async ({ page }) => {
      const result1 = page.locator("#issue-2889-result1");
      const result2 = page.locator("#issue-2889-result2");

      await expect(result1).toHaveText("Deeds: 4");
      await expect(result2).toHaveText("Filtered Deeds: 2");
    });

    test("issue3116", async ({ page }) => {
      const result = page.locator("#issue-3116-result");

      await expect(result).toHaveText("this comes from render$");
    });

    test("issue reorder", async ({ page }) => {
      const result = page.locator(".issue-order");
      const button = page.locator("#issue-order-btn");
      await expect(result).toHaveText(["TOP", "1. First", "2. Second"]);

      await button.click();
      await expect(result).toHaveText(["1. First", "2. Second", "BOTTOM"]);
    });

    test("issue2414", async ({ page }) => {
      const sortByAge = page.locator("#issue-2414-age");
      const sortBySize = page.locator("#issue-2414-size");
      const sortById = page.locator("#issue-2414-id");

      const age = page.locator(".issue-2414-age");
      const size = page.locator(".issue-2414-size");
      const id = page.locator(".issue-2414-id");

      const list = [
        [1, 9, 4],
        [2, 27, 3],
        [3, 3, 2],
        [4, 1, 1],
        [7, 21, 5],
        [8, 12, 6],
        [9, 7, 7],
      ];
      await expect(size).toHaveText(list.map((a) => String(a[0])));
      await expect(age).toHaveText(list.map((a) => String(a[1])));
      await expect(id).toHaveText(list.map((a) => String(a[2])));

      // Sort by age
      list.sort((a, b) => a[1] - b[1]);
      await sortByAge.click();

      await expect(size).toHaveText(list.map((a) => String(a[0])));
      await expect(age).toHaveText(list.map((a) => String(a[1])));
      await expect(id).toHaveText(list.map((a) => String(a[2])));

      list.sort((a, b) => a[2] - b[2]);
      await sortById.click();

      await expect(size).toHaveText(list.map((a) => String(a[0])));
      await expect(age).toHaveText(list.map((a) => String(a[1])));
      await expect(id).toHaveText(list.map((a) => String(a[2])));

      list.sort((a, b) => a[0] - b[0]);
      await sortBySize.click();

      await expect(size).toHaveText(list.map((a) => String(a[0])));
      await expect(age).toHaveText(list.map((a) => String(a[1])));
      await expect(id).toHaveText(list.map((a) => String(a[2])));
    });

    test("issue3178", async ({ page }) => {
      const result = page.locator("#issue-3178");
      await expect(result).toHaveText("Hello");
    });

    test("issue3398", async ({ page }) => {
      const toggle = page.locator("#issue-3398-button");
      await expect(page.locator("h1#issue-3398-tag")).toHaveText("Hello h1");
      await expect(page.locator("h1#issue-3398-tag")).not.toHaveAttribute(
        "children",
      );

      await toggle.click();
      await expect(page.locator("h1#issue-3398-tag")).not.toBeVisible();
      await expect(page.locator("h2#issue-3398-tag")).toHaveText("Hello h2");
      await expect(page.locator("h2#issue-3398-tag")).not.toHaveAttribute(
        "children",
      );

      await toggle.click();
      await expect(page.locator("h2#issue-3398-tag")).not.toBeVisible();
      await expect(page.locator("h1#issue-3398-tag")).toBeVisible();
      await expect(page.locator("h1#issue-3398-tag")).toHaveText("Hello h1");
      await expect(page.locator("h1#issue-3398-tag")).not.toHaveAttribute(
        "children",
      );
    });

    test("issue3479", async ({ page }) => {
      const increment = page.locator("#issue-3479-button");
      const result = page.locator("#issue-3479-result");

      await expect(result).toHaveText("0");
      await increment.click();
      await expect(result).toHaveText("1");
      await increment.click();
      await expect(result).toHaveText("2");
      await increment.click();
      await expect(result).toHaveText("3");
    });

    test("issue3481", async ({ page }) => {
      const increment = page.locator("#issue-3481-button");
      const result1 = page.locator("#issue-3481-result1");
      const result2 = page.locator("#issue-3481-result2");

      await expect(result1).toHaveText("Hello 0");
      await expect(result2).toHaveText("Hello 0");
      await expect(result1).toHaveCSS("color", "rgb(0, 0, 255)");
      await expect(result2).toHaveCSS("color", "rgb(255, 0, 0)");
      await increment.click();
      await expect(result1).toHaveText("Hello 1");
      await expect(result2).toHaveText("Hello 1");
      await expect(result1).toHaveCSS("color", "rgb(0, 0, 255)");
      await expect(result2).toHaveCSS("color", "rgb(255, 0, 0)");

      await increment.click();
      await expect(result1).toHaveText("Hello 2");
      await expect(result2).toHaveText("Hello 2");
      await expect(result1).toHaveCSS("color", "rgb(0, 0, 255)");
      await expect(result2).toHaveCSS("color", "rgb(255, 0, 0)");
    });

    test("issue3468", async ({ page }) => {
      const cards = page.locator(".issue-3468-card");
      await expect(cards).toHaveText(["a:", "b:", "c:", "d:"]);
    });

    test("issue3542", async ({ page }) => {
      const result = page.locator("#issue-3542-result");
      await expect(result).toHaveText("CODE IS 1");
    });

    test("issue3643", async ({ page }) => {
      const result = page.locator("#issue-3643-result");
      const result2 = page.locator("#issue-3643-result-2");
      const button = page.locator("#issue-3643-button");

      await expect(result).toHaveText("Hello");
      await expect(result2).toHaveText("Hello");
      await button.click();
      await expect(result).toHaveText("World");
      await expect(result2).toHaveText("World");
      await button.click();
      await expect(result).toHaveText("Hello");
      await expect(result2).toHaveText("Hello");
      await button.click();
      await expect(result).toHaveText("World");
      await expect(result2).toHaveText("World");
      await button.click();
      await expect(result).toHaveText("Hello");
      await expect(result2).toHaveText("Hello");
      await button.click();
      await expect(result).toHaveText("World");
      await expect(result2).toHaveText("World");
    });
    test("issue-children-spread-result", async ({ page }) => {
      const result = page.locator("#issue-children-spread-result");
      const staticContent = page.locator("#issue-children-spread-static");
      const button = page.locator("#issue-children-spread-button");

      await expect(staticContent).toHaveText("12");
      await expect(result).toHaveText("Hello");
      await button.click();
      await expect(result).toHaveText("Changed");
    });

    test("issue3731", async ({ page }) => {
      const button = page.locator("#issue-3731-button");
      const results = page.locator(".issue-3731-result");
      await expect(results).toHaveText([
        "think",
        "containers",
        "hydrating",
        "usestylesscoped",
        "slots",
      ]);
      await button.click();
      await expect(results).toHaveText([
        "think",
        "containers",
        "cleanup",
        "usevisibletask",
        "hydrating",
      ]);
      await button.click();
      await expect(results).toHaveText([
        "cleanup",
        "usevisibletask",
        "think",
        "containers",
        "slots",
      ]);
    });

    test("issue3702", async ({ page }) => {
      const button = page.locator("#issue-3702-button");
      const result = page.locator("#issue-3702-result");
      await expect(result).toHaveAttribute("data-title", "Bye 0");
      await button.click();
      await expect(result).toHaveAttribute("data-title", "Bye 1");
      await button.click();
      await expect(result).toHaveAttribute("data-title", "Bye 2");
    });

    test("issue3795", async ({ page }) => {
      const result = page.locator("#issue-3795-result");
      await expect(result).toHaveText("foo foobar");
    });

    test("issue4029", async ({ page }) => {
      const toggle = page.locator("#issue-4029-toggle");
      const result = page.locator("#issue-4029-result");
      await expect(result).toHaveText("CompA");
      await toggle.click();
      await expect(result).toHaveText("CompB");
    });

    test("skip render", async ({ page }) => {
      const increment = page.locator("#skip-render-button");
      const result = page.locator("#skip-render-result");

      await expect(increment).toHaveText("Increment 0");
      await expect(result).toHaveText("Number: 0");

      await increment.click();
      await expect(increment).toHaveText("Increment 0");
      await expect(result).toHaveText("Number: 1");

      await increment.click();
      await expect(increment).toHaveText("Increment 0");
      await expect(result).toHaveText("Number: 2");

      await increment.click();
      await expect(increment).toHaveText("Increment 3");
      await expect(result).toHaveText("Number: 3");

      await increment.click();
      await expect(increment).toHaveText("Increment 3");
      await expect(result).toHaveText("Number: 4");

      await increment.click();
      await expect(increment).toHaveText("Increment 3");
      await expect(result).toHaveText("Number: 5");

      await increment.click();
      await expect(increment).toHaveText("Increment 6");
      await expect(result).toHaveText("Number: 6");
    });

    test("ssr raw", async ({ page }) => {
      const result = page.locator("#ssr-raw-test-result");
      const mounted = await result.getAttribute("data-mounted");
      if (mounted === "server") {
        expect(await result.innerHTML()).toEqual(
          "<!--q:container=html--><b>ssr raw test</b><!--/q:container-->",
        );
      } else if (mounted === "browser") {
        expect(await result.innerHTML()).toEqual("");
      } else {
        throw new Error("Unexpected mounted value");
      }
    });

    test("issue4292", async ({ page }) => {
      const button = page.locator("#issue-4292-result");
      await expect(button).toHaveText("Hello, World!");
      await expect(button).toHaveAttribute("aria-label", "a1");
      await expect(button).toHaveAttribute("title", "a1");

      await button.click();
      await expect(button).toHaveAttribute("aria-label", "a");
      await expect(button).toHaveAttribute("title", "a");

      await button.click();
      await expect(button).toHaveAttribute("aria-label", "a1");
      await expect(button).toHaveAttribute("title", "a1");
    });

    test("issue 4386", async ({ page }) => {
      const result = page.locator("#issue-4386-result");
      await expect(result).toHaveText("1");
    });

    test("issue 4455", async ({ page }) => {
      const input1 = page.locator("#issue-4455-input1");
      const input2 = page.locator("#issue-4455-input2");
      await expect(input1).toHaveValue("0.5");
      await expect(input2).toHaveValue("0.5");
    });

    test("issue 5266", async ({ page }) => {
      const tag = page.locator("#issue-5266-tag");
      const button = page.locator("#issue-5266-button");
      await page.locator("#issue-5266-render").click();

      await expect(tag).toHaveAttribute("data-v", "foo");
      await button.click();
      await expect(tag).toHaveAttribute("data-v", "bar");
    });

    test("should rerender child once", async ({ page }) => {
      const button = page.locator("#rerender-once-button");
      const rerenderOnceChild = page.locator("#rerender-once-child");
      await expect(rerenderOnceChild).toHaveText('["render Cmp","foo",0]');
      await button.click();
      await expect(rerenderOnceChild).toHaveText(
        '["render Cmp","foo",0,"render Cmp","bar",1]',
      );
      await button.click();
      await expect(rerenderOnceChild).toHaveText(
        '["render Cmp","foo",0,"render Cmp","bar",1,"render Cmp","foo",0]',
      );
    });
  }

  tests(false);

  test.describe("client rerender", () => {
    test.beforeEach(async ({ page }) => {
      const toggleRender = page.locator("#rerender");
      const v = await toggleRender.getAttribute("data-v");
      await toggleRender.click();
      await expect(page.locator("#rerenderCount")).toHaveText(
        `Render ${Number(v) + 1}`,
      );
      await page.waitForLoadState("networkidle");
    });
    tests(true);
  });

  test("pr3475", async ({ page }) => {
    const ref = page.locator("#pr-3475-button");
    await expect(ref).toHaveText("data");
    await ref.click();
    await expect(ref).not.toHaveText("data");
  });

  test("issue4346", async ({ page }) => {
    const result = page.locator("#issue-4346-result");
    const toggle = page.locator("#issue-4346-toggle");
    await expect(result).toHaveText("Hello");
    await toggle.click();
    await expect(result).toHaveText("world");
  });

  test("dynamic DOM tags", async ({ page }) => {
    const button = page.locator("#dynamic-button");
    await expect(button).toHaveClass("btn");
  });
});
