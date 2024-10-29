import { type RequestHandler } from '@qwik.dev/router';

export const onGet: RequestHandler = async ({ exit }) => {
  throw exit();
};
