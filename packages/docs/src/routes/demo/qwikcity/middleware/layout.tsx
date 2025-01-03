import { type RequestHandler } from '@builder.io/qwik-city';

export const onRequest: RequestHandler = async ({ next }) => {
  try {
    await next();
  } catch (error: any) {
    if (error?.message === 'ERROR: Demonstration of an error response.') {
      return await next();
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
