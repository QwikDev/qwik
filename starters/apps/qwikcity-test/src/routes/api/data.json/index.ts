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
    status(203);
    headers.set('Content-Type', 'text/csv');
    const writer = getWriter();
    setTimeout(() => {
      writer.write('0,' + Date.now().toString());
      setTimeout(() => {
        writer.write('1,' + Date.now().toString());
        setTimeout(() => {
          writer.write('2,' + Date.now().toString());
          writer.close();
        }, 500);
      }, 500);
    }, 500);
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
