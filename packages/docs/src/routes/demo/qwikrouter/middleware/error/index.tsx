import { type RequestHandler } from '@qwik.dev/router';

export const onGet: RequestHandler = async ({ error }) => {
  throw error(500, 'ERROR: Demonstration of an error response.');
};
