import { describe, it, expect } from 'vitest';
import { renderToString } from './render';

describe('render', () => {
  describe('qwikPrefetchServiceWorker', () => {
    it.skip('should render', async () => {
      const output = await renderToString(
        <>
          <head>HEAD</head>
          <body>BODY</body>
        </>,
        {
          qwikPrefetchServiceWorker: {
            include: true,
            position: 'top',
          },
        }
      );
      expect(output.html).toContain('HEAD');
      expect(output.html).toContain('BODY');
    });
  });
});
