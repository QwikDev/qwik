import { describe, it } from 'vitest';
import { PrefetchServiceWorker } from './prefetch';
import { renderToString } from '../../server/render';

describe('PrefetchServiceWorker', () => {
  describe('render', () => {
    it('should render', async () => {
      // eslint-disable-next-line no-console
      await renderToString(<PrefetchServiceWorker />, { containerTagName: 'div' });
      // eslint-disable-next-line no-console
    });
  });
});
