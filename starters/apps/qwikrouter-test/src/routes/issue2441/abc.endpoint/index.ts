import type { RequestHandler } from "@qwik.dev/router";

export const onRequest: RequestHandler = ({ json }) => {
  json(200, {
    issue: 2441,
  });
};
