import type { RequestHandler } from '@qwik.dev/router';

/**
 * API endpoint that returns whether server$ modules were eagerly imported. This endpoint does NOT
 * import the server$ module itself — it only checks the global that the module sets as a side
 * effect.
 */
export const onGet: RequestHandler = async (ev) => {
  const registered = (globalThis as any).__serverFnEagerlyRegistered === true;
  ev.json(200, { registered });
};
