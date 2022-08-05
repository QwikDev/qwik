import type { EndpointHandler } from '@builder.io/qwik-city';

export const onGet: EndpointHandler = ({ request }) => {
  return {
    timestamp: Date.now(),
    method: request.method,
    url: request.url,
  };
};
