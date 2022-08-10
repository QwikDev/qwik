import replServerHtml from '@repl-server-html';
import type { RequestHandler } from '@builder.io/qwik-city';

export const onGet: RequestHandler = ({ response }) => {
  response.headers.set('Content-Type', 'text/html; charset=utf-8');
  response.headers.set('Cache-Control', 'immutable');
  return replServerHtml;
};
