import { u, e as t, D as r, R as a, f as s } from './build/qwik-router.js';
import { c as o, i, d as l, e as c, F as d } from './build/core.js';
const m = () => {
    u();
    const n = t();
    return l(
      d,
      null,
      null,
      [
        l(
          'head',
          null,
          null,
          [
            l('meta', null, { charset: 'utf-8' }, null, 3, null),
            l(
              'meta',
              null,
              { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
              null,
              3,
              null
            ),
            l(
              'link',
              null,
              { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
              null,
              3,
              null
            ),
            l(r, null, null, null, 3, 'X9_0'),
            l(
              'link',
              null,
              { rel: 'canonical', href: c((e) => e.url.href, [n], 'p0.url.href') },
              null,
              3,
              null
            ),
          ],
          1,
          null
        ),
        l('body', null, null, l(a, null, null, null, 3, 'X9_1'), 1, null),
      ],
      1,
      'X9_2'
    );
  },
  f = o(i(m, 's_gFGlZ3bW0jM')),
  _ = s((n) => ({
    jsx: l(f, null, null, null, 3, 'Ti_0'),
    options: {
      ...n,
      containerAttributes: { lang: 'en-us', ...n.containerAttributes },
      serverData: { ...n.serverData },
    },
  }));
export { _ as default };
