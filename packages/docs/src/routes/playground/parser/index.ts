import type { RequestHandler } from '@qwik.dev/router';

export const onRequest: RequestHandler = ({ redirect }) => {
  throw redirect(308, '/playground/parser/state');
};
