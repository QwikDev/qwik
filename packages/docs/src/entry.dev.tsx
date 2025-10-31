import { render, type RenderOptions } from '@qwik.dev/core';
import Root from './root';

/**
 * Development entry point using only client-side modules:
 *
 * - Do not use this mode in production!
 * - No SSR
 * - No portion of the application is pre-rendered on the server.
 * - All the application is running eagerly in the browser.
 * - More code is transferred to the browser than in SSR mode.
 * - Optimizer/Serialization/Deserialization code is not exercised!
 */
export default function (opts: RenderOptions) {
  return render(document, <Root />, opts);
}
