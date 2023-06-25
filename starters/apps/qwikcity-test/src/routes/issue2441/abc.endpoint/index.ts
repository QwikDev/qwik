import type { RequestHandler } from "@builder.io/qwik-city";

export const onRequest: RequestHandler = ({ json }) => {
  json(200, {
    issue: 2441,
  });
};
