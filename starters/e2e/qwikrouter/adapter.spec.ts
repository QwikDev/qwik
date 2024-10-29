import { expect, test } from "@playwright/test";

test.describe("Qwik Router Adapter", () => {
  test("should have simple Not Found response for middleware/node static files", async ({
    page: api,
  }) => {
    const nestedUrl = "by/pass/other-routes-for-testing";
    const rsp = (await api.goto(
      `/qwikrouter-test/build/${nestedUrl}/a-random-file-after-that.js`,
    ))!;
    expect(rsp.status()).toBe(404);
    expect(rsp.headers()["content-type"]).toBe("text/html; charset=utf-8");

    const data = await rsp.text();
    expect(data).toBe("Not Found");
    // "Resource Not Found" is replaced in the development server
    expect(data).not.toBe("Resource Not Found");
  });
});
