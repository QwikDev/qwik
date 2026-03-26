import type { RequestHandler } from '@qwik.dev/router';

/**
 * API endpoint that checks whether a module WITHOUT server$ was eagerly imported. It should NOT
 * have been — only server$ modules should be eagerly imported.
 */
export const onGet: RequestHandler = async (ev) => {
  const loaded = (globalThis as any).__noServerFnModuleLoaded === true;
  ev.json(200, { loaded });
};
