import { type RequestHandler } from '@builder.io/qwik-city';

export const onGet: RequestHandler = async ({ platform, json }) => {
  json(200, Object.keys(platform));
};
