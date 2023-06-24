import { type RequestHandler } from '@builder.io/qwik-city';

export const onGet: RequestHandler = async ({ basePathname, json }) => {
  json(200, { basePathname });
};
