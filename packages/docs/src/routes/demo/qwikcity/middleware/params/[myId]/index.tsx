import { type RequestHandler } from '@builder.io/qwik-city';

export const onGet: RequestHandler = async ({ params, json }) => {
  json(200, { params });
};
