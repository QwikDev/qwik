import type { RequestHandler } from '@qwik.dev/router';

// No component: this route only redirects.
export const onGet: RequestHandler = ({ redirect }) => {
  throw redirect(302, '/qwikrouter-test.prod/redirect-only/final/');
};
