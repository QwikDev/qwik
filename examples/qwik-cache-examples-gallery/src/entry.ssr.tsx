import { createRenderer } from '@qwik.dev/router';
import Root from './root';

export default createRenderer((opts) => ({
  jsx: <Root />,
  options: {
    ...opts,
    containerAttributes: {
      lang: 'en-us',
      ...opts.containerAttributes,
    },
  },
}));
