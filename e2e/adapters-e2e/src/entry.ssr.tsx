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
import { createRenderer } from '@qwik.dev/router';
import Root from './root';

export default createRenderer((opts) => ({
  jsx: <Root />,
  options: {
    ...opts,
    // Use container attributes to set attributes on the html tag.
    containerAttributes: {
      lang: 'en-us',
      ...opts.containerAttributes,
    },
  },
}));
