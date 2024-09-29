import type { RequestHandler } from "@qwik.dev/city";

export const onRequest: RequestHandler = ({ json }) => {
  json(200, {
    issue: 2441,
  });
};
