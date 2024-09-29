import { type RequestHandler } from '@qwik.dev/city';

export const onGet: RequestHandler = async ({ basePathname, json }) => {
  json(200, { basePathname });
};
