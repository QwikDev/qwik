/**
 * WHAT IS THIS FILE?
 *
 * SSR renderer function, used by Qwik Router.
 *
 * Note that this is the only place the Qwik renderer is called. On the client, containers resume
 * and do not call render.
 */
import { createRenderer } from '@qwik.dev/router';
import Root from './root';

export default createRenderer((opts) => {
  return {
    jsx: <Root />,
    options: {
      ...opts,
      // Use container attributes to set attributes on the html tag.
      containerAttributes: {
        lang: 'en-us',
        ...opts.containerAttributes,
      },
      serverData: {
        ...opts.serverData,
        // These are the default values for the document head and are overridden by the `head` exports
        // documentHead: {
        //   title: "My App",
        // },
      },
    },
  };
});
