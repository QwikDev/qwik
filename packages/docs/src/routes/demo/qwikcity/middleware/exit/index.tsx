import { type RequestHandler } from '@qwik.dev/city';

export const onGet: RequestHandler = async ({ exit }) => {
  throw exit();
};
