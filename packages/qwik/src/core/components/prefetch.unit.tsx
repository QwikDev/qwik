import { describe, it } from 'vitest';
import { PrefetchServiceWorker } from './prefetch';
import { renderToString } from '../../server/render';

describe('PrefetchServiceWorker', () => {
  describe('render', () => {
    it('should render', async () => {
      const output = await renderToString(<PrefetchServiceWorker />, { containerTagName: 'div' });
      console.log('>>>>', output.html);
    });
  });
});
