/*
 * WHAT IS THIS FILE?
 *
 * It's the entry point for Netlify Edge when building for production.
 *
 * Learn more about the Netlify integration here:
 * - https://qwik.dev/docs/deployments/netlify-edge/
 *
 */
import { createQwikRouter, type PlatformNetlify } from '@qwik.dev/router/middleware/netlify-edge';
import render from './entry.ssr';

declare global {
  type QwikRouterPlatform = PlatformNetlify;
}

export default createQwikRouter({
  render,
  // disable CSRF protection because we get called from everywhere
  checkOrigin: false,
});
