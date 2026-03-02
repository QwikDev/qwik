import { type RequestHandler } from '@qwik.dev/router';

export const onGet: RequestHandler = async ({ redirect, url }) => {
  throw redirect(
    308,
    new URL('/demo/qwikrouter/middleware/status/', url).toString()
  );
};
