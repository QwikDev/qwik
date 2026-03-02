import { type RequestHandler } from '@qwik.dev/router';

export const onRequest: RequestHandler = async ({ next }) => {
  try {
    await next();
  } catch (error: any) {
    if (error?.message === 'ERROR: Demonstration of an error response.') {
      throw error;
    } else if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof error.message === 'string'
    ) {
      // ignore this error
      return;
    }
    throw error;
  }
};
