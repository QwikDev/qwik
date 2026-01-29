import { type RequestHandler } from '@builder.io/qwik-city';

export const onGet: RequestHandler = async ({ exit }) => {
  throw exit();
};
