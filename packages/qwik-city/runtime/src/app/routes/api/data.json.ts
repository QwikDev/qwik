import type { EndpointHandler } from '~qwik-city-runtime';
import os from 'os';

export const onGet: EndpointHandler = ({ request }) => {
  return {
    timestamp: Date.now(),
    method: request.method,
    url: request.url,
    os: os.platform(),
    arch: os.arch(),
    node: process.versions.node,
  };
};
