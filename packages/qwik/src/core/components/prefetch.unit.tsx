import { describe, it } from 'vitest';
import { PrefetchServiceWorker } from './prefetch';
import { renderToString } from '../../server/render';

describe('PrefetchServiceWorker', () => {
  describe('render', () => {
    it('should render', async () => {
      await renderToString(<PrefetchServiceWorker />, { containerTagName: 'div' });
    });
  });
});
