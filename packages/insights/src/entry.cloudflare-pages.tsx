import {
  createQwikRouter,
  type PlatformCloudflarePages,
} from '@qwik.dev/router/middleware/cloudflare-pages';
import render from './entry.ssr';

declare global {
  interface QwikRouterPlatform extends PlatformCloudflarePages {}
}

// Telemetry ingestion accepts requests from applications on other origins.
const fetch = createQwikRouter({ render, checkOrigin: false });

export { fetch };
