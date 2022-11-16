import type { RequestHandler } from '@builder.io/qwik-city';
import os from 'node:os';

export const onGet: RequestHandler = ({ request }) => {
  return {
    timestamp: Date.now(),
    method: request.method,
    url: request.url,
    os: os.platform(),
    arch: os.arch(),
    node: process.versions.node,
  };
};
