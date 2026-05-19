import { createRenderer } from '@qwik.dev/router';
import Root from './root';

// Export here so we get the built version
export { _dumpState } from '@qwik.dev/core/internal';

export default createRenderer((opts) => ({
  jsx: <Root />,
  options: {
    ...opts,
    containerAttributes: {
      lang: 'en',
      ...opts.containerAttributes,
    },
  },
}));
