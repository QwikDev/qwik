import qwikRouterConfig from '@qwik-router-config';
import { createQwikRouter } from '@qwik.dev/router/middleware/cloudflare-pages';
import render from './entry.ssr';

const fetch = createQwikRouter({ render, qwikRouterConfig });

export { fetch };
