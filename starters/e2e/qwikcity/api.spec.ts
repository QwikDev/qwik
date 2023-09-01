import { expect, test } from "@playwright/test";

test.describe("Qwik City API", () => {
  test("Qwik City API", async ({ page: api }) => {
    const rsp = (await api.goto("/qwikcity-test/api/data.json"))!;
    expect(rsp.status()).toBe(200);
    expect(rsp.headers()["content-type"]).toBe(
      "application/json; charset=utf-8",
    );

    const data = await rsp.json();
    expect(data.method).toBe("GET");
    expect(data.node).toBe(process.versions.node);
    expect(data.shared).toBe("from root");
  });

  test("Qwik City API, params", async ({ page: api }) => {
    const rsp = (await api.goto("/qwikcity-test/api/builder.io/oss.json"))!;
    expect(rsp.status()).toBe(200);
    expect(rsp.headers()["content-type"]).toBe(
      "application/json; charset=utf-8",
    );

    const data = await rsp.json();
    expect(data.method).toBe("GET");
    expect(data.node).toBe(process.versions.node);
    expect(data.params.org).toBe("builder.io");
    expect(data.params.user).toBe("oss");
  });

  test("Page route GET, custom json response", async ({ page: api }) => {
    const rsp = (await api.goto("/qwikcity-test/products/hat/?json=true"))!;
    expect(rsp.status()).toBe(200);
    expect(rsp.headers()["content-type"]).toBe(
      "application/json; charset=utf-8",
    );

    const clientData = await rsp.json();
    expect(clientData.productId).toBe("hat");
    expect(clientData.price).toBe("$21.96");
  });

  test("PUT endpoint on page", async ({ page }) => {
    const rsp = (await page.goto("/qwikcity-test/api/"))!;
    expect(rsp.status()).toBe(200);
    expect(rsp.headers()["content-type"]).toBe("text/html; charset=utf-8");

    const btnPut = page.locator("[data-test-api-onput]");
    expect(await btnPut.textContent()).toBe("onPut");
    await btnPut.click();
    await page.waitForSelector(".onput-success");
    expect(await btnPut.textContent()).toBe("PUT test");
  });

  test("POST endpoint on page", async ({ page }) => {
    const rsp = (await page.goto("/qwikcity-test/api/"))!;
    expect(rsp.status()).toBe(200);
    expect(rsp.headers()["content-type"]).toBe("text/html; charset=utf-8");

    const btnPut = page.locator("[data-test-api-onpost]");
    expect(await btnPut.textContent()).toBe(
      "onPost (accept: application/json)",
    );
    await btnPut.click();
    await page.waitForSelector(".onpost-success");
    expect(await btnPut.textContent()).toBe("POST test");
  });

  test('redirect from product page because of "querystring-test" exists', async ({
    page,
  }) => {
    const rsp = (await page.goto(
      "/qwikcity-test/products/hat/?querystring-test=true",
    ))!;
    expect(new URL(rsp.url()).pathname).toBe("/qwikcity-test/");
  });

  test("endpoint with a dot in the pathname, with a trailing slash", async ({
    page,
  }) => {
    const rsp = (await page.goto("/qwikcity-test/issue2441/abc.endpoint/"))!;
    expect(rsp.status()).toBe(200);
    const clientData = await rsp.json();
    expect(clientData.issue).toBe(2441);
  });

  test("endpoint with a dot in the pathname, without a trailing slash", async ({
    page,
  }) => {
    const rsp = (await page.goto("/qwikcity-test/issue2441/abc.endpoint"))!;
    expect(rsp.status()).toBe(200);
    const clientData = await rsp.json();
    expect(clientData.issue).toBe(2441);
  });

  test("page with a dot in the pathname, with a trailing slash", async ({
    page,
  }) => {
    const rsp = (await page.goto("/qwikcity-test/issue2441/abc.page/"))!;
    expect(rsp.status()).toBe(200);
    const h1 = page.locator("#issue2441");
    expect(await h1.textContent()).toBe("Issue 2441");
  });

  test("page with a dot in the pathname, without a trailing slash", async ({
    page,
  }) => {
    const rsp = (await page.goto("/qwikcity-test/issue2441/abc.page"))!;
    expect(rsp.status()).toBe(200);
    const h1 = page.locator("#issue2441");
    expect(await h1.textContent()).toBe("Issue 2441");
  });
});
