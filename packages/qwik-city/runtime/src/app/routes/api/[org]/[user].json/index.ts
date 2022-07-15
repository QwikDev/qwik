import type { EndpointHandler } from '~qwik-city-runtime';
import os from 'os';
import { HTTPStatus } from 'packages/qwik-city/runtime/src/library/types';

export const onGet: EndpointHandler = ({ request, params }) => {
  return {
    status: HTTPStatus.Ok,
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

export const onPost: EndpointHandler = async ({ request }) => {
  return {
    status: HTTPStatus.Ok,
    body: `Platform: ${os.platform()}, Node: ${process.versions.node}, HTTP Method: ${
      request.method
    }`,
    headers: {
      'Content-Type': 'text/plain',
    },
  };
};
