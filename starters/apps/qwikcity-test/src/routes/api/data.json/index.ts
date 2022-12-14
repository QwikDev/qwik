import type { RequestHandler } from '@builder.io/qwik-city';
import os from 'node:os';

export const onGet: RequestHandler = ({
  request,
  headers,
  query,
  json,
  html,
  send,
  getWriter,
  status,
}) => {
  const format = query.get('format');

  if (format === 'csv') {
    headers.set('Content-Type', 'text/csv');
    status(203);
    headers.set('Content-Type', 'text/csv');
    const writer = getWriter();
    writer.write(format + ',' + request.method + ',' + Date.now().toString());
    writer.close();
    return;
  }

  if (format === 'text') {
    headers.set('Content-Type', 'text/plain');
    send(202, format + ' ' + request.method + ' ' + Date.now().toString());
    return;
  }

  if (format === 'html') {
    html(201, format + ' ' + request.method + ' ' + Date.now().toString());
    return;
  }

  json(200, {
    timestamp: Date.now(),
    method: request.method,
    url: request.url,
    os: os.platform(),
    arch: os.arch(),
    node: process.versions.node,
  });
};
