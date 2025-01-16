import { describe, expect, it } from 'vitest';
import { PrefetchServiceWorker, PrefetchGraph } from './prefetch';
import { renderToString } from '../../server/render';

const DEBUG = false;
function log(...args: any[]) {
  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.log(...args);
  }
}

describe('PrefetchServiceWorker', () => {
  describe('render', () => {
    it('should render', async () => {
      const output = await renderToString(<PrefetchServiceWorker />, { containerTagName: 'div' });
      log('>>>>', output.html);
    });

    it('should render with a nonce', async () => {
      const output = await renderToString(<PrefetchServiceWorker nonce="1234" />, {
        containerTagName: 'div',
      });
      expect(output.html).to.contain('<script nonce="1234" q:key="prefetch-service-worker">');
    });
    it('should render script with a scope', async () => {
      // if the qwik app was isolated to /en/ folder
      // scope will only run in /en/ pathname in the url
      const output = await renderToString(
        <PrefetchServiceWorker base="/en/build/" scope="/en/" />,
        {
          containerTagName: 'div',
        }
      );
      log('>>>>', output.html);
      expect(output.html).to.includes('scope: "/en/"');
      expect(output.html).to.includes('"/en/build/"');
      expect(output.html).to.includes('"/qwik-prefetch-service-worker.js"');
    });
    it('should render script with a base', async () => {
      const output = await renderToString(<PrefetchServiceWorker base="/build/en/" />, {
        containerTagName: 'div',
      });
      log('>>>>', output.html);
      expect(output.html).to.includes('scope: "/"');
      expect(output.html).to.includes('"/build/en/"');
      expect(output.html).to.includes('"/qwik-prefetch-service-worker.js"');
    });
    it('should render script with without base and only q:base', async () => {
      const output = await renderToString(<PrefetchServiceWorker />, {
        base: '/build/en/',
        containerTagName: 'div',
      });
      log('>>>>', output.html);
      expect(output.html).to.includes('scope: "/"');
      expect(output.html).to.includes('/qwik-prefetch-service-worker.js');
    });
    it('should render script with a custom service-worker path', async () => {
      const output = await renderToString(
        <PrefetchServiceWorker path="patrickjs-service-worker.js" />,
        {
          containerTagName: 'div',
        }
      );
      log('>>>>', output.html);
      expect(output.html).to.includes('scope: "/"');
      expect(output.html).to.includes('/patrickjs-service-worker.js');
    });
    it('should render script with a custom service-worker path with different base', async () => {
      const output = await renderToString(
        <PrefetchServiceWorker path="patrickjs-service-worker.js" base="/build2/" />,
        {
          containerTagName: 'div',
        }
      );
      log('>>>>', output.html);
      expect(output.html).to.includes('scope: "/"');
      expect(output.html).to.includes('"/build2/"');
      expect(output.html).to.includes('"/patrickjs-service-worker.js"');
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
      log('>>>>', output.html);
      expect(output.html).to.includes('scope: "/"');
      expect(output.html).to.includes('"/build/en/"');
      expect(output.html).to.includes('"/build/patrickjs-service-worker.js"');
    });
  });
});

describe('PrefetchGraph', () => {
  describe('render', () => {
    it('should render', async () => {
      const output = await renderToString(<PrefetchGraph />, { containerTagName: 'div' });
      log('>>>>', output.html);
    });

    it('should render with a nonce', async () => {
      const output = await renderToString(<PrefetchGraph nonce="1234" />, {
        containerTagName: 'div',
      });
      expect(output.html).to.contain('<script nonce="1234" q:key="prefetch-graph">');
    });
  });
});
