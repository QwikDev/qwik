import { render } from '@qwik.dev/core';
import './global.css';

const pathname = window.location.pathname;
const clientRoots = {
  '/e2e/attributes': () =>
    import('./components/attributes/attributes').then(({ Attributes }) => Attributes),
  '/e2e/computed': () =>
    import('./components/computed/computed').then(({ ComputedRoot }) => ComputedRoot),
  '/e2e/context': () =>
    import('./components/context/context').then(({ ContextRoot }) => ContextRoot),
  '/e2e/events': () => import('./components/events/events').then(({ Events }) => Events),
  '/e2e/render': () => import('./components/render/render').then(({ Render }) => Render),
  '/e2e/signals': () => import('./components/signals/signals').then(({ Signals }) => Signals),
  '/e2e/suspense': () =>
    import('./components/suspense/suspense').then(({ SuspenseRoot }) => SuspenseRoot),
};
const loadRoot =
  clientRoots[pathname as keyof typeof clientRoots] ??
  (() => import('./root').then(({ Root }) => Root));

loadRoot().then((Root) =>
  render(document, Root, {
    props: { pathname },
    serverData: {
      url: window.location.href,
      ooosRequestId: '',
    },
  })
);
