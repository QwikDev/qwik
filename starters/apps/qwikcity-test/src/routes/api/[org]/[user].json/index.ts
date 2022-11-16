import type { RequestHandler } from '@builder.io/qwik-city';
import os from 'node:os';

export const onGet: RequestHandler = ({ request, params }) => {
  return {
    timestamp: Date.now(),
    method: request.method,
    url: request.url,
    params,
    os: os.platform(),
    arch: os.arch(),
    node: process.versions.node,
  };
};

export const onPost: RequestHandler = async ({ request, response }) => {
  response.headers.set('Content-Type', 'text/plain');
  return `Platform: ${os.platform()}, Node: ${process.versions.node}, HTTP Method: ${
    request.method
  }`;
};
