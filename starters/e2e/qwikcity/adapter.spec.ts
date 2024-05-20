import { expect, test } from "@playwright/test";

test.describe("Qwik City Adapter", () => {
  test("Qwik City Adapter", async ({ page: api }) => {
    const rsp = (await api.goto("/qwikcity-test/build/a-random-file-after-that.js"))!;
    expect(rsp.status()).toBe(200);
    expect(rsp.headers()["content-type"]).toBe(
      "text/html; charset=utf-8",
    );

    const data = await rsp.text();
    expect(data).toBe("Not Found");
  });
});
