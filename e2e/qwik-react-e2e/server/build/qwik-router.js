import {
  b as Tt,
  f as jt,
  i as C,
  u as J,
  s as Ye,
  g as Lt,
  h as $e,
  j as W,
  d as q,
  k as xe,
  l as Ft,
  E as Pe,
  m as Mt,
  n as Ie,
  o as Qt,
  c as Ae,
  p as ee,
  q as B,
  r as ne,
  t as Ke,
  w as Ht,
  S as Bt,
  x as ue,
  y as de,
  z as S,
  A as Ze,
  B as Vt,
  C as Je,
  D as G,
  G as re,
  H as Ut,
  I as zt,
  a as Wt,
  J as A,
  K as Gt,
  L as De,
  F as et,
  M as Xt,
  N as Yt,
  O as Kt,
  P as se,
  Q as Zt,
} from './core.js';
import { i as he } from './build.js';
var V = ((e) => (
    (e[(e.RouteName = 0)] = 'RouteName'),
    (e[(e.ModuleLoaders = 1)] = 'ModuleLoaders'),
    (e[(e.OriginalPathname = 2)] = 'OriginalPathname'),
    (e[(e.RouteBundleNames = 3)] = 'RouteBundleNames'),
    e
  ))(V || {}),
  U = ((e) => ((e[(e.Pathname = 0)] = 'Pathname'), (e[(e.MenuLoader = 1)] = 'MenuLoader'), e))(
    U || {}
  ),
  Jt = ((e) => (
    (e[(e.RouteName = 0)] = 'RouteName'),
    (e[(e.Params = 1)] = 'Params'),
    (e[(e.Mods = 2)] = 'Mods'),
    (e[(e.Menu = 3)] = 'Menu'),
    (e[(e.RouteBundleNames = 4)] = 'RouteBundleNames'),
    e
  ))(Jt || {});
const Oe = new WeakMap(),
  j = new Map(),
  en = 'qaction',
  tn = 'qloaders',
  Es = 'qfunc',
  Cs = 'qdata',
  As = 'q:route',
  nn = 'never',
  rn = 3,
  tt = async (e, t, n, r = 0) => {
    const s = e.pathname,
      i = e.search,
      o = an(s, i, { actionId: n?.action?.id, loaderIds: n?.loaderIds });
    let a;
    (n?.action || (a = j.get(o)), n?.preloadRouteBundles !== !1 && Se(s, 0.8));
    let c;
    if (!a) {
      const l = sn(n?.action, n?.clearCache);
      (n?.action && (n.action.data = void 0),
        (a = fetch(o, l).then((u) => {
          if (u.status === 404 && n?.loaderIds && r < rn)
            return ((n.loaderIds = void 0), tt(e, t, n, r + 1));
          if (u.redirected) {
            const d = new URL(u.url);
            if (!d.pathname.endsWith('/q-data.json') || d.origin !== location.origin) {
              n?.isPrefetch || (location.href = d.href);
              return;
            }
          }
          if ((u.headers.get('content-type') || '').includes('json'))
            return u.text().then((d) => {
              const [h] = Tt(d, t);
              if (!h) {
                location.href = e.href;
                return;
              }
              if ((n?.clearCache && j.delete(o), h.redirect)) location.href = h.redirect;
              else if (n?.action) {
                const { action: m } = n,
                  p = h.loaders[m.id];
                c = () => {
                  m.resolve({ status: u.status, result: p });
                };
              }
              return h;
            });
          n?.isPrefetch !== !0 && (location.href = e.href);
        })),
        n?.action || j.set(o, a));
    }
    return a.then((l) => (l || j.delete(o), c && c(), l));
  },
  sn = (e, t) => {
    const n = e?.data;
    return n
      ? n instanceof FormData
        ? { method: 'POST', body: n }
        : {
            method: 'POST',
            body: JSON.stringify(n),
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
          }
      : t
        ? { cache: 'no-cache', headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } }
        : void 0;
  },
  Te = (e) => e.pathname + e.search + e.hash,
  x = (e, t) => new URL(e, t.href),
  fe = (e, t) => e.origin === t.origin,
  je = (e) => (e.endsWith('/') ? e : e + '/'),
  nt = ({ pathname: e }, { pathname: t }) => {
    const n = Math.abs(e.length - t.length);
    return n === 0 ? e === t : n === 1 && je(e) === je(t);
  },
  on = (e, t) => e.search === t.search,
  X = (e, t) => on(e, t) && nt(e, t),
  an = (e, t, n) => {
    let r = t ?? '';
    if (
      (n?.actionId && (r += (r ? '&' : '?') + en + '=' + encodeURIComponent(n.actionId)),
      n?.loaderIds)
    )
      for (const s of n.loaderIds) r += (r ? '&' : '?') + tn + '=' + encodeURIComponent(s);
    return e + (e.endsWith('/') ? '' : '/') + 'q-data.json' + r;
  },
  ln = (e, t) => {
    const n = e.href;
    if (typeof n == 'string' && typeof e.target != 'string' && !e.reload)
      try {
        const r = x(n.trim(), t.url),
          s = x('', t.url);
        if (fe(r, s)) return Te(r);
      } catch (r) {
        console.error(r);
      }
    else if (e.reload) return Te(x('', t.url));
    return null;
  },
  cn = (e, t) => {
    if (e) {
      const n = x(e, t.url),
        r = x('', t.url);
      return !nt(n, r);
    }
    return !1;
  },
  un = (e) => e && typeof e.then == 'function',
  dn = async () => {
    const [e, t, n] = J();
    return t[e];
  },
  hn = (e, t, n, r, s) =>
    jt(C(dn, 's_9VejONLZLkg', [t, e, n]), { container: s, serializationStrategy: r }),
  Se = (e, t = 0.8) => {};
function fn(e, t) {
  const n = Me(e),
    r = Le(e),
    s = Me(t),
    i = Le(t);
  return rt(e, n, r, t, s, i);
}
function rt(e, t, n, r, s, i) {
  if (r.startsWith('/build/')) return null;
  let o = null;
  for (; t < n; ) {
    const a = e.charCodeAt(t++),
      c = r.charCodeAt(s++);
    if (a === 91) {
      const l = st(e, t),
        u = t + (l ? 3 : 0),
        d = ie(e, u, n, 93),
        h = e.substring(u, d),
        m = ie(e, d + 1, n, 47),
        p = e.substring(d + 1, m);
      t = d + 1;
      const _ = s - 1;
      if (l) {
        const v = pn(h, p, r, _, i, e, t + p.length + 1, n);
        if (v) return Object.assign(o || (o = {}), v);
      }
      const b = ie(r, _, i, 47, p);
      if (b == -1) return null;
      const E = r.substring(_, b);
      if (!l && !p && !E) return null;
      ((s = b), ((o || (o = {}))[h] = decodeURIComponent(E)));
    } else if (a !== c && !(isNaN(c) && mn(e, t))) return null;
  }
  return Fe(e, t) && Fe(r, s) ? o || {} : null;
}
function mn(e, t) {
  return e.charCodeAt(t) === 91 && st(e, t + 1);
}
function Le(e) {
  const t = e.length;
  return t > 1 && e.charCodeAt(t - 1) === 47 ? t - 1 : t;
}
function Fe(e, t) {
  const n = e.length;
  return t >= n || (t == n - 1 && e.charCodeAt(t) === 47);
}
function Me(e) {
  return e.charCodeAt(0) === 47 ? 1 : 0;
}
function st(e, t) {
  return e.charCodeAt(t) === 46 && e.charCodeAt(t + 1) === 46 && e.charCodeAt(t + 2) === 46;
}
function ie(e, t, n, r, s = '') {
  for (; t < n && e.charCodeAt(t) !== r; ) t++;
  const i = s.length;
  for (let o = 0; o < i; o++) if (e.charCodeAt(t - i + o) !== s.charCodeAt(o)) return -1;
  return t - i;
}
function pn(e, t, n, r, s, i, o, a) {
  n.charCodeAt(r) === 47 && r++;
  let c = s;
  const l = t + '/';
  for (; c >= r; ) {
    const u = rt(i, o, a, n, c, s);
    if (u) {
      let h = n.substring(r, Math.min(c, s));
      return (
        h.endsWith(l) && (h = h.substring(0, h.length - l.length)),
        (u[e] = decodeURIComponent(h)),
        u
      );
    }
    const d = _n(n, r, l, c, r - 1) + l.length;
    if (c === d) break;
    c = d;
  }
  return null;
}
function _n(e, t, n, r, s) {
  let i = e.lastIndexOf(n, r);
  return (i == r - n.length && (i = e.lastIndexOf(n, r - n.length - 1)), i > t ? i : s);
}
const it = (e) =>
    e == null
      ? e
      : (Object.getOwnPropertyNames(e).forEach((t) => {
          const n = e[t];
          n && typeof n == 'object' && !Object.isFrozen(n) && it(n);
        }),
        Object.freeze(e)),
  Ss = async (e, t, n, r, s) => {
    if (!Array.isArray(e)) return null;
    for (const i of e) {
      const o = i[V.RouteName],
        a = fn(o, r);
      if (!a) continue;
      const c = i[V.ModuleLoaders],
        l = i[V.RouteBundleNames],
        u = new Array(c.length),
        d = [];
      c.forEach((m, p) => {
        Qe(m, d, (_) => (u[p] = _), n);
      });
      let h;
      if (!s) {
        const m = vn(t, r);
        Qe(m, d, (p) => (h = p?.default), n);
      }
      return (d.length > 0 && (await Promise.all(d)), [o, a, u, it(h), l]);
    }
    return null;
  },
  Qe = (e, t, n, r) => {
    if (typeof e == 'function') {
      const s = Oe.get(e);
      if (s) n(s);
      else {
        const i = e();
        typeof i.then == 'function'
          ? t.push(
              i.then((o) => {
                (r !== !1 && Oe.set(e, o), n(o));
              })
            )
          : i && n(i);
      }
    }
  },
  vn = (e, t) => {
    if (e) {
      t = t.endsWith('/') ? t : t + '/';
      const n = e.find((r) => r[U.Pathname] === t || t.startsWith(r[U.Pathname]));
      if (n) return n[U.MenuLoader];
    }
  },
  He = {
    manifestHash: 'fhko3i',
    core: 'core.js',
    preloader: 'preloader.js',
    qwikLoader: 'qwikloader.js',
    bundleGraphAsset: 'assets/hntX-3So-bundle-graph.json',
    injections: [],
    mapping: {
      s_GXN8GJnlhnY: 'index.qwik.mjs_useQwikRouter_useStyles_7vVCXsPiLGY.js',
      s_RC85rQf70Eo: 'index.qwik.mjs_qwikifyQrl_component_useTask_RC85rQf70Eo.js',
      s_Yc0eagCtdYU: 'index.qwik.mjs_qwikifyQrl_component_useTask_RC85rQf70Eo.js',
      s_SZCM0RmqYp4: 'index.qwik.mjs_usePreventNavigateQrl_useVisibleTask_SZCM0RmqYp4.js',
      s_s0AOvxtg8Ro: 'index.qwik.mjs_Link_component_useVisibleTask_s0AOvxtg8Ro.js',
      s_LV70raIZnaU: 'index.tsx_react_component_LV70raIZnaU.js',
      s_R97DZWsnvoc: 'index.qwik.mjs_Link_component_useVisibleTask_s0AOvxtg8Ro.js',
      s_TR6wI4zLw88: 'index.qwik.mjs_ErrorBoundary_component_useOnWindow_m5Sk2IlEID0.js',
      s_VTkYfsxVXvA: 'index.qwik.mjs_GetForm_component_form_onSubmit_1_064bkz4ABxQ.js',
      s_VoAn8xtJ0f8: 'index.qwik.mjs_qwikifyQrl_component_useTask_RC85rQf70Eo.js',
      s_ZqzYySEulAk: 'index.qwik.mjs_RouterOutlet_component_ZqzYySEulAk.js',
      s_gFGlZ3bW0jM: 'root.tsx_root_component_gFGlZ3bW0jM.js',
      s_gjfdAfVfon8: 'index.tsx_routes_component_gjfdAfVfon8.js',
      s_i4fGZrVJtMY: 'layout.tsx_layout_component_i4fGZrVJtMY.js',
      s_l3r5FZs1iZs: 'index.qwik.mjs_QwikRouterMockProvider_component_l3r5FZs1iZs.js',
      s_liu6N9qZ71A: 'index.qwik.mjs_QwikRouterProvider_component_liu6N9qZ71A.js',
      s_wN4EXdu8SGc: 'index.qwik.mjs_DocumentHeadTags_component_wN4EXdu8SGc.js',
      s_7vVCXsPiLGY: 'index.qwik.mjs_useQwikRouter_useStyles_7vVCXsPiLGY.js',
      s_WYJa2k5r6p8: 'index.qwik.mjs_qwikifyQrl_component_useTask_RC85rQf70Eo.js',
      s_0NcoS0SO5YI: 'index.qwik.mjs_useQwikMockRouter_goto_0NcoS0SO5YI.js',
      s_9OpHM16tjMw: 'index.qwik.mjs_serverQrl_9OpHM16tjMw.js',
      s_9VejONLZLkg: 'routing.qwik.mjs_createLoaderSignal_createAsyncComputed_9VejONLZLkg.js',
      s_BeAwOn57TTk: 'index.qwik.mjs_Form_form_onSubmit_BeAwOn57TTk.js',
      s_GJbDACO1M4Q: 'index.qwik.mjs_useQwikRouter_useStyles_7vVCXsPiLGY.js',
      s_JxM9f0jYvNc: 'index.qwik.mjs_spaInit_event_JxM9f0jYvNc.js',
      s_OQ5ZKd8q0IE: 'index.qwik.mjs_useWakeupSignal_activate_OQ5ZKd8q0IE.js',
      s_XN4g00S0H0o: 'index.tsx_QCounter_qwikify_XN4g00S0H0o.js',
      _chk: 'core.js',
      _run: 'core.js',
      _task: 'core.js',
      _val: 'core.js',
      s_lXw4ILRuCgg: 'index.qwik.mjs_routeActionQrl_action_submit_lXw4ILRuCgg.js',
      s_n4khnvPM1tE: 'index.qwik.mjs_useQwikRouter_useStyles_7vVCXsPiLGY.js',
      s_064bkz4ABxQ: 'index.qwik.mjs_GetForm_component_form_onSubmit_1_064bkz4ABxQ.js',
      s_7ekIjq0Ky3k: 'index.qwik.mjs_Link_component_useVisibleTask_s0AOvxtg8Ro.js',
      s_BlOTm5FbA84: 'index.tsx_react_component_QCounter_onMount_BlOTm5FbA84.js',
      s_HR37K1ubX2k: 'index.tsx_react_component_QCounter_onUnmount_HR37K1ubX2k.js',
      s_ftki7FPwkCo: 'index.qwik.mjs_GetForm_component_form_onSubmit_1_064bkz4ABxQ.js',
      s_m5Sk2IlEID0: 'index.qwik.mjs_ErrorBoundary_component_useOnWindow_m5Sk2IlEID0.js',
      s_sUh5Icldn3g: 'index.qwik.mjs_Link_component_useVisibleTask_s0AOvxtg8Ro.js',
      s_wWjZpcfdDTc: 'index.qwik.mjs_Link_component_useVisibleTask_s0AOvxtg8Ro.js',
    },
  };
/**
 * @license
 * @qwik.dev/core/server 2.0.0-beta.12-dev+8c74b3f-20251028092930
 * Copyright QwikDev. All Rights Reserved.
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/QwikDev/qwik/blob/main/LICENSE
 */ var gn = Object.defineProperty,
  bn = (e, t, n) =>
    t in e ? gn(e, t, { enumerable: !0, configurable: !0, writable: !0, value: n }) : (e[t] = n),
  yn = ((e) =>
    typeof require < 'u'
      ? require
      : typeof Proxy < 'u'
        ? new Proxy(e, { get: (t, n) => (typeof require < 'u' ? require : t)[n] })
        : e)(function (e) {
    if (typeof require < 'u') return require.apply(this, arguments);
    throw Error('Dynamic require of "' + e + '" is not supported');
  }),
  f = (e, t, n) => bn(e, typeof t != 'symbol' ? t + '' : t, n),
  wn = !1,
  En = '',
  Cn = (e, ...t) => {
    const n = ot(!1, e, ...t);
    debugger;
    throw n;
  },
  An = (e, ...t) => {
    const n = ot(wn, e, ...t);
    debugger;
    return n;
  },
  ot = (e, t, ...n) => {
    const r = t instanceof Error ? t : new Error(t);
    return (console.error('%cQWIK ERROR', En, r.message, ...n, r.stack), r);
  };
function Sn(e, t, ...n) {}
var te = (e, t, n) => {
    Sn();
    let r = n >> 1,
      s = (e.length - 2) >> 1;
    for (; r <= s; ) {
      const i = r + ((s - r) >> 1),
        o = e[i << 1];
      if (o === t) return i << 1;
      o < t ? (r = i + 1) : (s = i - 1);
    }
    return (r << 1) ^ -1;
  },
  k = (e, t, n, r, s = !1) => {
    const i = te(e, t, r);
    i >= 0
      ? n == null && !s
        ? e.splice(i, 2)
        : (e[i + 1] = n)
      : (n != null || s) && e.splice(i ^ -1, 0, t, n);
  },
  me = (e, t, n) => {
    const r = te(e, t, n);
    let s = null;
    return (r >= 0 && ((s = e[r + 1]), e.splice(r, 2)), s);
  },
  Y = (e, t, n) => {
    const r = te(e, t, n);
    return r >= 0 ? e[r + 1] : null;
  },
  at = (e, t, n) => te(e, t, n) >= 0,
  lt = (e) => Array.isArray(e),
  Nn = (e) => typeof e == 'string',
  kn = (e, ...t) =>
    `Code(Q${e}) https://github.com/QwikDev/qwik/blob/main/packages/qwik/src/core/error/error.ts#L${8 + e}`,
  ct = (e, t = []) => {
    const n = kn(e, ...t);
    return An(n, ...t);
  },
  qn = '<sync>',
  Rn = 'q:type';
function oe(e) {
  let t = '';
  const n = e.length;
  let r = 0,
    s = r;
  for (; r < n; r++) {
    const i = e.charCodeAt(r);
    if (i === 60) t += e.substring(s, r) + '&lt;';
    else if (i === 62) t += e.substring(s, r) + '&gt;';
    else if (i === 38) t += e.substring(s, r) + '&amp;';
    else if (i === 34) t += e.substring(s, r) + '&quot;';
    else if (i === 39) t += e.substring(s, r) + '&#39;';
    else continue;
    s = r + 1;
  }
  return s === 0 ? e : t + e.substring(s);
}
var $n = 'q:renderFn',
  pe = 'q:slot',
  z = 'q:sparent',
  _e = 'q:style',
  ve = 'q:sstyle',
  L = 'q:ctx',
  ut = 'q:brefs',
  Be = 'q:render',
  xn = 'q:runtime',
  Pn = 'q:version',
  In = 'q:base',
  Dn = 'q:locale',
  On = 'q:manifest-hash',
  Tn = 'q:instance',
  ae = 'q:container',
  jn = 'q:template',
  F = '',
  Ln = 'q:id',
  Fn = 'q:key',
  Mn = 'q:props',
  dt = 'q:seq',
  Qn = 'q:seqIdx',
  Hn = 'qwik/backpatch',
  le = ':',
  ht = 'qkssr-f',
  ft = 'qkssr-pu',
  mt = 'qkssr-po',
  Bn = ':',
  Vn = 'dangerouslySetInnerHTML',
  Un = (e) => !!e && typeof e == 'object' && typeof e.then == 'function',
  I = (e, t) => (Un(e) ? e.then(t, zn) : t(e)),
  zn = (e) => {
    Cn(e);
  };
function Wn(e) {
  return e === 'class' || e === 'className';
}
function Gn(e) {
  return Array.from(e).join(' ');
}
function Xn(e) {
  return e.startsWith('preventdefault:');
}
var Yn = new Set([
    'animationIterationCount',
    'aspectRatio',
    'borderImageOutset',
    'borderImageSlice',
    'borderImageWidth',
    'boxFlex',
    'boxFlexGroup',
    'boxOrdinalGroup',
    'columnCount',
    'columns',
    'flex',
    'flexGrow',
    'flexShrink',
    'gridArea',
    'gridRow',
    'gridRowEnd',
    'gridRowStart',
    'gridColumn',
    'gridColumnEnd',
    'gridColumnStart',
    'fontWeight',
    'lineClamp',
    'lineHeight',
    'opacity',
    'order',
    'orphans',
    'scale',
    'tabSize',
    'widows',
    'zIndex',
    'zoom',
    'MozAnimationIterationCount',
    'MozBoxFlex',
    'msFlex',
    'msFlexPositive',
    'WebkitAnimationIterationCount',
    'WebkitBoxFlex',
    'WebkitBoxOrdinalGroup',
    'WebkitColumnCount',
    'WebkitColumns',
    'WebkitFlex',
    'WebkitFlexGrow',
    'WebkitFlexShrink',
    'WebkitLineClamp',
  ]),
  Kn = (e) => Yn.has(e),
  pt = (e) => {
    if (!e) return '';
    if (Nn(e)) return e.trim();
    const t = [];
    if (lt(e))
      for (const n of e) {
        const r = pt(n);
        r && t.push(r);
      }
    else for (const [n, r] of Object.entries(e)) r && t.push(n.trim());
    return t.join(' ');
  },
  Zn = (e) => e.replace(/([A-Z])/g, '-$1').toLowerCase(),
  Jn = (e) => {
    if (e == null) return '';
    if (typeof e == 'object') {
      if (lt(e)) throw ct(0, [e, 'style']);
      {
        const t = [];
        for (const n in e)
          if (Object.prototype.hasOwnProperty.call(e, n)) {
            const r = e[n];
            r != null &&
              typeof r != 'function' &&
              (n.startsWith('--') ? t.push(n + ':' + r) : t.push(Zn(n) + ':' + rr(n, r)));
          }
        return t.join(';');
      }
    }
    return String(e);
  },
  er = (e) => (e != null ? String(e) : null);
function tr(e, t, n) {
  if (Wn(e)) {
    const r = pt(t);
    t = n ? n + (r.length ? ' ' + r : r) : r;
  } else
    e === 'style'
      ? (t = Jn(t))
      : nr(e) || typeof t == 'number'
        ? (t = er(t))
        : t === !1 || t == null
          ? (t = null)
          : t === !0 && Xn(e) && (t = '');
  return t;
}
function nr(e) {
  return sr(e) || ['spellcheck', 'draggable', 'contenteditable'].includes(e);
}
var rr = (e, t) => (typeof t == 'number' && t !== 0 && !Kn(e) ? t + 'px' : t);
function sr(e) {
  return e.startsWith('aria-');
}
var w = {
    REFERENCE_CH: '~',
    ADVANCE_1_CH: '!',
    ADVANCE_2_CH: '"',
    ADVANCE_4_CH: '#',
    ADVANCE_8_CH: '$',
    ADVANCE_16_CH: '%',
    ADVANCE_32_CH: '&',
    ADVANCE_64_CH: "'",
    ADVANCE_128_CH: '(',
    ADVANCE_256_CH: ')',
    ADVANCE_512_CH: '*',
    ADVANCE_1024_CH: '+',
    ADVANCE_2048_CH: ',',
    ADVANCE_4096_CH: '-',
    ADVANCE_8192_CH: '.',
  },
  g = {
    OPEN_CHAR: '{',
    CLOSE_CHAR: '}',
    SCOPED_STYLE_CHAR: ';',
    RENDER_FN_CHAR: '<',
    ID_CHAR: '=',
    PROPS_CHAR: '>',
    SLOT_PARENT_CHAR: '?',
    KEY_CHAR: '@',
    SEQ_CHAR: '[',
    CONTEXT_CHAR: ']',
    SEQ_IDX_CHAR: '^',
    BACK_REFS_CHAR: '`',
    SEPARATOR_CHAR: '|',
    SLOT_CHAR: '~',
  },
  ge = { $DEBUG$: !1, $invPreloadProbability$: 0.65 },
  ir = Date.now(),
  or = /\.[mc]?js$/,
  _t = 0,
  ar = 1,
  lr = 2,
  cr = 3,
  be,
  ye,
  ur = (e, t) => ({
    $name$: e,
    $state$: or.test(e) ? _t : cr,
    $deps$: gt ? t?.map((n) => ({ ...n, $factor$: 1 })) : t,
    $inverseProbability$: 1,
    $createdTs$: Date.now(),
    $waitedMs$: 0,
    $loadedMs$: 0,
  }),
  dr = (e) => {
    const t = new Map();
    let n = 0;
    for (; n < e.length; ) {
      const r = e[n++],
        s = [];
      let i,
        o = 1;
      for (; (i = e[n]), typeof i == 'number'; )
        (i < 0 ? (o = -i / 10) : s.push({ $name$: e[i], $importProbability$: o, $factor$: 1 }),
          n++);
      t.set(r, s);
    }
    return t;
  },
  vt = (e) => {
    let t = we.get(e);
    if (!t) {
      let n;
      if (ye) {
        if (((n = ye.get(e)), !n)) return;
        n.length || (n = void 0);
      }
      ((t = ur(e, n)), we.set(e, t));
    }
    return t;
  },
  hr = (e, t) => {
    (t &&
      ('debug' in t && (ge.$DEBUG$ = !!t.debug),
      typeof t.preloadProbability == 'number' &&
        (ge.$invPreloadProbability$ = 1 - t.preloadProbability)),
      !(be != null || !e) && ((be = ''), (ye = dr(e))));
  },
  we = new Map(),
  gt,
  K,
  bt = 0,
  D = [],
  fr = (...e) => {
    console.log(`Preloader ${Date.now() - ir}ms ${bt}/${D.length} queued>`, ...e);
  },
  mr = () => {
    (we.clear(), (K = !1), (gt = !0), (bt = 0), (D.length = 0));
  },
  pr = () => {
    K && (D.sort((e, t) => e.$inverseProbability$ - t.$inverseProbability$), (K = !1));
  },
  _r = () => {
    pr();
    let e = 0.4;
    const t = [];
    for (const n of D) {
      const r = Math.round((1 - n.$inverseProbability$) * 10);
      (r !== e && ((e = r), t.push(e)), t.push(n.$name$));
    }
    return t;
  },
  yt = (e, t, n) => {
    if (n?.has(e)) return;
    const r = e.$inverseProbability$;
    if (
      ((e.$inverseProbability$ = t),
      !(r - e.$inverseProbability$ < 0.01) &&
        (be != null &&
          e.$state$ < lr &&
          (e.$state$ === _t &&
            ((e.$state$ = ar),
            D.push(e),
            ge.$DEBUG$ &&
              fr(`queued ${Math.round((1 - e.$inverseProbability$) * 100)}%`, e.$name$)),
          (K = !0)),
        e.$deps$))
    ) {
      (n || (n = new Set()), n.add(e));
      const s = 1 - e.$inverseProbability$;
      for (const i of e.$deps$) {
        const o = vt(i.$name$);
        if (o.$inverseProbability$ === 0) continue;
        let a;
        if (s === 1 || (s >= 0.99 && Ee < 100))
          (Ee++, (a = Math.min(0.01, 1 - i.$importProbability$)));
        else {
          const c = 1 - i.$importProbability$ * s,
            l = i.$factor$,
            u = c / l;
          ((a = Math.max(0.02, o.$inverseProbability$ * u)), (i.$factor$ = u));
        }
        yt(o, a, n);
      }
    }
  },
  Ve = (e, t) => {
    const n = vt(e);
    n && n.$inverseProbability$ > t && yt(n, t);
  },
  Ee,
  vr = (e, t) => {
    if (!e?.length) return;
    Ee = 0;
    let n = t ? 1 - t : 0.4;
    if (Array.isArray(e))
      for (let r = e.length - 1; r >= 0; r--) {
        const s = e[r];
        typeof s == 'number' ? (n = 1 - s / 10) : Ve(s, n);
      }
    else Ve(e, n);
  };
function wt(e, t) {
  const n = t?.mapper,
    r = e.symbolMapper
      ? e.symbolMapper
      : (i, o, a) => {
          if (n || he) {
            const c = Z(i),
              l = n[c];
            if (!l) {
              if (c === qn) return [c, ''];
              if (globalThis.__qwik_reg_symbols?.has(c)) return [i, '_'];
              console.error('Cannot resolve symbol', i, 'in', n, a);
            }
            return l;
          }
        };
  return {
    isServer: !0,
    async importSymbol(i, o, a) {
      const c = Z(a),
        l = globalThis.__qwik_reg_symbols?.get(c);
      if (l) return l;
      let u = String(o);
      u.endsWith('.js') || (u += '.js');
      const d = yn(u);
      if (!(a in d)) throw new Error(`Q-ERROR: missing symbol '${a}' in module '${u}'.`);
      return d[a];
    },
    raf: () => (console.error('server can not rerender'), Promise.resolve()),
    chunkForSymbol(i, o, a) {
      return r(i, n, a);
    },
  };
}
async function gr(e, t) {
  const n = wt(e, t);
  Ye(n);
}
var Z = (e) => {
  const t = e.lastIndexOf('_');
  return t > -1 ? e.slice(t + 1) : e;
};
function Ce() {
  if (typeof performance > 'u') return () => 0;
  const e = performance.now();
  return () => (performance.now() - e) / 1e6;
}
function br(e) {
  let t = e.base;
  return (
    typeof e.base == 'function' && (t = e.base(e)),
    typeof t == 'string' ? (t.endsWith('/') || (t += '/'), t) : '/build/'
  );
}
function yr(e) {
  const t = [],
    n = (r) => {
      if (r) for (const s of r) t.includes(s.url) || (t.push(s.url), s.imports && n(s.imports));
    };
  return (n(e), t);
}
var wr = (e) => {
  const t = Qt();
  return [
    ...new Set(
      e
        ?.map((n) => {
          const r = n.$symbol$,
            s = n.$chunk$,
            i = t.chunkForSymbol(r, s, n.dev?.file);
          return i ? i[1] : s;
        })
        .filter(Boolean)
    ),
  ];
};
function Er(e, t, n) {
  const r = t.prefetchStrategy;
  if (r === null) return [];
  if (!n?.manifest.bundleGraph) return wr(e);
  if (typeof r?.symbolsToPrefetch == 'function')
    try {
      const i = r.symbolsToPrefetch({ manifest: n.manifest });
      return yr(i);
    } catch (i) {
      console.error('getPrefetchUrls, symbolsToPrefetch()', i);
    }
  const s = new Set();
  for (const i of e) {
    const o = Z(i.$symbol$);
    o && o.length >= 10 && s.add(o);
  }
  return [...s];
}
var Cr = (e, t) => {
    if (!t?.manifest.bundleGraph) return [...new Set(e)];
    mr();
    let n = 0.99;
    for (const r of e) (vr(r, n), (n *= 0.95));
    return _r();
  },
  Et = (e, t) => {
    if (t == null) return null;
    const n = `${e}${t}`.split('/'),
      r = [];
    for (const s of n) s === '..' && r.length > 0 ? r.pop() : r.push(s);
    return r.join('/');
  },
  Ct = (e) => e.$buildBase$,
  Ar = (e, t, n) => {
    const { resolvedManifest: r } = e,
      s = Ct(e),
      i = Et(s, r?.manifest?.preloader);
    let o = r?.manifest.bundleGraphAsset;
    if ((o && (o = '/' + o), i && o && t !== !1)) {
      const a =
          typeof t == 'object'
            ? { debug: t.debug, preloadProbability: t.ssrPreloadProbability }
            : void 0,
        c = e.resolvedManifest?.manifest.bundleGraph;
      hr(c, a);
      const l = [];
      t &&
        (t.debug && l.push('d:1'),
        t.maxIdlePreloads && l.push(`P:${t.maxIdlePreloads}`),
        t.preloadProbability && l.push(`Q:${t.preloadProbability}`));
      const u = l.length ? `,{${l.join(',')}}` : '',
        d = ['rel', 'modulepreload', 'href', i];
      (n && d.push('nonce', n),
        e.openElement('link', null, d),
        e.closeElement(),
        e.openElement('link', null, [
          'rel',
          'preload',
          'href',
          o,
          'as',
          'fetch',
          'crossorigin',
          'anonymous',
        ]),
        e.closeElement());
      const h = `let b=fetch("${o}");import("${i}").then(({l})=>l(${JSON.stringify(s)},b${u}));`,
        m = ['type', 'module', 'async', !0];
      (n && m.push('nonce', n), e.openElement('script', null, m), e.write(h), e.closeElement());
    }
  },
  Sr = (e, t, n, r) => {
    if (n.length === 0 || t === !1) return null;
    const { ssrPreloads: s, ssrPreloadProbability: i } = kr(typeof t == 'boolean' ? void 0 : t);
    let o = s;
    const a = Ct(e),
      c = [],
      { resolvedManifest: l } = e;
    if (o) {
      const m = l?.manifest.preloader,
        p = l?.manifest.core,
        _ = Cr(n, l);
      let b = 4;
      const E = i * 10;
      for (const v of _)
        if (typeof v == 'string') {
          if (b < E) break;
          if (v === m || v === p) continue;
          if ((c.push(v), --o === 0)) break;
        } else b = v;
    }
    const u = Et(a, l?.manifest.preloader);
    let h = c.length
      ? `${JSON.stringify(c)}.map((l,e)=>{e=document.createElement('link');e.rel='modulepreload';e.href=${JSON.stringify(a)}+l;document.head.appendChild(e)});`
      : '';
    if (
      (u &&
        (h += `window.addEventListener('load',f=>{f=_=>import("${u}").then(({p})=>p(${JSON.stringify(n)}));try{requestIdleCallback(f,{timeout:2000})}catch(e){setTimeout(f,200)}})`),
      h)
    ) {
      const m = ['type', 'module', 'async', !0, 'q:type', 'preload'];
      (r && m.push('nonce', r), e.openElement('script', null, m), e.write(h), e.closeElement());
    }
    return null;
  },
  Nr = (e, t, n) => {
    if (t.preloader !== !1) {
      const r = Array.from(e.serializationCtx.$eventQrls$),
        s = Er(r, t, e.resolvedManifest);
      s.length > 0 && Sr(e, t.preloader, s, n);
    }
  };
function kr(e) {
  return { ...qr, ...e };
}
var qr = {
    ssrPreloads: 7,
    ssrPreloadProbability: 0.5,
    debug: !1,
    maxIdlePreloads: 25,
    preloadProbability: 0.35,
  },
  Rr =
    'const t=document,e=window,n=new Set,o=new Set([t]);let r;const s=(t,e)=>Array.from(t.querySelectorAll(e)),a=t=>{const e=[];return o.forEach(n=>e.push(...s(n,t))),e},i=t=>{m(t),s(t,"[q\\\\:shadowroot]").forEach(t=>{const e=t.shadowRoot;e&&i(e)})},c=t=>t&&"function"==typeof t.then,l=(t,e,n=e.type)=>{a("[on"+t+"\\\\:"+n+"]").forEach(o=>{u(o,t,e,n)})},f=e=>{if(void 0===e._qwikjson_){let n=(e===t.documentElement?t.body:e).lastElementChild;for(;n;){if("SCRIPT"===n.tagName&&"qwik/json"===n.getAttribute("type")){e._qwikjson_=JSON.parse(n.textContent.replace(/\\\\x3C(\\/?script)/gi,"<$1"));break}n=n.previousElementSibling}}},p=(t,e)=>new CustomEvent(t,{detail:e}),u=async(e,n,o,r=o.type)=>{const s="on"+n+":"+r;e.hasAttribute("preventdefault:"+r)&&o.preventDefault(),e.hasAttribute("stoppropagation:"+r)&&o.stopPropagation();const a=e._qc_,i=a&&a.li.filter(t=>t[0]===s);if(i&&i.length>0){for(const t of i){const n=t[1].getFn([e,o],()=>e.isConnected)(o,e),r=o.cancelBubble;c(n)&&await n,r&&o.stopPropagation()}return}const l=e.getAttribute(s),p=e.qDispatchEvent;if(p)return p(o,n);if(l){const n=e.closest("[q\\\\:container]:not([q\\\\:container=html]):not([q\\\\:container=text])"),r=n.getAttribute("q:base"),s=n.getAttribute("q:version")||"unknown",a=n.getAttribute("q:manifest-hash")||"dev",i=new URL(r,t.baseURI);for(const p of l.split("\\n")){const l=new URL(p,i),u=l.href,q=l.hash.replace(/^#?([^?[|]*).*$/,"$1")||"default",h=performance.now();let _,d,y;const g=p.startsWith("#"),m={qBase:r,qManifest:a,qVersion:s,href:u,symbol:q,element:e,reqTime:h};if(g){const e=n.getAttribute("q:instance");_=(t["qFuncs_"+e]||[])[Number.parseInt(q)],_||(d="sync",y=Error("sym:"+q))}else{b("qsymbol",m);const t=l.href.split("#")[0];try{const e=import(t);f(n),_=(await e)[q],_||(d="no-symbol",y=Error(`${q} not in ${t}`))}catch(t){d||(d="async"),y=t}}if(!_){b("qerror",{importError:d,error:y,...m}),console.error(y);break}const w=t.__q_context__;if(e.isConnected)try{t.__q_context__=[e,o,l];const n=_(o,e);c(n)&&await n}catch(t){b("qerror",{error:t,...m})}finally{t.__q_context__=w}}}},b=(e,n)=>{t.dispatchEvent(p(e,n))},q=t=>t.replace(/([A-Z-])/g,t=>"-"+t.toLowerCase()),h=async t=>{let e=q(t.type),n=t.target;for(l("-document",t,e);n&&n.getAttribute;){const o=u(n,"",t,e);let r=t.cancelBubble;c(o)&&await o,r||(r=r||t.cancelBubble||n.hasAttribute("stoppropagation:"+t.type)),n=t.bubbles&&!0!==r?n.parentElement:null}},_=t=>{l("-window",t,q(t.type))},d=()=>{const s=t.readyState;if(!r&&("interactive"==s||"complete"==s)&&(o.forEach(i),r=1,b("qinit"),(e.requestIdleCallback??e.setTimeout).bind(e)(()=>b("qidle")),n.has("qvisible"))){const t=a("[on\\\\:qvisible]"),e=new IntersectionObserver(t=>{for(const n of t)n.isIntersecting&&(e.unobserve(n.target),u(n.target,"",p("qvisible",n)))});t.forEach(t=>e.observe(t))}},y=(t,e,n,o=!1)=>{t.addEventListener(e,n,{capture:o,passive:!1})},g=t=>t.replace(/-./g,t=>t[1].toUpperCase()),m=(...t)=>{for(const r of t)if("string"==typeof r){if(!n.has(r)){n.add(r);const t=g(r);o.forEach(e=>y(e,t,h,!0)),y(e,t,_,!0)}}else o.has(r)||(n.forEach(t=>{const e=g(t);y(r,e,h,!0)}),o.add(r))};if(!("__q_context__"in t)){t.__q_context__=0;const r=e.qwikevents;r&&(Array.isArray(r)?m(...r):m("click","input")),e.qwikevents={events:n,roots:o,push:m},y(t,"readystatechange",d),d()}',
  $r = `const doc = document;
const win = window;
const events = /* @__PURE__ */ new Set();
const roots = /* @__PURE__ */ new Set([doc]);
let hasInitialized;
const nativeQuerySelectorAll = (root, selector) => Array.from(root.querySelectorAll(selector));
const querySelectorAll = (query) => {
  const elements = [];
  roots.forEach((root) => elements.push(...nativeQuerySelectorAll(root, query)));
  return elements;
};
const findShadowRoots = (fragment) => {
  processEventOrNode(fragment);
  nativeQuerySelectorAll(fragment, "[q\\\\:shadowroot]").forEach((parent) => {
    const shadowRoot = parent.shadowRoot;
    shadowRoot && findShadowRoots(shadowRoot);
  });
};
const isPromise = (promise) => promise && typeof promise.then === "function";
const broadcast = (infix, ev, type = ev.type) => {
  querySelectorAll("[on" + infix + "\\\\:" + type + "]").forEach((el) => {
    dispatch(el, infix, ev, type);
  });
};
const resolveContainer = (containerEl) => {
  if (containerEl._qwikjson_ === void 0) {
    const parentJSON = containerEl === doc.documentElement ? doc.body : containerEl;
    let script = parentJSON.lastElementChild;
    while (script) {
      if (script.tagName === "SCRIPT" && script.getAttribute("type") === "qwik/json") {
        containerEl._qwikjson_ = JSON.parse(
          script.textContent.replace(/\\\\x3C(\\/?script)/gi, "<$1")
        );
        break;
      }
      script = script.previousElementSibling;
    }
  }
};
const createEvent = (eventName, detail) => new CustomEvent(eventName, {
  detail
});
const dispatch = async (element, scope, ev, eventName = ev.type) => {
  const attrName = "on" + scope + ":" + eventName;
  if (element.hasAttribute("preventdefault:" + eventName)) {
    ev.preventDefault();
  }
  if (element.hasAttribute("stoppropagation:" + eventName)) {
    ev.stopPropagation();
  }
  const ctx = element._qc_;
  const relevantListeners = ctx && ctx.li.filter((li) => li[0] === attrName);
  if (relevantListeners && relevantListeners.length > 0) {
    for (const listener of relevantListeners) {
      const results = listener[1].getFn([element, ev], () => element.isConnected)(ev, element);
      const cancelBubble = ev.cancelBubble;
      if (isPromise(results)) {
        await results;
      }
      if (cancelBubble) {
        ev.stopPropagation();
      }
    }
    return;
  }
  const attrValue = element.getAttribute(attrName);
  const qDispatchEvent = element.qDispatchEvent;
  if (qDispatchEvent) {
    return qDispatchEvent(ev, scope);
  }
  if (attrValue) {
    const container = element.closest(
      "[q\\\\:container]:not([q\\\\:container=html]):not([q\\\\:container=text])"
    );
    const qBase = container.getAttribute("q:base");
    const qVersion = container.getAttribute("q:version") || "unknown";
    const qManifest = container.getAttribute("q:manifest-hash") || "dev";
    const base = new URL(qBase, doc.baseURI);
    for (const qrl of attrValue.split("\\n")) {
      const url = new URL(qrl, base);
      const href = url.href;
      const symbol = url.hash.replace(/^#?([^?[|]*).*$/, "$1") || "default";
      const reqTime = performance.now();
      let handler;
      let importError;
      let error;
      const isSync = qrl.startsWith("#");
      const eventData = {
        qBase,
        qManifest,
        qVersion,
        href,
        symbol,
        element,
        reqTime
      };
      if (isSync) {
        const hash = container.getAttribute("q:instance");
        handler = (doc["qFuncs_" + hash] || [])[Number.parseInt(symbol)];
        if (!handler) {
          importError = "sync";
          error = new Error("sym:" + symbol);
        }
      } else {
        emitEvent("qsymbol", eventData);
        const uri = url.href.split("#")[0];
        try {
          const module = import(
                        uri
          );
          resolveContainer(container);
          handler = (await module)[symbol];
          if (!handler) {
            importError = "no-symbol";
            error = new Error(\`\${symbol} not in \${uri}\`);
          }
        } catch (err) {
          importError || (importError = "async");
          error = err;
        }
      }
      if (!handler) {
        emitEvent("qerror", {
          importError,
          error,
          ...eventData
        });
        console.error(error);
        break;
      }
      const previousCtx = doc.__q_context__;
      if (element.isConnected) {
        try {
          doc.__q_context__ = [element, ev, url];
          const results = handler(ev, element);
          if (isPromise(results)) {
            await results;
          }
        } catch (error2) {
          emitEvent("qerror", { error: error2, ...eventData });
        } finally {
          doc.__q_context__ = previousCtx;
        }
      }
    }
  }
};
const emitEvent = (eventName, detail) => {
  doc.dispatchEvent(createEvent(eventName, detail));
};
const camelToKebab = (str) => str.replace(/([A-Z-])/g, (a) => "-" + a.toLowerCase());
const processDocumentEvent = async (ev) => {
  let type = camelToKebab(ev.type);
  let element = ev.target;
  broadcast("-document", ev, type);
  while (element && element.getAttribute) {
    const results = dispatch(element, "", ev, type);
    let cancelBubble = ev.cancelBubble;
    if (isPromise(results)) {
      await results;
    }
    cancelBubble || (cancelBubble = cancelBubble || ev.cancelBubble || element.hasAttribute("stoppropagation:" + ev.type));
    element = ev.bubbles && cancelBubble !== true ? element.parentElement : null;
  }
};
const processWindowEvent = (ev) => {
  broadcast("-window", ev, camelToKebab(ev.type));
};
const processReadyStateChange = () => {
  const readyState = doc.readyState;
  if (!hasInitialized && (readyState == "interactive" || readyState == "complete")) {
    roots.forEach(findShadowRoots);
    hasInitialized = 1;
    emitEvent("qinit");
    const riC = win.requestIdleCallback ?? win.setTimeout;
    riC.bind(win)(() => emitEvent("qidle"));
    if (events.has("qvisible")) {
      const results = querySelectorAll("[on\\\\:qvisible]");
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            observer.unobserve(entry.target);
            dispatch(entry.target, "", createEvent("qvisible", entry));
          }
        }
      });
      results.forEach((el) => observer.observe(el));
    }
  }
};
const addEventListener = (el, eventName, handler, capture = false) => {
  el.addEventListener(eventName, handler, { capture, passive: false });
};
const kebabToCamel = (eventName) => eventName.replace(/-./g, (a) => a[1].toUpperCase());
const processEventOrNode = (...eventNames) => {
  for (const eventNameOrNode of eventNames) {
    if (typeof eventNameOrNode === "string") {
      if (!events.has(eventNameOrNode)) {
        events.add(eventNameOrNode);
        const eventName = kebabToCamel(eventNameOrNode);
        roots.forEach((root) => addEventListener(root, eventName, processDocumentEvent, true));
        addEventListener(win, eventName, processWindowEvent, true);
      }
    } else {
      if (!roots.has(eventNameOrNode)) {
        events.forEach((kebabEventName) => {
          const eventName = kebabToCamel(kebabEventName);
          addEventListener(eventNameOrNode, eventName, processDocumentEvent, true);
        });
        roots.add(eventNameOrNode);
      }
    }
  }
};
if (!("__q_context__" in doc)) {
  doc.__q_context__ = 0;
  const qwikevents = win.qwikevents;
  if (qwikevents) {
    if (Array.isArray(qwikevents)) {
      processEventOrNode(...qwikevents);
    } else {
      processEventOrNode("click", "input");
    }
  }
  win.qwikevents = {
    events,
    roots,
    push: processEventOrNode
  };
  addEventListener(doc, "readystatechange", processReadyStateChange);
  processReadyStateChange();
}`,
  xr = `const t='script[type="qwik/backpatch"]',e=document.currentScript;if(e){const o=e.closest("[q\\\\:container]:not([q\\\\:container=html]):not([q\\\\:container=text])");if(o){const e=o.querySelector(t);if(e){const t=JSON.parse(e.textContent||"[]"),n=document.createTreeWalker(o,NodeFilter.SHOW_ELEMENT);let r=n.currentNode,c=r.hasAttribute(":")?0:-1;for(let e=0;e<t.length;e+=3){const o=t[e],i=t[e+1];let s=t[e+2];for(;c<o&&(r=n.nextNode(),r);)r.hasAttribute(":")&&c++;const l=r;null==s||!1===s?l.removeAttribute(i):("boolean"==typeof s&&(s=""),l.setAttribute(i,s))}}}}`,
  Pr = `const BACKPATCH_DATA_SELECTOR = 'script[type="qwik/backpatch"]';
const executorScript = document.currentScript;
if (executorScript) {
  const container = executorScript.closest(
    "[q\\\\:container]:not([q\\\\:container=html]):not([q\\\\:container=text])"
  );
  if (container) {
    const script = container.querySelector(BACKPATCH_DATA_SELECTOR);
    if (script) {
      const data = JSON.parse(script.textContent || "[]");
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT);
      let currentNode = walker.currentNode;
      let currentNodeIdx = currentNode.hasAttribute(":") ? 0 : -1;
      for (let i = 0; i < data.length; i += 3) {
        const elementIdx = data[i];
        const attrName = data[i + 1];
        let value = data[i + 2];
        while (currentNodeIdx < elementIdx) {
          currentNode = walker.nextNode();
          if (!currentNode) {
            break;
          }
          if (currentNode.hasAttribute(":")) {
            currentNodeIdx++;
          }
        }
        const element = currentNode;
        if (value == null || value === false) {
          element.removeAttribute(attrName);
        } else {
          if (typeof value === "boolean") {
            value = "";
          }
          element.setAttribute(attrName, value);
        }
      }
    }
  }
}`;
function Ir(e = {}) {
  return e.debug ? $r : Rr;
}
function Dr(e = {}) {
  return e.debug ? Pr : xr;
}
var At = class {
    constructor(e, t, n, r, s, i) {
      ((this.parentComponent = e),
        (this.attributesIndex = n),
        (this.cleanupQueue = r),
        (this.vnodeData = s),
        (this.currentFile = i),
        f(this, '__brand__', 'SsrNode'),
        f(this, 'id'),
        f(this, 'flags'),
        f(this, 'children', null),
        f(this, 'attrs'),
        f(this, 'localProps', null),
        (this.id = t),
        (this.flags = 1),
        (this.attrs = this.attributesIndex >= 0 ? this.vnodeData[this.attributesIndex] : Pe),
        this.parentComponent?.addChild(this));
    }
    get [Mt]() {
      return this.getProp(ut);
    }
    setProp(e, t) {
      (this.attrs === Pe && this.setEmptyArrayAsVNodeDataAttributes(),
        e.startsWith(le)
          ? k(this.localProps || (this.localProps = []), e, t, 0)
          : k(this.attrs, e, t, 0),
        e == dt && t && this.cleanupQueue.push(t));
    }
    setEmptyArrayAsVNodeDataAttributes() {
      if (this.attributesIndex >= 0)
        ((this.vnodeData[this.attributesIndex] = []),
          (this.attrs = this.vnodeData[this.attributesIndex]));
      else {
        const e = this.vnodeData.length > 1 ? 1 : 0;
        (this.vnodeData.splice(e, 0, []),
          (this.attributesIndex = e),
          (this.attrs = this.vnodeData[this.attributesIndex]));
      }
    }
    getProp(e) {
      return e.startsWith(le)
        ? this.localProps
          ? Y(this.localProps, e, 0)
          : null
        : Y(this.attrs, e, 0);
    }
    removeProp(e) {
      e.startsWith(le) ? this.localProps && me(this.localProps, e, 0) : me(this.attrs, e, 0);
    }
    addChild(e) {
      (this.children || (this.children = []), this.children.push(e));
    }
    setTreeNonUpdatable() {
      if (this.flags & 1 && ((this.flags &= -2), this.children))
        for (const e of this.children) e.setTreeNonUpdatable();
    }
    toString() {
      return `<SSRNode id="${this.id}" />`;
    }
  },
  ce = class {
    constructor(e) {
      ((this.$ssrNode$ = e), f(this, '__brand__', 'DomRef'));
    }
  },
  Ue = class {
    constructor(e) {
      ((this.componentNode = e),
        f(this, 'slots', []),
        f(this, 'projectionDepth', 0),
        f(this, 'scopedStyleIds', new Set()),
        f(this, 'projectionScopedStyle', null),
        f(this, 'projectionComponentFrame', null));
    }
    distributeChildrenIntoSlots(e, t, n) {
      if (((this.projectionScopedStyle = t), (this.projectionComponentFrame = n), Ie(e))) {
        const r = this.getSlotName(e);
        k(this.slots, r, e, 0);
      } else if (Array.isArray(e) && e.length > 0) {
        const r = [];
        for (let s = 0; s < e.length; s++) {
          const i = e[s];
          if (Ie(i)) {
            const o = this.getSlotName(i);
            o === F ? r.push(i) : this.updateSlot(o, i);
          } else r.push(i);
        }
        r.length > 0 && k(this.slots, F, r, 0);
      } else k(this.slots, F, e, 0);
    }
    updateSlot(e, t) {
      let n = Y(this.slots, e, 0);
      (n === null ? (n = t) : Array.isArray(n) ? n.push(t) : (n = [n, t]), k(this.slots, e, n, 0));
    }
    getSlotName(e) {
      return e.props[pe] ? e.props[pe] : F;
    }
    hasSlot(e) {
      return at(this.slots, e, 0);
    }
    consumeChildrenForSlot(e, t) {
      const n = me(this.slots, t, 0);
      return (this.componentNode.setProp(t, e.id), e.setProp(z, this.componentNode.id), n);
    }
    releaseUnclaimedProjections(e) {
      this.slots.length &&
        (e.push(this), e.push(this.projectionScopedStyle), e.push.apply(e, this.slots));
    }
  };
function Or(e) {
  switch (e) {
    case 'area':
    case 'base':
    case 'basefont':
    case 'bgsound':
    case 'br':
    case 'col':
    case 'embed':
    case 'frame':
    case 'hr':
    case 'img':
    case 'input':
    case 'keygen':
    case 'link':
    case 'meta':
    case 'param':
    case 'source':
    case 'track':
    case 'wbr':
      return !0;
    default:
      return !1;
  }
}
var St = Number.MAX_SAFE_INTEGER,
  Ne = Number.MAX_SAFE_INTEGER - 1,
  ke = Number.MAX_SAFE_INTEGER - 2;
function Tr(e) {
  const t = e.length,
    n = t > 1 ? e[t - 1] : 0;
  n >= 0 ? e.push(-1) : (e[t - 1] = n - 1);
}
function jr(e, t) {
  const n = e.length,
    r = n > 1 ? e[n - 1] : 0;
  (n > 1 && r >= 0 && (e[0] |= 1), e.push(t), t == 0 && (e[0] |= 1));
}
function Lr(e, t) {
  (e.push(t, St), (e[0] |= 2));
}
function Fr(e) {
  e.push(Ne);
}
function Mr(e) {
  (e.push([], ke), (e[0] |= 4));
}
function Qr(e, t, n, r, s) {
  t[0] |= 8;
  const i = [-1];
  let o = -1;
  for (let c = 1; c < t.length; c++) {
    const l = t[c];
    if (Array.isArray(l)) ((o = c), c++, t[c] !== ke && (i[i.length - 1]++, i.push(-1)));
    else if (l === Ne) i.pop();
    else if (l < 0) {
      const u = 0 - l;
      i[i.length - 1] += u;
    } else i[i.length - 1]++;
  }
  let a = String(n);
  if (t[0] & 3)
    for (let c = 0; c < i.length; c++) {
      const l = i[c];
      l >= 0 && (a += Nt(l));
    }
  return new At(e, a, o, r, t, s);
}
var M = [];
function Nt(e) {
  for (; M.length <= e; ) {
    let t = M.length,
      n = '';
    do
      ((n = String.fromCharCode((n.length === 0 ? 65 : 97) + (t % 26)) + n),
        (t = Math.floor(t / 26)));
    while (t !== 0);
    M.push(n);
  }
  return M[e];
}
function Hr(e) {
  return (
    e.renderOptions || (e.renderOptions = {}),
    new Ur({
      tagName: e.tagName || 'div',
      writer: e.writer || new Br(),
      locale: e.locale || '',
      timing: e.timing || { firstFlush: 0, render: 0, snapshot: 0 },
      buildBase: e.buildBase || '/build/',
      resolvedManifest: e.resolvedManifest || {
        mapper: {},
        manifest: { manifestHash: 'dev', mapping: {} },
      },
      renderOptions: e.renderOptions,
    })
  );
}
var Br = class {
    constructor() {
      f(this, 'buffer', []);
    }
    write(e) {
      this.buffer.push(e);
    }
    toString() {
      return this.buffer.join('');
    }
  },
  Vr = {},
  Ur = class extends Lt {
    constructor(e) {
      (super(() => null, e.renderOptions.serverData ?? Vr, e.locale),
        f(this, 'tag'),
        f(this, 'isHtml'),
        f(this, 'writer'),
        f(this, 'timing'),
        f(this, 'size', 0),
        f(this, 'resolvedManifest'),
        f(this, 'symbolToChunkResolver'),
        f(this, 'renderOptions'),
        f(this, 'serializationCtx'),
        f(this, 'additionalHeadNodes', new Array()),
        f(this, 'additionalBodyNodes', new Array()),
        f(this, 'lastNode', null),
        f(this, 'currentComponentNode', null),
        f(this, 'styleIds', new Set()),
        f(this, 'isBackpatchExecutorEmitted', !1),
        f(this, 'backpatchMap', new Map()),
        f(this, 'currentElementFrame', null),
        f(this, 'renderTimer'),
        f(this, 'depthFirstElementCount', -1),
        f(this, 'vNodeDatas', []),
        f(this, 'componentStack', []),
        f(this, 'unclaimedProjections', []),
        f(this, 'unclaimedProjectionComponentFrameQueue', []),
        f(this, 'cleanupQueue', []),
        f(this, '$instanceHash$', Gr()),
        f(this, '$noMoreRoots$', !1),
        f(this, 'qlInclude'),
        f(this, '$noScriptHere$', 0),
        (this.symbolToChunkResolver = (n) => {
          const r = n.lastIndexOf('_'),
            s = this.resolvedManifest.mapper[r == -1 ? n : n.substring(r + 1)];
          return s ? s[1] : '';
        }),
        (this.serializationCtx = this.serializationCtxFactory(
          At,
          ce,
          this.symbolToChunkResolver,
          e.writer
        )),
        (this.renderTimer = Ce()),
        (this.tag = e.tagName),
        (this.isHtml = e.tagName === 'html'),
        (this.writer = e.writer),
        (this.timing = e.timing),
        (this.$buildBase$ = e.buildBase),
        (this.resolvedManifest = e.resolvedManifest),
        (this.renderOptions = e.renderOptions),
        (this.$currentUniqueId$ = 1e5));
      const t = this.renderOptions.qwikLoader;
      ((this.qlInclude = t
        ? typeof t == 'object'
          ? t.include === 'never'
            ? 2
            : 0
          : t === 'inline'
            ? 1
            : t === 'never'
              ? 2
              : 0
        : 0),
        this.qlInclude === 0 &&
          (this.resolvedManifest?.manifest.qwikLoader || (this.qlInclude = 1)),
        this.$processInjectionsFromManifest$());
    }
    ensureProjectionResolved(e) {}
    handleError(e, t) {
      throw e;
    }
    addBackpatchEntry(e, t, n) {
      const r = parseInt(e, 10),
        s = { attrName: t, value: n },
        i = this.backpatchMap.get(r) || [];
      (i.push(s), this.backpatchMap.set(r, i));
    }
    async render(e) {
      (this.openContainer(),
        await $e(this, e, {
          currentStyleScoped: null,
          parentComponentFrame: this.getComponentFrame(),
        }),
        await this.closeContainer());
    }
    setContext(e, t, n) {
      const r = e;
      let s = r.getProp(L);
      (s == null && r.setProp(L, (s = [])), k(s, t.id, n, 0, !0), this.addRoot(r));
    }
    resolveContext(e, t) {
      let n = e;
      for (; n; ) {
        const r = n.getProp(L);
        if (r != null && at(r, t.id, 0)) return Y(r, t.id, 0);
        n = n.parentComponent;
      }
    }
    getParentHost(e) {
      return e.parentComponent;
    }
    setHostProp(e, t, n) {
      return e.setProp(t, n);
    }
    getHostProp(e, t) {
      return e.getProp(t);
    }
    openContainer() {
      this.tag == 'html' && (this.write('<!DOCTYPE html>'), (this.$noScriptHere$ = -1));
      const e = this.renderOptions.containerAttributes || {},
        t = e[Be];
      ((e[ae] = 'paused'),
        (e[xn] = '2'),
        (e[Pn] = this.$version$ ?? 'dev'),
        (e[Be] = (t ? t + '-' : '') + 'ssr'),
        (e[In] = this.$buildBase$ || ''),
        (e[Dn] = this.$locale$),
        (e[On] = this.resolvedManifest.manifest.manifestHash),
        (e[Tn] = this.$instanceHash$),
        (this.$serverData$.containerAttributes = e));
      const n = Object.entries(e).reduce((r, [s, i]) => (r.push(s, i), r), []);
      this.openElement(this.tag, n);
    }
    closeContainer() {
      return this.closeElement();
    }
    openElement(e, t, n, r) {
      this.qlInclude === 1 &&
        (this.$noScriptHere$ === 0 && this.size > 30 * 1024
          ? this.emitQwikLoaderInline()
          : (e === 'noscript' || e === 'template' || e === 'body') && this.$noScriptHere$++);
      let s;
      ((this.lastNode = null),
        !(ze(e, t) || ze(e, n)) &&
          this.currentElementFrame &&
          Tr(this.currentElementFrame.vNodeData),
        this.createAndPushFrame(e, this.depthFirstElementCount++, r),
        Mr(this.currentElementFrame.vNodeData),
        this.write('<'),
        this.write(e));
      const o = this.getOrCreateLastNode();
      return (
        t && (s = this.writeAttrs(e, t, !1, r)),
        this.write(' ' + Bn),
        n && n.length && (s = this.writeAttrs(e, n, !0, r) || s),
        this.write('>'),
        o && o.setTreeNonUpdatable(),
        s
      );
    }
    closeElement() {
      if (this.shouldEmitDataBeforeClosingElement()) {
        this.onRenderDone();
        const e = Ce();
        return I(
          I(this.emitContainerData(), () => this._closeElement()),
          () => {
            this.timing.snapshot = e();
          }
        );
      }
      this._closeElement();
    }
    shouldEmitDataBeforeClosingElement() {
      const e = this.currentElementFrame;
      return (e.parent === null && e.elementName !== 'html') || e.elementName === 'body';
    }
    onRenderDone() {
      (this.drainCleanupQueue(), (this.timing.render = this.renderTimer()));
    }
    drainCleanupQueue() {
      let e = this.cleanupQueue.pop();
      for (; e; ) {
        for (let t = 0; t < e.length; t++) {
          const n = e[t];
          zr(n) && n.$destroy$();
        }
        e = this.cleanupQueue.pop();
      }
    }
    _closeElement() {
      const t = this.popFrame().elementName;
      (Or(t) || (this.write('</'), this.write(t), this.write('>')),
        (this.lastNode = null),
        this.qlInclude === 1 && (t === 'noscript' || t === 'template') && this.$noScriptHere$--);
    }
    openFragment(e) {
      ((this.lastNode = null),
        Lr(this.currentElementFrame.vNodeData, e),
        this.getOrCreateLastNode());
    }
    closeFragment() {
      (Fr(this.currentElementFrame.vNodeData),
        this.currentComponentNode && this.currentComponentNode.setTreeNonUpdatable(),
        (this.lastNode = null));
    }
    openProjection(e) {
      this.openFragment(e);
      const t = this.getComponentFrame();
      t && (this.serializationCtx.$addRoot$(t.componentNode), t.projectionDepth++);
    }
    closeProjection() {
      const e = this.getComponentFrame();
      (e && e.projectionDepth--, this.closeFragment());
    }
    openComponent(e) {
      (this.openFragment(e),
        (this.currentComponentNode = this.getOrCreateLastNode()),
        this.componentStack.push(new Ue(this.currentComponentNode)));
    }
    getComponentFrame(e = 0) {
      const n = this.componentStack.length - e - 1;
      return n >= 0 ? this.componentStack[n] : null;
    }
    getParentComponentFrame() {
      const e = this.getComponentFrame()?.projectionDepth || 0;
      return this.getComponentFrame(e);
    }
    closeComponent() {
      (this.componentStack.pop().releaseUnclaimedProjections(this.unclaimedProjections),
        this.closeFragment(),
        (this.currentComponentNode = this.currentComponentNode?.parentComponent || null));
    }
    textNode(e) {
      (this.write(oe(e)), jr(this.currentElementFrame.vNodeData, e.length), (this.lastNode = null));
    }
    htmlNode(e) {
      this.write(e);
    }
    commentNode(e) {
      this.write('<!--' + e + '-->');
    }
    addRoot(e) {
      return this.$noMoreRoots$
        ? this.serializationCtx.$hasRootId$(e)
        : this.serializationCtx.$addRoot$(e);
    }
    getOrCreateLastNode() {
      return (
        this.lastNode ||
          (this.lastNode = Qr(
            this.currentComponentNode,
            this.currentElementFrame.vNodeData,
            this.currentElementFrame.depthFirstElementIdx + 1,
            this.cleanupQueue,
            this.currentElementFrame.currentFile
          )),
        this.lastNode
      );
    }
    addUnclaimedProjection(e, t, n) {
      this.unclaimedProjections.push(e, null, t, n);
    }
    $processInjectionsFromManifest$() {
      const e = this.resolvedManifest.manifest.injections;
      if (e)
        for (let t = 0; t < e.length; t++) {
          const n = e[t],
            r = W(n.tag, null, n.attributes || {}, null, 0, null);
          n.location === 'head'
            ? this.additionalHeadNodes.push(r)
            : this.additionalBodyNodes.push(r);
        }
    }
    $appendStyle$(e, t, n, r) {
      if (r) {
        const s = this.getComponentFrame(0);
        s.scopedStyleIds.add(t);
        const i = Gn(s.scopedStyleIds);
        this.setHostProp(n, ve, i);
      }
      this.styleIds.has(t) ||
        (this.styleIds.add(t),
        this.currentElementFrame?.elementName === 'html'
          ? this.additionalHeadNodes.push(
              q('style', null, { dangerouslySetInnerHTML: e, [_e]: t }, null, 0, t)
            )
          : this._styleNode(t, e));
    }
    _styleNode(e, t) {
      (this.openElement('style', [_e, e]), this.write(t), this.closeElement());
    }
    emitContainerData() {
      return I(this.emitUnclaimedProjection(), () =>
        I(this.emitStateData(), () => {
          ((this.$noMoreRoots$ = !0),
            this.emitVNodeData(),
            Nr(this, this.renderOptions, this.$serverData$?.nonce),
            this.emitSyncFnsData(),
            this.emitPatchDataIfNeeded(),
            this.emitExecutorIfNeeded(),
            this.emitQwikLoaderAtBottomIfNeeded());
        })
      );
    }
    emitVNodeData() {
      if (!this.serializationCtx.$roots$.length) return;
      this.openElement('script', ['type', 'qwik/vnode']);
      const e = [],
        t = this.vNodeDatas;
      let n = 0;
      for (let r = 0; r < t.length; r++) {
        const s = t[r],
          i = s[0];
        if (
          i & 16 &&
          ((n = this.emitVNodeSeparators(n, r)), i & 8 && this.write(w.REFERENCE_CH), i & 7)
        ) {
          let o = null,
            a = 0;
          for (let c = 1; c < s.length; c++) {
            const l = s[c];
            Array.isArray(l)
              ? (e.push(o), (o = l))
              : l === St
                ? (a++, this.write(g.OPEN_CHAR))
                : l === Ne
                  ? (o && (this.writeFragmentAttrs(o), (o = e.pop())),
                    a--,
                    this.write(g.CLOSE_CHAR))
                  : l === ke
                    ? o &&
                      o.length &&
                      (this.write(g.SEPARATOR_CHAR),
                      this.writeFragmentAttrs(o),
                      this.write(g.SEPARATOR_CHAR),
                      (o = e.pop()))
                    : l >= 0
                      ? this.write(Nt(l))
                      : this.write(String(0 - l));
          }
          for (; a-- > 0; )
            (o && (this.writeFragmentAttrs(o), (o = e.pop())), this.write(g.CLOSE_CHAR));
        }
      }
      this.closeElement();
    }
    writeFragmentAttrs(e) {
      for (let t = 0; t < e.length; ) {
        const n = e[t++];
        let r = e[t++],
          s = !1;
        if (typeof r != 'string') {
          const a = this.addRoot(r);
          if (a === void 0) continue;
          r = String(a);
        }
        switch (n) {
          case ve:
            this.write(g.SCOPED_STYLE_CHAR);
            break;
          case $n:
            this.write(g.RENDER_FN_CHAR);
            break;
          case Ln:
            this.write(g.ID_CHAR);
            break;
          case Mn:
            this.write(g.PROPS_CHAR);
            break;
          case Fn:
            ((s = !0), this.write(g.KEY_CHAR));
            break;
          case dt:
            this.write(g.SEQ_CHAR);
            break;
          case Qn:
            this.write(g.SEQ_IDX_CHAR);
            break;
          case ut:
            this.write(g.BACK_REFS_CHAR);
            break;
          case z:
            this.write(g.SLOT_PARENT_CHAR);
            break;
          case L:
            this.write(g.CONTEXT_CHAR);
            break;
          case pe:
            this.write(g.SLOT_CHAR);
            break;
          default:
            (this.write(g.SEPARATOR_CHAR), this.write(n), this.write(g.SEPARATOR_CHAR));
        }
        const i = s ? encodeURI(r) : r;
        (s ? i !== r : !1)
          ? (this.write(g.SEPARATOR_CHAR), this.write(i), this.write(g.SEPARATOR_CHAR))
          : this.write(r);
      }
    }
    emitStateData() {
      if (this.serializationCtx.$roots$.length)
        return (
          this.openElement('script', ['type', 'qwik/state']),
          I(this.serializationCtx.$serialize$(), () => {
            this.closeElement();
          })
        );
    }
    emitSyncFnsData() {
      const e = this.serializationCtx.$syncFns$;
      if (e.length) {
        const t = ['q:func', 'qwik/json'];
        (this.renderOptions.serverData?.nonce &&
          t.push('nonce', this.renderOptions.serverData.nonce),
          this.openElement('script', t),
          this.write(Zr.replace('HASH', this.$instanceHash$)),
          this.write('['),
          this.writeArray(e, ','),
          this.write(']'),
          this.closeElement());
      }
    }
    emitPatchDataIfNeeded() {
      const e = [];
      for (const [t, n] of this.backpatchMap) for (const r of n) e.push(t, r.attrName, r.value);
      if ((this.backpatchMap.clear(), e.length > 0)) {
        this.isBackpatchExecutorEmitted = !0;
        const t = ['type', Hn];
        (this.renderOptions.serverData?.nonce &&
          t.push('nonce', this.renderOptions.serverData.nonce),
          this.openElement('script', t),
          this.write(JSON.stringify(e)),
          this.closeElement());
      }
    }
    emitExecutorIfNeeded() {
      if (!this.isBackpatchExecutorEmitted) return;
      const e = ['type', 'text/javascript'];
      (this.renderOptions.serverData?.nonce && e.push('nonce', this.renderOptions.serverData.nonce),
        this.openElement('script', e));
      const t = Dr({ debug: he });
      (this.write(t), this.closeElement());
    }
    emitPreloaderPre() {
      Ar(this, this.renderOptions.preloader, this.renderOptions.serverData?.nonce);
    }
    isStatic() {
      return this.serializationCtx.$eventQrls$.size === 0;
    }
    emitQwikLoaderAtTopIfNeeded() {
      if (this.qlInclude === 2) return;
      if (this.qlInclude === 0) {
        this.qlInclude = 2;
        const t = this.$buildBase$ + this.resolvedManifest.manifest.qwikLoader,
          n = ['rel', 'modulepreload', 'href', t],
          r = this.renderOptions.serverData?.nonce;
        (r && n.push('nonce', r), this.openElement('link', n), this.closeElement());
        const s = ['async', !0, 'type', 'module', 'src', t];
        (r && s.push('nonce', r), this.openElement('script', s), this.closeElement());
      }
      const e = this.resolvedManifest.manifest.core;
      if (e) {
        const t = ['rel', 'modulepreload', 'href', `${this.$buildBase$}${e}`],
          n = this.renderOptions.serverData?.nonce;
        (n && t.push('nonce', n), this.openElement('link', null, t), this.closeElement());
      }
    }
    emitQwikLoaderInline() {
      this.qlInclude = 2;
      const e = Ir({ debug: this.renderOptions.debug }),
        t = ['id', 'qwikloader', 'async', !0, 'type', 'module'];
      (this.renderOptions.serverData?.nonce && t.push('nonce', this.renderOptions.serverData.nonce),
        this.openElement('script', t),
        this.write(e),
        this.closeElement());
    }
    emitQwikLoaderAtBottomIfNeeded() {
      this.isStatic() ||
        (this.qlInclude !== 2 && this.emitQwikLoaderInline(),
        this.emitQwikEvents(
          Array.from(this.serializationCtx.$eventNames$, (e) => JSON.stringify(e))
        ));
    }
    emitQwikEvents(e) {
      if (e.length > 0) {
        const t = [],
          n = this.renderOptions.serverData?.nonce;
        (n && t.push('nonce', n),
          this.openElement('script', t),
          this.write('(window.qwikevents||(window.qwikevents=[])).push('),
          this.writeArray(e, ', '),
          this.write(')'),
          this.closeElement());
      }
    }
    async emitUnclaimedProjection() {
      const e = this.unclaimedProjections;
      if (e.length) {
        const t = this.currentComponentNode;
        try {
          this.openElement(jn, ['hidden', !0, 'aria-hidden', 'true'], null);
          let n = 0,
            r = null,
            s = null,
            i = null;
          for (let o = 0; o < e.length; o += 4)
            this.unclaimedProjectionComponentFrameQueue.push(e[o]);
          for (; n < e.length; ) {
            const o = e[n++];
            if (o instanceof Ue)
              ((r = this.currentComponentNode = o.componentNode), (s = o), (i = e[n++]));
            else if (typeof o == 'string') {
              const a = e[n++];
              if (!s?.hasSlot(o)) {
                s && s.componentNode.removeProp(o);
                continue;
              }
              (this.unclaimedProjectionComponentFrameQueue.shift(),
                this.openFragment(he ? [Rn, 'P', z, r.id] : [z, r.id]));
              const c = this.getOrCreateLastNode();
              (c.vnodeData && (c.vnodeData[0] |= 16),
                r?.setProp(o, c.id),
                await $e(this, a, { currentStyleScoped: i, parentComponentFrame: null }),
                this.closeFragment());
            } else throw Error();
          }
          this.closeElement();
        } finally {
          this.currentComponentNode = t;
        }
      }
    }
    emitVNodeSeparators(e, t) {
      let n = t - e;
      for (; n != 0; )
        n >= 8192
          ? (this.write(w.ADVANCE_8192_CH), (n -= 8192))
          : (n & 4096 && this.write(w.ADVANCE_4096_CH),
            n & 2048 && this.write(w.ADVANCE_2048_CH),
            n & 1024 && this.write(w.ADVANCE_1024_CH),
            n & 512 && this.write(w.ADVANCE_512_CH),
            n & 256 && this.write(w.ADVANCE_256_CH),
            n & 128 && this.write(w.ADVANCE_128_CH),
            n & 64 && this.write(w.ADVANCE_64_CH),
            n & 32 && this.write(w.ADVANCE_32_CH),
            n & 16 && this.write(w.ADVANCE_16_CH),
            n & 8 && this.write(w.ADVANCE_8_CH),
            n & 4 && this.write(w.ADVANCE_4_CH),
            n & 2 && this.write(w.ADVANCE_2_CH),
            n & 1 && this.write(w.ADVANCE_1_CH),
            (n = 0));
      return t;
    }
    createAndPushFrame(e, t, n) {
      const s = {
        tagNesting: 10,
        parent: this.currentElementFrame,
        elementName: e,
        depthFirstElementIdx: t,
        vNodeData: [0],
        currentFile: null,
      };
      ((this.currentElementFrame = s), this.vNodeDatas.push(s.vNodeData));
    }
    popFrame() {
      const e = this.currentElementFrame;
      return ((this.currentElementFrame = e.parent), e);
    }
    write(e) {
      ((this.size += e.length), this.writer.write(e));
    }
    writeArray(e, t) {
      for (let n = 0; n < e.length; n++) {
        const r = e[n];
        (n > 0 && this.write(t), this.write(r));
      }
    }
    writeAttrs(e, t, n, r) {
      let s;
      if (t.length)
        for (let i = 0; i < t.length; i++) {
          let o = t[i++],
            a = t[i],
            c = null;
          if (Wr(o)) continue;
          if (o === 'class' && Array.isArray(a)) {
            const [u, d] = a;
            ((a = u), (c = d));
          }
          if (o === 'ref') {
            const u = this.getOrCreateLastNode();
            if (xe(a)) {
              a.$untrackedValue$ = new ce(u);
              continue;
            } else if (typeof a == 'function') {
              a(new ce(u));
              continue;
            } else {
              if (a == null) continue;
              throw ct(15, [r]);
            }
          }
          if (xe(a)) {
            const u = this.getOrCreateLastNode(),
              d = new Ft({ $scopedStyleIdPrefix$: c, $isConst$: n });
            a = this.trackSignalValue(a, u, o, d);
          }
          if (o === Vn && (a && ((s = String(a)), (o = ae), (a = 'html')), e === 'style')) continue;
          if (e === 'textarea' && o === 'value') {
            if (a && typeof a != 'string') continue;
            ((s = oe(a || '')), (o = ae), (a = 'text'));
          }
          const l = tr(o, a, c);
          if (l != null && l !== !1 && (this.write(' '), this.write(o), l !== !0)) {
            this.write('="');
            const u = oe(String(l));
            (this.write(u), this.write('"'));
          }
        }
      return s;
    }
  },
  ze = (e, t) => {
    if (e === 'style' && t != null)
      for (let n = 0; n < t.length; n = n + 2) {
        const r = t[n];
        if (r === _e || r === ve) return !0;
      }
    return !1;
  };
function zr(e) {
  return e && typeof e == 'object' && typeof e.$destroy$ == 'function';
}
function Wr(e) {
  for (let t = 0; t < e.length; t++) {
    const n = e.charCodeAt(t);
    if (
      n === 62 ||
      n === 47 ||
      n === 61 ||
      n === 34 ||
      n === 39 ||
      n === 9 ||
      n === 10 ||
      n === 12 ||
      n === 32
    )
      return !0;
  }
  return !1;
}
function Gr() {
  return Math.random().toString(36).slice(2);
}
var Xr = async (e, t) => {
  const n = { firstFlush: 0, render: 0, snapshot: 0 },
    r = t.containerTagName ?? 'html',
    s = br(t),
    i = kt(t.manifest),
    o =
      typeof t.locale == 'function'
        ? t.locale(t)
        : t.serverData?.locale || t.locale || t.containerAttributes?.locale || '',
    { stream: a, flush: c, networkFlushes: l } = Kr(t, n),
    u = Hr({
      tagName: r,
      locale: o,
      writer: a,
      timing: n,
      buildBase: s,
      resolvedManifest: i,
      renderOptions: t,
    });
  (await gr(t, i), await u.render(e), await u.$scheduler$(255).$returnValue$, c());
  const d = Yr(u),
    h = d.resources.some((p) => p._cache !== 1 / 0);
  return {
    snapshotResult: d,
    flushes: l,
    manifest: i?.manifest,
    size: u.size,
    isStatic: !h,
    timing: n,
  };
};
function Yr(e) {
  return !e.isStatic()
    ? {
        funcs: Array.from(e.serializationCtx.$syncFns$),
        mode: 'listeners',
        qrls: Array.from(e.serializationCtx.$eventQrls$),
        resources: Array.from(e.serializationCtx.$resources$),
      }
    : {
        funcs: [],
        mode: 'static',
        qrls: [],
        resources: Array.from(e.serializationCtx.$resources$),
      };
}
function Kr(e, t) {
  const n = Ce();
  let r = e.stream,
    s = 0,
    i = '',
    o = 0;
  const a = e.streaming?.inOrder ?? {
      strategy: 'auto',
      maximumInitialChunk: 2e4,
      maximumChunk: 1e4,
    },
    c = r;
  function l() {
    i && (c.write(i), (i = ''), (s = 0), o++, o === 1 && (t.firstFlush = n()));
  }
  function u(d) {
    const h = d.length;
    ((s += h), (i += d));
  }
  switch (a.strategy) {
    case 'disabled':
      r = {
        write(_) {
          We(_) || u(_);
        },
      };
      break;
    case 'direct':
      r = {
        write(_) {
          We(_) || c.write(_);
        },
      };
      break;
    case 'auto':
      let d = 0,
        h = !1;
      const m = a.maximumChunk ?? 0,
        p = a.maximumInitialChunk ?? 0;
      r = {
        write(_) {
          if (_ == null) return;
          (_ === '<!--' + ht + '-->'
            ? (h = !0)
            : _ === '<!--' + ft + '-->'
              ? d++
              : _ === '<!--' + mt + '-->'
                ? (d--, d === 0 && (h = !0))
                : u(_),
            d === 0 && (h || s >= (o === 0 ? p : m)) && ((h = !1), l()));
        },
      };
      break;
  }
  return { stream: r, flush: l, networkFlushes: o };
}
function We(e) {
  return (
    e == null || e === '<!--' + ht + '-->' || e === '<!--' + ft + '-->' || e === '<!--' + mt + '-->'
  );
}
function kt(e) {
  const t = e ? { ...He, ...e } : He;
  if (!t || 'mapper' in t) return t;
  if (t.mapping) {
    const n = {};
    return (
      Object.entries(t.mapping).forEach(([r, s]) => {
        n[Z(r)] = [r, s];
      }),
      { mapper: n, manifest: t, injections: t.injections || [] }
    );
  }
}
var Zr = 'document["qFuncs_HASH"]=';
async function Ns(e) {
  const t = wt({}, kt(e));
  Ye(t);
}
const Jr = S('qc-s'),
  es = S('qc-c'),
  qt = S('qc-ic'),
  Rt = S('qc-h'),
  $t = S('qc-l'),
  xt = S('qc-n'),
  ts = S('qc-a'),
  ns = S('qc-ir'),
  rs = S('qc-p'),
  ss = () => ee(Rt),
  is = () => ee($t),
  os = () => ee(xt),
  as = () => Je(G('qwikrouter')),
  ls = (e, t) => {
    if (!navigator.connection?.saveData && t && t.href) {
      const n = new URL(t.href);
      (Se(n.pathname),
        t.hasAttribute('data-prefetch') && tt(n, t, { preloadRouteBundles: !1, isPrefetch: !0 }));
    }
  },
  cs = (e, t) => {
    const [n, r, s, i] = J();
    e.defaultPrevented &&
      t.href &&
      (t.setAttribute('aria-pressed', 'true'),
      n(t.href, { forceReload: r, replaceState: s, scroll: i }).then(() => {
        t.removeAttribute('aria-pressed');
      }));
  },
  us = (e, t) => {
    const n = new URL(t.href);
    Se(n.pathname, 1);
  },
  ds = (e) => {
    const t = os(),
      n = is(),
      r = e.href,
      s = B(),
      { onClick$: i, prefetch: o, reload: a, replaceState: c, scroll: l, ...u } = e,
      d = ne(() => ln({ ...u, reload: a }, n));
    u.href = d || r;
    const h = ne(() => (!!d && o !== !1 && o !== 'js') || void 0),
      p = ne(() => h || (!!d && o !== !1 && cn(d, n))) ? C(ls, 's_wWjZpcfdDTc') : void 0,
      _ = d
        ? Ke((v) => {
            v.metaKey || v.ctrlKey || v.shiftKey || v.altKey || v.preventDefault();
          }, 'event=>{if(!(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)){event.preventDefault();}}')
        : void 0,
      b = d ? C(cs, 's_sUh5Icldn3g', [t, a, c, l]) : void 0,
      E = C(us, 's_7ekIjq0Ky3k');
    return (
      Ht(Ze('s_s0AOvxtg8Ro', [s, p, u, n])),
      W(
        'a',
        {
          ref: s,
          'q:link': !!d,
          ...de(u),
          ...ue(u),
          onClick$: [_, E, i, b],
          'data-prefetch': h,
          onMouseOver$: [u.onMouseOver$, p],
          onFocus$: [u.onFocus$, p],
        },
        { onQVisible$: [] },
        q(Bt, null, null, null, 3, 'Xx_2'),
        0,
        'Xx_3'
      )
    );
  },
  ks = Ae(C(ds, 's_R97DZWsnvoc')),
  hs = (e, t, n, r, s) =>
    Zt(r, () => {
      const i = Pt(s),
        o = (c) => {
          const l = c.__id;
          if (c.__brand === 'server_loader' && !(l in e.loaders))
            throw new Error(
              'You can not get the returned data of a loader that has not been executed for this request.'
            );
          const u = e.loaders[l];
          if (un(u))
            throw new Error(
              'Loaders returning a promise can not be resolved for the head function.'
            );
          return u;
        },
        a = [];
      for (const c of n) {
        const l = c?.head;
        l && (typeof l == 'function' ? a.unshift(l) : typeof l == 'object' && Ge(i, l));
      }
      if (a.length) {
        const c = { head: i, withLocale: (l) => l(), resolveValue: o, ...t };
        for (const l of a) Ge(i, l(c));
      }
      return i;
    }),
  Ge = (e, t) => {
    (typeof t.title == 'string' && (e.title = t.title),
      Q(e.meta, t.meta),
      Q(e.links, t.links),
      Q(e.styles, t.styles),
      Q(e.scripts, t.scripts),
      Object.assign(e.frontmatter, t.frontmatter));
  },
  Q = (e, t) => {
    if (Array.isArray(t))
      for (const n of t) {
        if (typeof n.key == 'string') {
          const r = e.findIndex((s) => s.key === n.key);
          if (r > -1) {
            e[r] = n;
            continue;
          }
        }
        e.push(n);
      }
  },
  Pt = (e) => ({
    title: e?.title || '',
    meta: [...(e?.meta || [])],
    links: [...(e?.links || [])],
    styles: [...(e?.styles || [])],
    scripts: [...(e?.scripts || [])],
    frontmatter: { ...e?.frontmatter },
  }),
  fs = Xt(Ze('s_JxM9f0jYvNc')),
  ms =
    '@layer qwik{@supports selector(html:active-view-transition-type(type)){html:active-view-transition-type(qwik-navigation){:root{view-transition-name:none}}}@supports not selector(html:active-view-transition-type(type)){:root{view-transition-name:none}}}',
  Xe = {},
  H = { navCount: 0 },
  ps = (e) => {},
  _s = async (e, t) => {
    const [n, r, s, i] = J(),
      {
        type: o = 'link',
        forceReload: a = e === void 0,
        replaceState: c = !1,
        scroll: l = !0,
      } = typeof t == 'object' ? t : { forceReload: t };
    H.navCount++;
    const u = s.value.dest,
      d = e === void 0 ? u : typeof e == 'number' ? e : x(e, i.url);
    if (Xe.$cbs$ && (a || typeof d == 'number' || !X(d, u) || !fe(d, u))) {
      const h = H.navCount,
        m = await Promise.all([...Xe.$cbs$.values()].map((p) => p(d)));
      if (h !== H.navCount || m.some(Boolean)) {
        h === H.navCount && o === 'popstate' && history.pushState(null, '', u);
        return;
      }
    }
    if (typeof d != 'number' && fe(d, u) && !(!a && X(d, u)))
      return (
        (s.value = { type: o, dest: d, forceReload: a, replaceState: c, scroll: l }),
        (n.value = void 0),
        (i.isNavigating = !0),
        new Promise((h) => {
          r.r = h;
        })
      );
  },
  vs = ({ track: e }) => {
    const [t, n, r, s, i, o, a, c, l, u, d, h, m, p] = J();
    async function _() {
      const [b, E] = e(() => [d.value, t.value]),
        v = Kt(''),
        P = h.url,
        O = E ? 'form' : b.type;
      b.replaceState;
      let y,
        N,
        R = null;
      if (((y = new URL(b.dest, h.url)), (R = i.loadedRoute), (N = i.response), R)) {
        const [qe, Re, It, Dt] = R,
          T = It,
          Ot = T[T.length - 1];
        (b.dest.search && X(y, P) && (y.search = b.dest.search),
          X(y, P) || (se(h, 'prevUrl'), (m.prevUrl = P)),
          m.url !== y && (se(h, 'url'), (m.url = y)),
          m.params !== Re && (se(h, 'params'), (m.params = Re)),
          (d.untrackedValue = { type: O, dest: y }));
        const $ = hs(N, h, T, v, p);
        ((n.headings = Ot.headings),
          (n.menu = Dt),
          (r.untrackedValue = Je(T)),
          (s.links = $.links),
          (s.meta = $.meta),
          (s.styles = $.styles),
          (s.scripts = $.scripts),
          (s.title = $.title),
          (s.frontmatter = $.frontmatter));
      }
    }
    return _();
  },
  qs = (e) => {
    Vt(C(ms, 's_7vVCXsPiLGY'));
    const t = as();
    if (!t?.params)
      throw new Error(
        'Missing Qwik Router Env Data for help visit https://github.com/QwikDev/qwik/issues/6237'
      );
    const n = G('url');
    if (!n) throw new Error('Missing Qwik URL Env Data');
    const r = G('documentHead');
    if (t.ev.originalUrl.pathname !== t.ev.url.pathname)
      throw new Error(
        'enableRequestRewrite is an experimental feature and is not enabled. Please enable the feature flag by adding `experimental: ["enableRequestRewrite"]` to your qwikVite plugin options.'
      );
    const s = new URL(n),
      i = { url: s, params: t.params, isNavigating: !1, prevUrl: void 0 },
      o = re(i, { deep: !1 }),
      a = {},
      c = Ut(),
      l = (y) => t.response.loadersSerializationStrategy.get(y) || nn,
      u = {},
      d = {};
    for (const [y, N] of Object.entries(t.response.loaders))
      ((u[y] = N), (d[y] = hn(u, y, s, l(y), c)));
    u[zt] = (y) => {
      const N = {};
      for (const [R, qe] of Object.entries(y)) N[R] = l(R) === 'always' ? qe : Wt;
      return N;
    };
    const h = B({ type: 'initial', dest: s, forceReload: !1, replaceState: !1, scroll: !0 }),
      m = re(() => Pt(r)),
      p = re({ headings: void 0, menu: void 0 }),
      _ = B(),
      b = t.response.action,
      E = b ? t.response.loaders[b] : void 0,
      v = B(
        E
          ? { id: b, data: t.response.formData, output: { result: E, status: t.response.status } }
          : void 0
      ),
      P = C(ps, 's_GJbDACO1M4Q'),
      O = C(_s, 's_n4khnvPM1tE', [v, a, h, o]);
    (A(es, p),
      A(qt, _),
      A(Rt, m),
      A($t, o),
      A(xt, O),
      A(Jr, d),
      A(ts, v),
      A(ns, h),
      A(rs, P),
      Gt(C(vs, 's_GXN8GJnlhnY', [v, p, _, m, t, O, d, u, a, e, h, o, i, r])));
  },
  gs = () => {
    if (!G('containerAttributes'))
      throw new Error('PrefetchServiceWorker component must be rendered on the server.');
    const n = ee(qt).value;
    if (n && n.length > 0) {
      const r = n.length;
      let s = null;
      for (let i = r - 1; i >= 0; i--)
        n[i].default && (s = q(n[i].default, null, null, s, 1, 'Xx_6'));
      return q(
        et,
        null,
        null,
        [
          s,
          q(
            'script',
            {
              'document:onQInit$': Ke(() => {
                ((i, o) => {
                  if (!i._qcs && o.scrollRestoration === 'manual') {
                    i._qcs = !0;
                    const a = o.state?._qRouterScroll;
                    (a && i.scrollTo(a.x, a.y), document.dispatchEvent(new Event('qcinit')));
                  }
                })(window, history);
              }, '()=>{((w,h)=>{if(!w._qcs&&h.scrollRestoration==="manual"){w._qcs=true;const s=h.state?._qRouterScroll;if(s){w.scrollTo(s.x,s.y);}document.dispatchEvent(new Event("qcinit"));}})(window,history);}'),
            },
            { 'document:onQCInit$': fs },
            null,
            2,
            'Xx_7'
          ),
        ],
        1,
        'Xx_8'
      );
    }
    return Yt;
  },
  Rs = Ae(C(gs, 's_ZqzYySEulAk')),
  $s = (e) => (t) => {
    const { jsx: n, options: r } = e(t);
    return Xr(n, r);
  },
  bs = (e) => {
    let t = ss();
    return (
      e && (t = { ...t, ...e }),
      q(
        et,
        null,
        null,
        [
          t.title && q('title', null, null, t.title, 1, 'Xx_12'),
          t.meta.map((n) => W('meta', { ...de(n) }, ue(n), null, 0, 'Xx_13')),
          t.links.map((n) => W('link', { ...de(n) }, ue(n), null, 0, 'Xx_14')),
          t.styles.map((n) => {
            const r = n.props || n;
            return De('style', {
              ...r,
              dangerouslySetInnerHTML: n.style || r.dangerouslySetInnerHTML,
              key: n.key,
            });
          }),
          t.scripts.map((n) => {
            const r = n.props || n;
            return De('script', {
              ...r,
              dangerouslySetInnerHTML: n.script || r.dangerouslySetInnerHTML,
              key: n.key,
            });
          }),
        ],
        1,
        'Xx_15'
      )
    );
  },
  xs = Ae(C(bs, 's_wN4EXdu8SGc'));
export {
  xs as D,
  Jt as L,
  Es as Q,
  Rs as R,
  tn as a,
  en as b,
  As as c,
  Cs as d,
  is as e,
  $s as f,
  ks as g,
  un as i,
  Ss as l,
  Ns as s,
  qs as u,
};
