import { type RequestHandler } from '@builder.io/qwik-city';

export const onRequest: RequestHandler = async ({ next }) => {
  try {
    await next();
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof error.message === 'string' &&
      error.message == 'ERROR: Demonstration of an error response.'
    ) {
      // ignore this error
      return;
    }
    throw error;
  }
};
