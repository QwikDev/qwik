import { type RequestHandler } from '@qwikdev/city';

export const onGet: RequestHandler = async ({ params, json }) => {
  json(200, { params });
};
