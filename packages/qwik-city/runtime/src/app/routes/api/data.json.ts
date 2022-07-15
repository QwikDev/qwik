import type { EndpointHandler } from '~qwik-city-runtime';
import os from 'os';
import { HTTPStatus } from '../../../library/types';

export const onGet: EndpointHandler = ({ request }) => {
  return {
    status: HTTPStatus.Ok,
    body: {
      timestamp: Date.now(),
      method: request.method,
      url: request.url,
      os: os.platform(),
      arch: os.arch(),
      node: process.versions.node,
    },
  };
};
