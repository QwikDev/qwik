import type { RequestHandler } from '@builder.io/qwik-city';

/**
 * Combines multiple request handlers into a single request handler.
 *
 * The handlers will be called in order:
 *
 * 1. Handler1 before next()
 * 2. Handler2 before next()
 * 3. Handler3 before next()
 * 4. Next()
 * 5. Handler3 after next()
 * 6. Handler2 after next()
 * 7. Handler1 after next()
 *
 * @public
 */

export const combineRequestHandlers =
  (...handlers: RequestHandler[]): RequestHandler =>
  async (originalContext) => {
    let lastNext = originalContext.next;
    for (let i = handlers.length - 1; i >= 0; i--) {
      const currentHandler = handlers[i];
      const nextInChain = lastNext;
      lastNext = async () => {
        await currentHandler({ ...originalContext, next: nextInChain });
      };
    }

    await lastNext();
  };
