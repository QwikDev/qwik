import type { RequestHandler } from "@qwikdev/city";

export const onRequest: RequestHandler = ({ json }) => {
  json(200, {
    issue: 2441,
  });
};
