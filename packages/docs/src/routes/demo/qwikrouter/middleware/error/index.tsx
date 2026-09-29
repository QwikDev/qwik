import { type RequestHandler } from '@qwik.dev/router';

export const onGet: RequestHandler = async ({ httpError }) => {
  throw httpError(500, 'ERROR: Demonstration of an error response.');
};
