import type { EndpointHandler } from '@builder.io/qwik-city';

export const get: EndpointHandler = (ev) => {
  const response = new Response(`${ev.method} ${ev.url}`);

  return response;
};
