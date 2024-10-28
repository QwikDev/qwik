import { type RequestHandler } from '@qwik.dev/router';

export const onGet: RequestHandler = async ({ basePathname, json }) => {
  json(200, { basePathname });
};
