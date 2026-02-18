/**
 * @file This ties together the router config and render function in a single export for SSG
 *   rendering.
 */
import qwikRouterConfig from '@qwik-router-config';
import { requestHandler } from '@qwik.dev/router/middleware/request-handler';

// Import render from the user's entry.ssr
// @ts-expect-error This module is dynamically replaced during the build with the user's SSR entry module.
import render from '__RENDER_MODULE__';

// Export from here so there's only one Qwik import
export { _serialize } from '@qwik.dev/core/internal';
export { qwikRouterConfig };

/**
 * Renders a pathname and returns the result. This function is called by the SSG worker to render
 * each pathname.
 */
export const ssgRender = <T>(
  ctx: Parameters<typeof requestHandler<T>>[0],
  options: Omit<Parameters<typeof requestHandler<T>>[1], 'render' | 'qwikRouterConfig'>
) => {
  return requestHandler(ctx, {
    ...options,
    render,
    qwikRouterConfig,
  });
};

export type SsgRenderFn = typeof ssgRender;
