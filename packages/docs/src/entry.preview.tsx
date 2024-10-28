import qwikRouterConfig from '@qwik-router-config';
import { createQwikRouter } from '@qwik.dev/router/middleware/node';
import render from './entry.ssr';

/** The default export is the QwikRouter adapter used by Vite preview. */
export default createQwikRouter({ render, qwikRouterConfig });
