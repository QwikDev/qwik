import type { EndpointHandler } from '~qwik-city-runtime';
import os from 'os';

export const get: EndpointHandler = ({ request }) => {
  const data = {
    timestamp: Date.now(),
    method: request.method,
    url: request.url,
    os: os.platform(),
    arch: os.arch(),
    node: process.versions.node,
  };

  const res = new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  return res;
};
