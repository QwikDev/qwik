import { type RequestHandler } from '@qwikdev/city';

export const onGet: RequestHandler = async ({ exit }) => {
  throw exit();
};
