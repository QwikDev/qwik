import { type RequestHandler } from '@qwik.dev/router';

export const onGet: RequestHandler = async ({ params, json }) => {
  json(200, { params });
};
