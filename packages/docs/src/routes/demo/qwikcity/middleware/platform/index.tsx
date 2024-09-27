import { type RequestHandler } from '@qwikdev/city';

export const onGet: RequestHandler = async ({ platform, json }) => {
  json(200, Object.keys(platform));
};
