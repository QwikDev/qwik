import { type RequestHandler } from '@qwikdev/city';

export const onGet: RequestHandler = async ({ text }) => {
  text(200, 'Text based response.');
};
