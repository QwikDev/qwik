import { type RequestHandler } from '@qwik.dev/city';

export const onGet: RequestHandler = async ({ params, json }) => {
  json(200, { params });
};
