import { type RequestHandler } from '@qwik.dev/router';

export const onGet: RequestHandler = async ({ text }) => {
  text(200, 'Text based response.');
};
