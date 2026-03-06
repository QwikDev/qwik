import { renderToString as I } from 'react-dom/server';
import {
  createElement as h,
  createContext as P,
  Component as k,
  createRef as K,
  useState as U,
  useEffect as $,
} from 'react';
import {
  c as O,
  i as c,
  u as j,
  R as F,
  q as S,
  G as H,
  K as C,
  d as s,
  T as L,
  j as R,
  N as Y,
  S as v,
  F as w,
  U as m,
  V as b,
  W as f,
  X as q,
  Y as V,
} from './core.js';
import { jsxs as x, jsx as X } from 'react/jsx-runtime';
var N = Object.defineProperty,
  A = (n, t, e) =>
    t in n ? N(n, t, { enumerable: !0, configurable: !0, writable: !0, value: e }) : (n[t] = e),
  E = (n, t, e) => A(n, typeof t != 'symbol' ? t + '' : t, e);
const p = P({ scopeId: '' });
function J(n, t, e, l) {
  return h(p.Provider, {
    value: { el: n, scopeId: t, attachedEl: void 0 },
    children: h(e, { ...l, children: h(Q, null) }),
  });
}
class Q extends k {
  constructor() {
    (super(...arguments), E(this, 'slotC', K()));
  }
  shouldComponentUpdate() {
    return !1;
  }
  componentDidMount() {
    const t = this.slotC.current;
    if (t) {
      const { attachedEl: e, el: l } = this.context;
      if (l) {
        if (!e) t.appendChild(l);
        else if (e !== t) throw new Error('already attached');
      }
    }
  }
  render() {
    return h('q-slotc', {
      class: this.context.scopeId,
      suppressHydrationWarning: !0,
      dangerouslySetInnerHTML: { __html: '<!--SLOT-->' },
      ref: this.slotC,
    });
  }
}
E(Q, 'contextType', p);
const M = (n) => {
    const t = {};
    return (
      Object.keys(n).forEach((e) => {
        if (!e.startsWith('client:') && !e.startsWith('qwik:') && !e.startsWith(y)) {
          const l = e.endsWith('$') ? e.slice(0, -1) : e;
          t[l] = n[e];
        }
      }),
      t
    );
  },
  T = (n) => {
    const t = {};
    return (
      Object.keys(n).forEach((e) => {
        e.startsWith(y) && (t[e.slice(y.length)] = n[e]);
      }),
      t
    );
  },
  Z = () => {
    const [n] = j();
    return (n.value = !0);
  },
  B = (n, t = {}) => {
    const e = S(!1),
      l = c(Z, 's_OQ5ZKd8q0IE', [e]),
      o = !!(n['client:only'] || n['qwik:only'] || t?.clientOnly),
      a = n['client:visible'] || n['qwik:visible'] || t?.eagerness === 'visible',
      d = n['client:idle'] || n['qwik:idle'] || t?.eagerness === 'idle',
      r = n['client:load'] || n['qwik:load'] || o || t?.eagerness === 'load',
      u = n['client:hover'] || n['qwik:hover'] || t?.eagerness === 'hover',
      i = n['client:event'] || n['qwik:event'];
    return (
      a && m('qvisible', l),
      d && b('qidle', l),
      r && b('qinit', l),
      u && m('mouseover', l),
      i && m(i, l),
      t?.event && m(t?.event, l),
      [e, o, l]
    );
  },
  y = 'host:';
async function D(n, t, e, l, o, a, d) {
  {
    const r = await t.resolve(),
      u = M(l);
    Object.assign(d, u);
    const i = I(J(void 0, e, r, u)),
      g = i.indexOf('<!--SLOT-->');
    if (g > 0) {
      const _ = i.slice(0, g),
        W = i.slice(g + 11);
      return R(
        n,
        { ref: o, ...T(l) },
        null,
        s(
          V,
          null,
          null,
          async function* () {
            (yield s(f, null, { data: 'q:ignore' }, null, 3, 'jg_0'),
              yield s(q, { data: _ }, null, null, 3, 'jg_1'),
              yield s(f, null, { data: 'q:container-island' }, null, 3, 'jg_2'),
              yield s('q-slot', { ref: a }, null, s(v, null, null, null, 3, 'jg_3'), 1, 'jg_4'),
              yield s(f, null, { data: '/q:container-island' }, null, 3, 'jg_5'),
              yield s(q, { data: W }, null, null, 3, 'jg_6'),
              yield s(f, null, { data: '/q:ignore' }, null, 3, 'jg_7'));
          },
          1,
          'jg_8'
        ),
        0,
        'jg_9'
      );
    }
    return s(
      w,
      null,
      null,
      [
        s(
          n,
          { ref: o },
          null,
          [
            s(f, null, { data: 'q:container=html' }, null, 3, 'jg_10'),
            s(q, { data: i }, null, null, 3, 'jg_11'),
            s(f, null, { data: '/q:container' }, null, 3, 'jg_12'),
          ],
          1,
          'jg_13'
        ),
        s('q-slot', { ref: a }, null, s(v, null, null, null, 3, 'jg_14'), 1, null),
      ],
      1,
      'jg_15'
    );
  }
}
const z = 'q-slot{display:none} q-slotc,q-slotc>q-slot{display:contents}',
  G = async ({ track: n }) => {
    const [t, e, l, o, a, d, r, u, i] = j();
    (n(() => ({ ...a })), n(r));
  },
  nn = ({ track: n, cleanup: t }) => {
    const [e, l] = j();
    n(l);
  },
  tn = (n) => {
    const [t, e] = j(),
      l = F(c(z, 's_WYJa2k5r6p8')),
      o = S(),
      a = S(),
      d = S(),
      [r, u] = B(n, t),
      i = H({}),
      g = t?.tagName ?? 'qwik-react';
    if (
      (C(c(G, 's_RC85rQf70Eo', [o, i, d, u, n, e, r, a, l])), C(c(nn, 's_Yc0eagCtdYU', [d, r])), !u)
    ) {
      const _ = D(g, e, l.scopeId, n, o, a, i);
      return s(L, null, null, _, 1, 2);
    }
    return s(
      w,
      null,
      null,
      [
        R(
          g,
          { ...T(n) },
          {
            ref: (_) => {
              o.value = _;
            },
          },
          Y,
          0,
          'jg_16'
        ),
        s('q-slot', { ref: a }, null, s(v, null, null, null, 3, 'jg_17'), 1, null),
      ],
      1,
      'jg_18'
    );
  };
function en(n, t) {
  return O(c(tn, 's_VoAn8xtJ0f8', [t, n]));
}
function ln({ onMount: n, onUnmount: t }) {
  const [e, l] = U(0);
  return (
    $(() => (n(), () => t()), []),
    x('div', {
      'data-testid': 'test-component',
      children: [
        x('span', { 'data-testid': 'count', children: ['count ', e] }),
        X('button', { 'data-testid': 'inc-btn', onClick: () => l((o) => o + 1), children: 'inc' }),
      ],
    })
  );
}
const sn = en(c(ln, 's_XN4g00S0H0o'), { eagerness: 'hover' }),
  on = () => console.log('@@@@ Mount'),
  an = () => console.log('@@@@ Unmount'),
  cn = () =>
    s(
      sn,
      null,
      { onMount$: c(on, 's_BlOTm5FbA84'), onUnmount$: c(an, 's_HR37K1ubX2k') },
      null,
      3,
      '0X_0'
    ),
  fn = O(c(cn, 's_LV70raIZnaU')),
  _n = {
    title: 'Welcome to React Qwik',
    meta: [{ name: 'description', content: 'React Qwik site description' }],
  };
export { fn as default, _n as head };
