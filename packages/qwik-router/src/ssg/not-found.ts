/**
 * Previously generated a static 404.html page during SSG. This is now handled via the `/4` property
 * in the route trie (see RouteData). When no route matches at runtime, the nearest ancestor's `/4`
 * module loader is used to render a not-found response.
 *
 * This module is kept as a no-op stub for backward compatibility.
 */
import type { SsgOptions, System } from './types';

export async function generateNotFoundPages(
  _sys: System,
  _opts: SsgOptions,
  _routes: unknown
): Promise<void> {
  // No-op: 404 handling is now done via the /4 node in the RouteData trie.
}
