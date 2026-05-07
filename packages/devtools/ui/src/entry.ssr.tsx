/**
 * WHAT IS THIS FILE?
 *
 * SSR entry point, in all cases the application is rendered outside the browser, this entry point
 * will be the common one.
 *
 * - Server (express, cloudflare...)
 * - Npm run start
 * - Npm run preview
 * - Npm run build
 */
import { manifest } from '@qwik-client-manifest';
import { renderToStream, type RenderToStreamOptions } from '@qwik.dev/core/server';
import Root from './root';

export default function (opts: RenderToStreamOptions) {
  return renderToStream(<Root />, {
    manifest,
    ...opts,
  });
}
