import type { EndpointHandler } from '@builder.io/qwik-city';

export const get: EndpointHandler = ({ request, params }) => {
  const data = {
    timestamp: Date.now(),
    method: request.method,
    url: request.url,
    params,
  };

  const res = new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  return res;
};
