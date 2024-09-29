import { type RequestHandler } from '@qwik.dev/city';

export const onGet: RequestHandler = async ({ platform, json }) => {
  json(200, Object.keys(platform));
};
