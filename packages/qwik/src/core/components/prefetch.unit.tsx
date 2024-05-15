import { describe, expect, it } from 'vitest';
import { PrefetchServiceWorker, PrefetchGraph } from './prefetch';
import { renderToString } from '../../server/render';

describe('PrefetchServiceWorker', () => {
  describe('render', () => {
    it('should render', async () => {
      // eslint-disable-next-line no-console
      const output = await renderToString(<PrefetchServiceWorker />, { containerTagName: 'div' });
      // eslint-disable-next-line no-console
      console.log('>>>>', output.html);
    });

    it('should render with a nonce', async () => {
      const output = await renderToString(<PrefetchServiceWorker nonce="1234" />, {
        containerTagName: 'div',
      });
      expect(output.html).to.contain('<script nonce="1234" q:key="prefetch-service-worker">');
    });
  });
});

describe('PrefetchGraph', () => {
  describe('render', () => {
    it('should render', async () => {
      // eslint-disable-next-line no-console
      const output = await renderToString(<PrefetchGraph />, { containerTagName: 'div' });
      // eslint-disable-next-line no-console
      console.log('>>>>', output.html);
    });

    it('should render with a nonce', async () => {
      const output = await renderToString(<PrefetchGraph nonce="1234" />, {
        containerTagName: 'div',
      });
      expect(output.html).to.contain('<script nonce="1234" q:key="prefetch-graph">');
    });
  });
});
