import type { EndpointHandler } from '@builder.io/qwik-city';
import os from 'os';

export const onGet: EndpointHandler = ({ request, params }) => {
  return {
    status: 200,
    body: {
      timestamp: Date.now(),
      method: request.method,
      url: request.url,
      params,
      os: os.platform(),
      arch: os.arch(),
      node: process.versions.node,
    },
  };
};

export const onPost: EndpointHandler = async ({ request, params }) => {
  return {
    status: 200,
    body: {
      timestamp: Date.now(),
      method: request.method,
      url: request.url,
      params,
      os: os.platform(),
      arch: os.arch(),
      node: process.versions.node,
    },
  };
};
