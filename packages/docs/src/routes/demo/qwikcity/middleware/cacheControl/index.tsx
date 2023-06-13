import { type RequestHandler } from '@builder.io/qwik-city';

export const onGet: RequestHandler = async ({
  cacheControl,
  headers,
  json,
}) => {
  cacheControl({ maxAge: 42, public: true });
  const obj: Record<string, string> = {};
  headers.forEach((value, key) => (obj[key] = value));
  json(200, obj);
};
