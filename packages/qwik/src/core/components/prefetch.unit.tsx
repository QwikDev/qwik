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
    it('should render script with a scope', async () => {
      const output = await renderToString(
        <PrefetchServiceWorker base="/build/en/" scope="/en/" />,
        {
          containerTagName: 'div',
        }
      );
      // eslint-disable-next-line no-console
      console.log('>>>>', output.html);
      expect(output.html).to.includes('scope: "/en/"');
      expect(output.html).to.includes('"/build/en/qwik-prefetch-service-worker.js"');
    });
    it('should render script with a base', async () => {
      const output = await renderToString(<PrefetchServiceWorker base="/build/en/" />, {
        containerTagName: 'div',
      });
      // eslint-disable-next-line no-console
      console.log('>>>>', output.html);
      expect(output.html).to.includes('scope: "/"');
      expect(output.html).to.includes('"/build/en/qwik-prefetch-service-worker.js"');
    });
    it('should render script with a custom service-worker path', async () => {
      const output = await renderToString(
        <PrefetchServiceWorker path="patrickjs-service-worker.js" />,
        {
          containerTagName: 'div',
        }
      );
      // eslint-disable-next-line no-console
      console.log('>>>>', output.html);
      expect(output.html).to.includes('scope: "/"');
      expect(output.html).to.includes('"/patrickjs-service-worker.js"');
    });
    it('should render script with a custom service-worker path with different base', async () => {
      const output = await renderToString(
        <PrefetchServiceWorker path="patrickjs-service-worker.js" base="/build/" />,
        {
          containerTagName: 'div',
        }
      );
      // eslint-disable-next-line no-console
      console.log('>>>>', output.html);
      expect(output.html).to.includes('scope: "/"');
      expect(output.html).to.includes('"/build/patrickjs-service-worker.js"');
    });
    it('should render script with a custom path', async () => {
      const output = await renderToString(
        <PrefetchServiceWorker
          path="/build/patrickjs-service-worker.js"
          scope="/"
          base="/build/en/" // should be ignored
        />,
        {
          containerTagName: 'div',
        }
      );
      // eslint-disable-next-line no-console
      console.log('>>>>', output.html);
      expect(output.html).to.includes('scope: "/"');
      expect(output.html).to.includes('"/build/patrickjs-service-worker.js"');
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
