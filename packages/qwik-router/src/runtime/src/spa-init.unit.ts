import { assert, test } from 'vitest';
import {
  createCurrentPathTracker,
  dispatchRouterPopstate,
  Q_ROUTER_POPSTATE_EVENT,
} from './spa-init';

test('createCurrentPathTracker treats back then forward as two path changes', () => {
  const hasPathChanged = createCurrentPathTracker('/scroll-restoration/page-short');

  assert.equal(hasPathChanged('/scroll-restoration/page-short'), false);
  assert.equal(hasPathChanged('/scroll-restoration/page-long'), true);
  assert.equal(hasPathChanged('/scroll-restoration/page-short'), true);
});

test('createCurrentPathTracker ignores repeated visits to the same path', () => {
  const hasPathChanged = createCurrentPathTracker('/scroll-restoration/page-short');

  assert.equal(hasPathChanged('/scroll-restoration/page-long'), true);
  assert.equal(hasPathChanged('/scroll-restoration/page-long'), false);
});

test('dispatchRouterPopstate sends the current href through the recovery bridge', () => {
  let dispatchedEvent: Event | undefined;
  const document = {
    dispatchEvent: (event: Event) => {
      dispatchedEvent = event;
      return true;
    },
  } as Document;

  dispatchRouterPopstate(document, 'http://localhost/scroll-restoration/page-short/');

  assert.equal(dispatchedEvent?.type, Q_ROUTER_POPSTATE_EVENT);
  assert.deepEqual((dispatchedEvent as CustomEvent).detail, {
    href: 'http://localhost/scroll-restoration/page-short/',
  });
});
