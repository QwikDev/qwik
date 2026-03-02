import type { RequestHandler } from "@qwik.dev/router";

export const onRequest: RequestHandler<void> = async (onRequestArgs) => {
  const { headers } = onRequestArgs;
  headers.set("x-qwikrouter-test", "issue4531");
};
