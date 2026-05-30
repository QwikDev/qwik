import { render } from '@qwik.dev/core';
import { Root } from './root';

render(document, <Root pathname={window.location.pathname} />, {
  base: '/e2e/build/',
  serverData: {
    url: window.location.href,
    ooosRequestId: '',
  },
});
