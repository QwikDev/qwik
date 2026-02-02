import type { JSXOutput } from '@qwik.dev/core';
import { renderToStream, type Render, type RenderOptions } from '@qwik.dev/core/server';
import type { DocumentHeadValue, ServerData } from './types';

/** @public */
export type RendererOptions = Omit<RenderOptions, 'serverData'> & {
  serverData: ServerData;
};
/** @public */
export type RendererOutputOptions = Omit<RenderOptions, 'serverData'> & {
  serverData: ServerData & {
    documentHead?: DocumentHeadValue;
  } & Record<string, unknown>;
};

/**
 * Creates the `render()` function that is required by `createQwikRouter()`. It requires a function
 * that returns the `jsx` and `options` for the renderer.
 *
 * @example
 *
 * ```tsx
 * const renderer = createRenderer((opts) => {
 *   if (opts.requestHeaders['x-hello'] === 'world') {
 *     return { jsx: <Hello />, options: opts };
 *   }
 *   return { jsx: <Root />, options: {
 *     ...opts,
 *     serverData: {
 *       ...opts.serverData,
 *       documentHead: {
 *         meta: [
 *           { name: 'renderedAt', content: new Date().toISOString() },
 *         ],
 *       },
 *     },
 *   } };
 * });
 * ```
 *
 * @public
 */
export const createRenderer = (
  getOptions: (options: RendererOptions) => { jsx: JSXOutput; options: RendererOutputOptions }
) => {
  return ((opts: RendererOptions) => {
    const { jsx, options } = getOptions(opts);
    return renderToStream(jsx, options as any);
    // We force the type to be Render because that's what createQwikRouter accepts
  }) as unknown as Render;
};
