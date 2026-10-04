import type { Container } from '../core/shared/types';
import { normalizeUrl, waitForDrain } from './util';
import { assert, describe, test } from 'vitest';

test('no url', () => {
  assert.equal(normalizeUrl(null).href, 'http://document.qwik.dev/');
  assert.equal(normalizeUrl(undefined).href, 'http://document.qwik.dev/');
  assert.equal(normalizeUrl('').href, 'http://document.qwik.dev/');
  assert.equal(normalizeUrl({} as any).href, 'http://document.qwik.dev/');
});

test('string, full url', () => {
  const url = normalizeUrl('https://my.qwik.dev/some-path?query=string#hash');
  assert.equal(url.pathname, '/some-path');
  assert.equal(url.hash, '#hash');
  assert.equal(url.searchParams.get('query'), 'string');
  assert.equal(url.origin, 'https://my.qwik.dev');
  assert.equal(url.href, 'https://my.qwik.dev/some-path?query=string#hash');
});

test('string, pathname', () => {
  const url = normalizeUrl('/some-path?query=string#hash');
  assert.equal(url.pathname, '/some-path');
  assert.equal(url.hash, '#hash');
  assert.equal(url.searchParams.get('query'), 'string');
  assert.equal(url.origin, 'http://document.qwik.dev');
  assert.equal(url.href, 'http://document.qwik.dev/some-path?query=string#hash');
});

describe('waitForDrain', () => {
  const createFakeContainer = () => ({ $renderPromise$: null }) as Container;

  const scheduleRenderLater = (container: Container, onRenderDone: () => void) => {
    setTimeout(() => {
      container.$renderPromise$ = new Promise<void>((resolve) =>
        setTimeout(() => {
          onRenderDone();
          resolve();
        }, 20)
      );
    }, 30);
  };

  test('with a timeout, waits for a render scheduled after the call', async () => {
    const container = createFakeContainer();
    let isRenderDone = false;
    scheduleRenderLater(container, () => (isRenderDone = true));

    await waitForDrain(container, 500);

    assert.isTrue(isRenderDone);
  });

  test('with a timeout, gives up when no render is scheduled', async () => {
    const start = Date.now();

    await waitForDrain(createFakeContainer(), 50);

    assert.isAtLeast(Date.now() - start, 45);
  });

  test('without a timeout, does not wait for a render to be scheduled', async () => {
    const container = createFakeContainer();
    let isRenderDone = false;
    scheduleRenderLater(container, () => (isRenderDone = true));

    await waitForDrain(container);

    assert.isFalse(isRenderDone);
  });
});
