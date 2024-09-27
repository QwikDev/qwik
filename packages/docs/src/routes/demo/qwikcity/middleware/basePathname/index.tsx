import { type RequestHandler } from '@qwikdev/city';

export const onGet: RequestHandler = async ({ basePathname, json }) => {
  json(200, { basePathname });
};
