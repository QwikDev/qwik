import { expect, test } from 'vitest';
import { _jsxSorted } from '../shared/jsx/jsx-internal';
import { _walkJSX } from './ssr-render-jsx';
import type { SSRContainer } from './ssr-types';

test('discovers stylesheets before preloading application JavaScript', async () => {
  const order: string[] = [];
  const ssr = {
    isHtml: true,
    openElement(tag: string) {
      order.push(tag);
    },
    closeElement() {},
    textNode() {},
    emitQwikLoaderAtTopIfNeeded() {},
    emitPreloaderPre() {
      order.push('preload');
    },
    additionalHeadNodes: [
      _jsxSorted('link', null, { rel: 'stylesheet', href: '/style.css' }, null, 0, null),
    ],
    streamHandler: { waitForPendingFlush() {} },
    handleError(error: unknown) {
      throw error;
    },
  } as unknown as SSRContainer;
  const head = _jsxSorted(
    'head',
    null,
    null,
    _jsxSorted('title', null, null, 'shop', 0, null),
    0,
    null
  );
  await _walkJSX(ssr, head, { currentStyleScoped: null, parentComponentFrame: null });
  expect(order).toEqual(['head', 'title', 'link', 'preload']);
});
