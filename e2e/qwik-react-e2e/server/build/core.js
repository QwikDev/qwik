import { a as Io } from './build.js';
const Ro = /\.[mc]?js$/,
  Oo = 0,
  Do = 3,
  hs = new Map(),
  si = (e, t, n) => {
    if (n?.has(e)) return;
    const r = e.u;
    if (((e.u = t), !(r - e.u < 0.01) && e.h)) {
      ((n ||= new Set()), n.add(e));
      const s = 1 - e.u;
      for (const i of e.h) {
        const o = ii(i.m);
        if (o.u === 0) continue;
        let l;
        if (s === 1 || (s >= 0.99 && ar < 100)) (ar++, (l = Math.min(0.01, 1 - i.S)));
        else {
          const c = 1 - i.S * s,
            a = i.q,
            g = c / a;
          ((l = Math.max(0.02, o.u * g)), (i.q = g));
        }
        si(o, l, n);
      }
    }
  },
  ds = (e, t) => {
    const n = ii(e);
    n && n.u > t && si(n, t);
  };
let ar;
const Fo = (e, t) => {
    if (!e?.length) return;
    ar = 0;
    let n = 1 - t;
    if (Array.isArray(e))
      for (let r = e.length - 1; r >= 0; r--) {
        const s = e[r];
        typeof s == 'number' ? (n = 1 - s / 10) : ds(s, n);
      }
    else ds(e, n);
  },
  Lo = (e, t) => ({ m: e, i: Ro.test(e) ? Oo : Do, h: t, u: 1, B: Date.now(), p: 0, $: 0 }),
  ii = (e) => {
    let t = hs.get(e);
    return (t || ((t = Lo(e, void 0)), hs.set(e, t)), t);
  };
var Vo = Object.defineProperty,
  Mo = (e, t, n) =>
    t in e ? Vo(e, t, { enumerable: !0, configurable: !0, writable: !0, value: n }) : (e[t] = n),
  k = (e, t, n) => Mo(e, typeof t != 'symbol' ? t + '' : t, n),
  Qr = '2.0.0-beta.12-dev+8c74b3f-20251028092930',
  Qo = !1,
  qo = globalThis.qDynamicPlatform !== !1,
  Bo = '',
  Wo = (e, ...t) => qr(!1, e, ...t),
  Ho = (e, ...t) => {
    const n = qr(!1, e, ...t);
    debugger;
    throw n;
  },
  zo = (e, ...t) => {
    const n = qr(Qo, e, ...t);
    debugger;
    return n;
  },
  Uo = (e, ...t) => {},
  qr = (e, t, ...n) => {
    const r = t instanceof Error ? t : new Error(t);
    return (console.error('%cQWIK ERROR', Bo, r.message, ...n, r.stack), r);
  },
  oi = (e) => {
    const t = Object.getPrototypeOf(e);
    return t === Object.prototype || t === Array.prototype || t === null;
  },
  Ke = (e) => typeof e == 'object' && e !== null,
  Re = (e) => Array.isArray(e),
  li = (e) => typeof e == 'string',
  jo = (e) => typeof e == 'number',
  Be = (e) => typeof e == 'function',
  Ko = (e) => typeof e != 'object' && typeof e != 'function' && e !== null && e !== void 0,
  Go = (e, ...t) =>
    `Code(Q${e}) https://github.com/QwikDev/qwik/blob/main/packages/qwik/src/core/error/error.ts#L${8 + e}`,
  H = (e, t = []) => {
    const n = Go(e, ...t);
    return zo(n, ...t);
  },
  ci = '<sync>',
  ai = (e) => Oe(e) && e.$symbol$ == ci,
  Oe = (e) => typeof e == 'function' && typeof e.getSymbol == 'function',
  fi = (e) => {
    const t = e.lastIndexOf('_');
    return t > -1 ? e.slice(t + 1) : e;
  },
  ps = 'q:type',
  ge = 'q:renderFn',
  Br = '⚡️',
  rt = 'q:slot',
  Xo = 'q:sparent',
  Yo = 'q:s',
  fr = 'q:style',
  ui = 'style[q\\:style]',
  Jo = 'style[q\\:sstyle]',
  Zo = ui + ',' + Jo,
  _t = 'q:sstyle',
  zt = 'q:ctx',
  Et = 'q:brefs',
  el = 'qFuncs_',
  $i = (e, t) => e[el + t] || [],
  hi = 'q:base',
  tl = 'q:locale',
  nl = 'q:manifest-hash',
  di = 'q:instance',
  pi = 'q:container-island',
  rl = '/' + pi,
  gi = 'q:ignore',
  sl = '/' + gi,
  We = 'q:container',
  il = '/' + We,
  ol = 'q:template',
  ll = '[q\\:container]:not([q\\:container=html]):not([q\\:container=text])',
  ur = 'http://www.w3.org/1999/xhtml',
  $r = 'http://www.w3.org/2000/svg',
  hr = 'http://www.w3.org/1998/Math/MathML',
  cl = 'http://www.w3.org/1999/xlink',
  al = 'http://www.w3.org/XML/1998/namespace',
  fl = 'qResource',
  Wr = 'qRender',
  ul = 'qTask',
  Nn = '',
  $l = 'q:id',
  we = 'q:key',
  Ce = 'q:props',
  xt = 'q:seq',
  Jt = 'q:seqIdx',
  hl = 'q:',
  In = ':',
  dr = In + 'on',
  Cn = In + 'onIdx',
  gs = In + 'onFlags',
  $n = 'qkssr-f',
  Rn = ':',
  On = 'dangerouslySetInnerHTML',
  dl = () => ({
    isServer: Io,
    importSymbol(e, t, n) {
      {
        const o = fi(n),
          l = globalThis.__qwik_reg_symbols?.get(o);
        if (l) return l;
      }
      if (!t) throw H(14, [n]);
      if (!e) throw H(13, [t, n]);
      const r = pl(e.ownerDocument, e, t).toString(),
        s = new URL(r);
      return ((s.hash = ''), import(s.href).then((o) => o[n]));
    },
    raf: (e) =>
      new Promise((t) => {
        requestAnimationFrame(() => {
          t(e());
        });
      }),
    chunkForSymbol(e, t) {
      return [e, t ?? '_'];
    },
  }),
  pl = (e, t, n) => {
    const r = e.baseURI,
      s = new URL(t.getAttribute(hi) ?? r, r);
    return new URL(n, s);
  },
  Hr = dl(),
  pf = (e) => (Hr = e),
  mi = () => Hr,
  be = () => (qo ? Hr.isServer : !1),
  Si = (e) => e && typeof e.nodeType == 'number',
  gl = (e) => e.nodeType === 1,
  pr = 100,
  K = (e) => !!e && typeof e == 'object' && typeof e.then == 'function',
  Dn = (e, t, n) => {
    try {
      const r = e();
      return K(r) ? r.then(t, n) : t(r);
    } catch (r) {
      return n(r);
    }
  },
  Zt = (e, t) => (K(e) ? e.then(t, ml) : t(e)),
  ml = (e) => {
    Ho(e);
  },
  Sl = (e) =>
    new Promise((t) => {
      setTimeout(t, e);
    });
function Ee(e, t = 0) {
  const n = (r) => {
    if (K(r) && t < pr) return r.then(Ee.bind(null, e, t++));
    throw r;
  };
  try {
    const r = e();
    return K(r) ? r.catch((s) => n(s)) : r;
  } catch (r) {
    return n(r);
  }
}
function z(e, t, ...n) {}
function Vt(e, t, n, ...r) {}
function ie(e, t, ...n) {}
function le(e, t, ...n) {}
function yl(e, t, ...n) {}
var Nt = void 0,
  ct;
import('node:async_hooks')
  .then((e) => {
    ct = new e.AsyncLocalStorage();
  })
  .catch(() => {});
function gf(e) {
  if (ct) {
    const t = ct.getStore();
    if (t) return t;
  }
  if (Nt === void 0) {
    const t = Se();
    return t && t.$locale$ ? t.$locale$ : e;
  }
  return Nt;
}
function mf(e, t) {
  if (ct) return ct.run(e, t);
  const n = Nt;
  try {
    return ((Nt = e), t());
  } finally {
    Nt = n;
  }
}
function wl(e) {
  if (ct) {
    ct.enterWith(e);
    return;
  }
  Nt = e;
}
var Bt = { REFERENCE: 126, ADVANCE_1: 33, ADVANCE_8192: 46 },
  G = {
    OPEN: 123,
    CLOSE: 125,
    SCOPED_STYLE: 59,
    RENDER_FN: 60,
    ID: 61,
    PROPS: 62,
    SLOT_PARENT: 63,
    KEY: 64,
    SEQ: 91,
    CONTEXT: 93,
    SEQ_IDX: 94,
    BACK_REFS: 96,
    SEPARATOR: 124,
    SLOT: 126,
  },
  lt = (e, t, n) => {
    ie();
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
  Gt = (e, t, n, r, s = !1) => {
    const i = lt(e, t, r);
    i >= 0
      ? n == null && !s
        ? e.splice(i, 2)
        : (e[i + 1] = n)
      : (n != null || s) && e.splice(i ^ -1, 0, t, n);
  },
  yi = (e, t, n) => {
    const r = lt(e, t, n);
    return r >= 0 ? e[r + 1] : null;
  },
  bl = (e, t, n) => lt(e, t, n) >= 0,
  wi = (e) => e === 'foreignObject',
  vl = (e) => e === 'svg' || wi(e),
  El = (e) => e === 'math',
  Nl = (e) => (e.flags & 192) === 0,
  Cl = (e) => {
    switch (hc(e)) {
      case $r:
        return 64;
      case hr:
        return 128;
      default:
        return 0;
    }
  };
function Pl(e, t, n) {
  const { elementNamespace: r, elementNamespaceFlag: s } = zr(t, n);
  let i = [];
  if (r === ur) i = Ot(e, n);
  else {
    const o = Ot(e, n, !0);
    for (let l = 0; l < o.length; l++) {
      const c = o[l];
      if (Y(c)) {
        i.push(c.textNode);
        continue;
      }
      if ((c.flags & 192) === (t.flags & 192)) {
        i.push(c.element);
        continue;
      }
      const a = Al(c, t, r, s);
      a && i.push(a);
    }
  }
  return i;
}
function bi(e, t, n, r = !1) {
  const s = e.ownerDocument.createElementNS(n, t);
  for (const i of e.attributes) i.name !== Rn && s.setAttribute(i.name, i.value);
  if (r)
    for (const i of e.childNodes) {
      const o = i.nodeType;
      o === 3 ? s.appendChild(i.cloneNode()) : o === 1 && s.appendChild(bi(i, i.localName, n, r));
    }
  return s;
}
function Al(e, t, n, r) {
  Rt(e);
  let s = e,
    i = null,
    o = null,
    l = null;
  for (; s; ) {
    let c = null,
      a = null;
    if (te(s)) {
      c = s.element;
      const b = Ne(s),
        P = s.parent,
        m = o == null ? t : P && Mn(P);
      if (m) {
        const C = zr(m, Ne(s));
        ((n = C.elementNamespace), (r = C.elementNamespaceFlag));
      }
      const d = pe(s);
      if (
        ((a = bi(c, b, n, !d)),
        c.remove(),
        o == null && (o = a),
        l && l.appendChild(a),
        (s.element = a),
        (s.flags &= -193),
        (s.flags |= r),
        d)
      ) {
        ((s = d), (l = a));
        continue;
      } else if (Ri(c)) {
        const C = lo(c);
        if (C) {
          const p = pe(C.rootVNode);
          if (p) {
            ((s = p), (l = a));
            continue;
          }
        }
      }
    }
    if (s === e) return o;
    const g = s.nextSibling;
    if (g) {
      s = g;
      continue;
    }
    for (i = s.parent; i; ) {
      if (i === e) return o;
      const b = i.nextSibling;
      if (b) return ((s = b), o);
      i = i.parent;
    }
    if (i == null) return o;
  }
  return o;
}
function _l(e) {
  return typeof e == 'string' ? vl(e) : (e.flags & 64) !== 0;
}
function xl(e) {
  return typeof e == 'string' ? El(e) : (e.flags & 128) !== 0;
}
function zr(e, t) {
  const n = e ? !!Ne(e) && Nl(e) : !0,
    r = n ? !1 : wi(Ne(e));
  let s = ur,
    i = 0;
  const o = typeof t == 'string' || te(t);
  if (o && _l(t)) ((s = $r), (i = 64));
  else if (o && xl(t)) ((s = hr), (i = 128));
  else if (e && !r && !n) {
    const l = (e.flags & 64) !== 0,
      c = (e.flags & 128) !== 0;
    ((s = l ? $r : c ? hr : ur), (i = e.flags & 192));
  }
  return { elementNamespace: s, elementNamespaceFlag: i };
}
function kl(e) {
  switch (e) {
    case 'xlink:href':
    case 'xlink:actuate':
    case 'xlink:arcrole':
    case 'xlink:role':
    case 'xlink:show':
    case 'xlink:title':
    case 'xlink:type':
      return cl;
    case 'xml:base':
    case 'xml:lang':
    case 'xml:space':
      return al;
    default:
      return null;
  }
}
var Tl = (e, t) => {
    for (const [n, r] of t) e.set(n, r);
    return e;
  },
  oe = Symbol('invalid'),
  se = Symbol('backRef'),
  Pn = Symbol('store.target'),
  vi = Symbol('store.handler'),
  Qe = Symbol('store.all'),
  Ge = class {
    constructor(e, t) {
      (k(this, '$untrackedValue$'),
        k(this, '$effects$', null),
        k(this, '$container$', null),
        k(this, '$wrappedSignal$', null),
        (this.$container$ = e),
        (this.$untrackedValue$ = t));
    }
    force() {
      this.$container$?.$scheduler$(7, null, this, this.$effects$);
    }
    get untrackedValue() {
      return this.$untrackedValue$;
    }
    set untrackedValue(e) {
      this.$untrackedValue$ = e;
    }
    get value() {
      return gr(
        this,
        () => this.$effects$ || (this.$effects$ = new Set()),
        () => this.untrackedValue
      );
    }
    set value(e) {
      e !== this.$untrackedValue$ &&
        ((this.$untrackedValue$ = e), this.$container$?.$scheduler$(7, null, this, this.$effects$));
    }
    valueOf() {}
    toString() {
      return this.constructor.name;
    }
    toJSON() {
      return { value: this.$untrackedValue$ };
    }
  },
  Il = (e, t, n) => {
    (fo(n, t), uo(t, e), $o(t, e.$container$));
  },
  gr = (e, t, n) => {
    const r = Se();
    if (r) {
      if (e.$container$ === null) {
        if (!r.$container$) return n();
        e.$container$ = r.$container$;
      } else ie(!r.$container$ || r.$container$ === e.$container$);
      const s = r.$effectSubscriber$;
      s && Il(e, s, t());
    }
    return n();
  },
  Me = Symbol('CONST'),
  Pe = Symbol('VAR'),
  kt = Symbol('OWNER'),
  Tt = Symbol('UNINITIALIZED'),
  Rl = '$',
  tt = (e) => e.startsWith('on:') || e.startsWith('on-window:') || e.startsWith('on-document:');
function Xt(e) {
  if (e.endsWith(Rl)) {
    const [t, n] = Dl(e);
    if (n !== -1) {
      const r = e.slice(n, -1);
      return r === 'DOMContentLoaded'
        ? t + '-d-o-m-content-loaded'
        : Ol(r.charAt(0) === '-' ? r.slice(1) : r.toLowerCase(), t);
    }
  }
  return null;
}
function Ol(e, t) {
  const n = en(e);
  return t + n;
}
function Dl(e) {
  let t = 'on:',
    n = -1;
  return (
    e.startsWith('on')
      ? ((t = 'on:'), (n = 2))
      : e.startsWith('window:on')
        ? ((t = 'on-window:'), (n = 9))
        : e.startsWith('document:on') && ((t = 'on-document:'), (n = 11)),
    [t, n]
  );
}
function Ei(e) {
  return e.startsWith('preventdefault:');
}
var en = (e) => e.replace(/([A-Z-])/g, (t) => '-' + t.toLowerCase()),
  mr = (e) =>
    e.startsWith('on:')
      ? ['', e.substring(3)]
      : e.startsWith('on-window:')
        ? ['window', e.substring(10)]
        : ['document', e.substring(12)],
  Ae = [],
  qe = {};
Object.freeze(Ae);
Object.freeze(qe);
function Ni(e) {
  return new Proxy({}, new Fl(e));
}
var Fl = class {
    constructor(e) {
      this.owner = e;
    }
    get(e, t) {
      if (t === Me) return this.owner.constProps;
      if (t === Pe) return this.owner.varProps;
      if (t === kt) return this.owner;
      let n;
      if (t === 'children') n = this.owner.children;
      else {
        if (typeof t == 'string' && typeof this.owner.type == 'string') {
          const r = Xt(t);
          r && (t = r);
        }
        n = at(this.owner, t);
      }
      return n instanceof me && n.$flags$ & 4 ? n.value : n;
    }
    set(e, t, n) {
      if (t === kt) this.owner = n;
      else if (t === 'children') this.owner.children = n;
      else {
        if (typeof t == 'string' && typeof this.owner.type == 'string') {
          const r = Xt(t);
          r && (t = r);
        }
        this.owner.constProps && t in this.owner.constProps
          ? ((this.owner.constProps[t] = void 0),
            t in this.owner.varProps || (this.owner.toSort = !0),
            (this.owner.varProps[t] = n))
          : (this.owner.varProps === qe
              ? (this.owner.varProps = {})
              : t in this.owner.varProps || (this.owner.toSort = !0),
            (this.owner.varProps[t] = n));
      }
      return !0;
    }
    deleteProperty(e, t) {
      let n = delete this.owner.varProps[t];
      return (
        this.owner.constProps && (n = delete this.owner.constProps[t] || n),
        this.owner.children != null && t === 'children' && ((this.owner.children = null), (n = !0)),
        n
      );
    }
    has(e, t) {
      if (t === 'children') return this.owner.children != null;
      if (t === Me || t === Pe) return !0;
      if (typeof t == 'string' && typeof this.owner.type == 'string') {
        const n = Xt(t);
        n && (t = n);
      }
      return t in this.owner.varProps || (this.owner.constProps ? t in this.owner.constProps : !1);
    }
    getOwnPropertyDescriptor(e, t) {
      return {
        configurable: !0,
        enumerable: !0,
        value:
          t === 'children'
            ? this.owner.children
            : this.owner.constProps && t in this.owner.constProps
              ? this.owner.constProps[t]
              : this.owner.varProps[t],
      };
    }
    ownKeys() {
      const e = Object.keys(this.owner.varProps);
      if ((this.owner.children != null && e.push('children'), this.owner.constProps))
        for (const t in this.owner.constProps) e.indexOf(t) === -1 && e.push(t);
      return e;
    }
  },
  at = (e, t) => (e.constProps && t in e.constProps ? e.constProps[t] : e.varProps[t]),
  Sf = (e) =>
    e ? (Pe in e ? ('children' in e ? { ...e[Pe], children: e.children } : e[Pe]) : e) : null,
  yf = (e) => (e && Me in e ? e[Me] : null),
  Ci = (e) => e && Pe in e;
function Fn(e, t, n) {
  e[se] || (Pi(e) ? e.setProp(Et, new Map()) : (e[se] = new Map()));
  const r = e[se];
  let s = r.get(t);
  return (s || ((s = [e, t]), r.set(t, s)), n && (s[3] = n), s);
}
function Pi(e) {
  return '__brand__' in e && e.__brand__ === 'SsrNode';
}
var Ur = (e, t) => (n, r) => {
    const s = De();
    return (
      (s.$effectSubscriber$ = Fn(e, ':')),
      (s.$container$ = t || void 0),
      He(s, () => {
        if (Be(n)) return n();
        if (r) return n[r];
        if (de(n)) return n.value;
        if (Ke(n) && cn(n)) return (vn(ln(n), Qe, Ue(n), s.$effectSubscriber$), n);
        throw H(2);
      })
    );
  },
  jr = (e, t) => {
    let n = null;
    return [
      (s) => {
        typeof s == 'function' &&
          (n ||
            ((n = []),
            (e.$destroy$ = La(() => {
              ((e.$destroy$ = null),
                n.forEach((i) => {
                  try {
                    i();
                  } catch (o) {
                    t(o);
                  }
                }));
            }))),
          n.push(s));
      },
      n ?? [],
    ];
  },
  Ll = !1,
  Vl = (...e) => console.log('COMPUTED SIGNAL', ...e.map(xn)),
  ms,
  Ss,
  Xe = class extends ((Ss = Ge), (ms = se), Ss) {
    constructor(e, t, n = 33) {
      (super(e, oe),
        k(this, '$computeQrl$'),
        k(this, '$flags$'),
        k(this, ms, null),
        (this.$computeQrl$ = t),
        (this.$flags$ = n));
    }
    invalidate() {
      ((this.$flags$ |= 1), this.$container$?.$scheduler$(7, null, this, this.$effects$));
    }
    force() {
      ((this.$flags$ |= 2), super.force());
    }
    get untrackedValue() {
      return (this.$computeIfNeeded$(), le(this.$untrackedValue$ === oe), this.$untrackedValue$);
    }
    $computeIfNeeded$() {
      if (!(this.$flags$ & 1)) return;
      const e = this.$computeQrl$;
      is(e);
      const t = Se(),
        n = t?.$effectSubscriber$;
      t && (t.$effectSubscriber$ = Fn(this, '.'));
      try {
        const r = e.getFn(t)();
        if (K(r)) throw H(29, [e.dev ? e.dev.file : '', e.$hash$]);
        (Ll && Vl('Signal.$compute$', r),
          (this.$flags$ &= -2),
          r !== this.$untrackedValue$ &&
            (this.$untrackedValue$ !== oe && (this.$flags$ |= 2), (this.$untrackedValue$ = r)));
      } finally {
        t && (t.$effectSubscriber$ = n);
      }
    }
    set value(e) {
      throw H(30);
    }
    get value() {
      return super.value;
    }
  },
  ys,
  ws,
  ft = class extends ((ws = Xe), (ys = se), ws) {
    constructor(e, t, n = 1) {
      (super(e, t, n),
        k(this, '$untrackedLoading$', !1),
        k(this, '$untrackedError$', null),
        k(this, '$loadingEffects$', null),
        k(this, '$errorEffects$', null),
        k(this, '$destroy$'),
        k(this, '$promiseValue$', oe),
        k(this, ys, null));
    }
    get loading() {
      return gr(
        this,
        () => this.$loadingEffects$ || (this.$loadingEffects$ = new Set()),
        () => this.untrackedLoading
      );
    }
    set untrackedLoading(e) {
      e !== this.$untrackedLoading$ &&
        ((this.$untrackedLoading$ = e),
        this.$container$?.$scheduler$(7, null, this, this.$loadingEffects$));
    }
    get untrackedLoading() {
      return this.$untrackedLoading$;
    }
    get error() {
      return gr(
        this,
        () => this.$errorEffects$ || (this.$errorEffects$ = new Set()),
        () => this.untrackedError
      );
    }
    set untrackedError(e) {
      e !== this.$untrackedError$ &&
        ((this.$untrackedError$ = e),
        this.$container$?.$scheduler$(7, null, this, this.$errorEffects$));
    }
    get untrackedError() {
      return this.$untrackedError$;
    }
    invalidate() {
      (super.invalidate(), (this.$promiseValue$ = oe));
    }
    async resolve() {
      return (await Ee(() => this.$computeIfNeeded$()), this.$untrackedValue$);
    }
    $computeIfNeeded$() {
      if (!(this.$flags$ & 1)) return;
      const e = this.$computeQrl$;
      is(e);
      const [t] = jr(this, (s) => this.$container$?.handleError(s, null)),
        n =
          this.$promiseValue$ === oe
            ? e.getFn()({ track: Ur(this, this.$container$), cleanup: t })
            : this.$promiseValue$;
      if (K(n))
        throw (
          (this.untrackedLoading = !0),
          (this.untrackedError = null),
          n
            .then((s) => {
              ((this.$promiseValue$ = s),
                (this.untrackedLoading = !1),
                (this.untrackedError = null));
            })
            .catch((s) => {
              ((this.$promiseValue$ = s), (this.untrackedLoading = !1), (this.untrackedError = s));
            })
        );
      ((this.$promiseValue$ = oe), (this.$flags$ &= -2));
      const r = n !== this.$untrackedValue$;
      return (r && ((this.$flags$ |= 2), (this.$untrackedValue$ = n)), r);
    }
  },
  Ai = class extends Xe {
    constructor(e, t) {
      (super(e, t, 33), k(this, '$didInitialize$', !1));
    }
    $computeIfNeeded$() {
      if (!(this.$flags$ & 1)) return;
      is(this.$computeQrl$);
      let e = this.$computeQrl$.resolved;
      typeof e == 'function' && (e = e());
      const { deserialize: t, initial: n } = e,
        r = e.update,
        s = this.$untrackedValue$ === oe ? n : this.$untrackedValue$,
        i = Xr(() => (this.$didInitialize$ ? r?.(s) || s : t(s)), this, '.', this.$container$),
        o = (this.$didInitialize$ && i !== 'undefined') || i !== this.$untrackedValue$;
      ((this.$flags$ &= -2),
        (this.$didInitialize$ = !0),
        o && ((this.$flags$ |= 2), (this.$untrackedValue$ = i)));
    }
  },
  Ml = (e) => new Ge(null, e),
  wf = (e, t) => new ft(t?.container || null, e, Oa(t?.serializationStrategy || 'never')),
  Ql = Ml,
  ql = (e) => e.value,
  bs,
  vs,
  me = class extends ((vs = Ge), (bs = se), vs) {
    constructor(e, t, n, r, s = 5) {
      (super(e, oe),
        k(this, '$args$'),
        k(this, '$func$'),
        k(this, '$funcStr$'),
        k(this, '$flags$'),
        k(this, '$hostElement$', null),
        k(this, bs, null),
        (this.$args$ = n),
        (this.$func$ = t),
        (this.$funcStr$ = r),
        (this.$flags$ = s));
    }
    invalidate() {
      this.$flags$ |= 1;
      try {
        this.$computeIfNeeded$();
      } catch {
        this.$container$?.$scheduler$(7, this.$hostElement$, this, this.$effects$);
      }
      this.$flags$ & 2 && ((this.$flags$ &= -3), _r(this.$container$, this, this.$effects$));
    }
    force() {
      ((this.$flags$ |= 2),
        this.$container$?.$scheduler$(7, this.$hostElement$, this, this.$effects$));
    }
    get untrackedValue() {
      return (this.$computeIfNeeded$(), le(this.$untrackedValue$ === oe), this.$untrackedValue$);
    }
    $computeIfNeeded$() {
      if (!(this.$flags$ & 1)) return;
      const e = Xr(() => this.$func$(...this.$args$), this, '.', this.$container$);
      ((this.$flags$ &= -3),
        e !== this.$untrackedValue$ && ((this.$flags$ |= 2), (this.$untrackedValue$ = e)));
    }
    $unwrapIfSignal$() {
      return this.$func$ === ql && de(this.$args$[0]) ? this.$args$[0] : this;
    }
    set value(e) {
      throw H(31);
    }
    get value() {
      return super.value;
    }
  },
  _i;
_i = se;
var xi = class {
  constructor() {
    k(this, _i, null);
  }
};
function ut(e, t) {
  X(t) && te(t) && Qn(t);
  const n = t[se];
  if (n) for (const [, r] of n) Sr(e, r);
}
function Sr(e, t) {
  const n = t[2];
  if (n) {
    for (const r of n)
      if (r instanceof Ge) Bl(e, r, t);
      else if (r instanceof ft) Wl(r, t);
      else if (e.$storeProxyMap$.has(r)) {
        const s = e.$storeProxyMap$.get(r),
          i = Ue(s);
        Hl(i, t);
      }
  }
}
function Bl(e, t, n) {
  const r = t.$effects$;
  (r && r.has(n) && r.delete(n), t instanceof me && ((t.$hostElement$ = null), ut(e, t)));
}
function Wl(e, t) {
  const n = e.$effects$;
  n && n.has(t) && n.delete(t);
  const r = e.$loadingEffects$;
  r && r.has(t) && r.delete(t);
}
function Hl(e, t) {
  const n = e?.$effects$;
  if (n) for (const r of n.values()) r.has(t) && r.delete(t);
}
var Ln = class extends xi {
    constructor(e, t, n, r) {
      (super(),
        (this.flags = e),
        (this.parent = t),
        (this.previousSibling = n),
        (this.nextSibling = r),
        k(this, 'props', null),
        k(this, 'slotParent', null),
        k(this, 'chores', null),
        k(this, 'blockedChores', null));
    }
    getProp(e, t) {
      const n = this.flags;
      if ((n & 3) !== 0) {
        (n & 1 && wn(this), this.props || (this.props = []));
        const r = lt(this.props, e, 0);
        if (r >= 0) {
          let s = this.props[r + 1];
          return (typeof s == 'string' && t && (this.props[r + 1] = s = t(s)), s);
        }
      }
      return null;
    }
    setProp(e, t) {
      this.props || (this.props = []);
      const n = lt(this.props, e, 0);
      n >= 0 ? (this.props[n + 1] = t) : t != null && this.props.splice(n ^ -1, 0, e, t);
    }
    getAttr(e) {
      return (this.flags & 3) !== 0
        ? (wn(this), this.props || (this.props = []), yi(this.props, e, 0))
        : null;
    }
    setAttr(e, t, n) {
      if ((this.flags & 3) !== 0) {
        (wn(this), this.props || (this.props = []));
        const s = lt(this.props, e, 0);
        s >= 0
          ? (this.props[s + 1] != t && this instanceof It && n && n.push(2, this.element, e, t),
            t == null ? this.props.splice(s, 2) : (this.props[s + 1] = t))
          : t != null &&
            (this.props.splice(s ^ -1, 0, e, t),
            this instanceof It && n && n.push(2, this.element, e, t));
      }
    }
    toString() {
      return String(this);
    }
  },
  ki = class extends Ln {
    constructor(e, t, n, r, s, i) {
      (super(e, t, n, r), (this.textNode = s), (this.text = i));
    }
  },
  zl = class extends Ln {
    constructor(e, t, n, r, s, i) {
      (super(e, t, n, r), (this.firstChild = s), (this.lastChild = i));
    }
  },
  It = class extends Ln {
    constructor(e, t, n, r, s, i, o, l) {
      (super(e, t, n, r),
        (this.firstChild = s),
        (this.lastChild = i),
        (this.element = o),
        (this.elementName = l));
    }
  },
  Ul = (e, t) => {
    Vt(_e(e));
    const n = new It(-247, null, null, null, null, null, e, t);
    return (ie(te(n)), le(Y(n)), le(ce(n)), (e.vNode = n), n);
  },
  Kr = (e) => {
    Vt(_e(e));
    const t = new It(-255, null, null, null, void 0, void 0, e, void 0);
    return (ie(te(t)), le(Y(t)), le(ce(t)), (e.vNode = t), t);
  },
  jl = (e, t, n) => {
    t && Vt(_e(t));
    const r = new ki(-252, null, e, null, t, n);
    return (le(te(r)), ie(Y(r)), le(ce(r)), r);
  },
  Ti = (e, t) => {
    const n = new ki(-244, null, null, null, e, t);
    return (Vt(_e(e)), le(te(n)), ie(Y(n)), le(ce(n)), n);
  },
  wt = () => {
    const e = new zl(-254, null, null, null, null, null);
    return (le(te(e)), le(Y(e)), ie(ce(e)), e);
  },
  X = (e) => e instanceof Ln,
  te = (e) => (z(), (e.flags & 1) === 1),
  Kl = (e) => (z(), (e.flags & 5) !== 0),
  Y = (e) => (z(), (e.flags & 4) === 4),
  ce = (e) => (z(), (e.flags & 2) === 2),
  Gl = (e) => (z(), (e.flags & 2) === 2 && e.getProp(rt, null) !== null),
  Xl = (e) => (ie(Y(e), 'Expecting TextVNode was: ' + Gr(e)), e),
  Yl = (e) => {
    (z(), ie((e.flags & 3) !== 0, 'Expecting ElementVNode or VirtualVNode was: ' + Gr(e)));
  },
  Rt = (e) => (ie(te(e), 'Expecting ElementVNode was: ' + Gr(e)), e),
  Gr = (e) => {
    if (e)
      switch (e.flags & 7) {
        case 1:
          return 'Element';
        case 2:
          return 'Virtual';
        case 4:
          return 'Text';
      }
    return '<unknown>';
  },
  wn = (e) => {
    if ((e.flags & 15) === 1) {
      const n = e;
      n.flags ^= 8;
      const r = n.element,
        s = r.attributes;
      for (let i = 0; i < s.length; i++) {
        const o = s[i],
          l = o.name;
        if (l === Rn || !l) break;
        if (l.startsWith(We)) {
          const c = Dt(n);
          o.value === 'html'
            ? Gt(c, On, r.innerHTML, 0)
            : o.value === 'text' && 'value' in r && Gt(c, 'value', r.value, 0);
        } else if (!l.startsWith('on:')) {
          const c = o.value,
            a = Dt(n);
          Gt(a, l, c, 0);
        }
      }
    }
  };
function Jl(e, t) {
  let n = e;
  if (Y(e)) return;
  let r = null;
  do {
    if (t?.(n, r)) return;
    const s = pe(n);
    if (s) {
      n = s;
      continue;
    }
    if (n === e) return;
    const i = n.nextSibling;
    if (i) {
      n = i;
      continue;
    }
    for (r = n.parent; r; ) {
      if (r === e) return;
      const o = r.nextSibling;
      if (o) {
        n = o;
        break;
      }
      r = r.parent;
    }
    if (r == null) return;
  } while (!0);
}
function Ot(e, t, n = !1, r = []) {
  if (Kl(t)) return (Y(t) && tn(e, t), r.push(n ? t : Pt(t)), r);
  let s = pe(t);
  for (; s; )
    (te(s)
      ? r.push(n ? s : Pt(s))
      : Y(s)
        ? (tn(e, s), r.push(n ? s : Pt(s)))
        : n
          ? Ot(e, s, !0, r)
          : Ot(e, s, !1, r),
      (s = s.nextSibling));
  return r;
}
var vt = (e, t, n) => {
    const r = t ? 'firstChild' : 'lastChild',
      s = t ? 'nextSibling' : 'previousSibling';
    let i = e;
    for (; n && i && ce(i); ) {
      const o = i[r];
      if (!o) break;
      if (o.flags & 5) return o;
      i = o;
    }
    for (; i; ) {
      let o = i[s];
      if (o && o.flags & 5) return o;
      if (!o) {
        let l = i.parent;
        if (l && !ce(l)) return null;
        for (; l && !(o = l[s]); ) if (((l = l.parent), l && !ce(l))) return null;
        if (!o || (Y(o) && l && te(l))) return null;
      }
      for (; o; ) {
        if (((i = o), i.flags & 5 && Pt(i))) return i;
        o = i[r];
      }
    }
    return null;
  },
  Zl = (e, t) => {
    Y(t) && tn(e, t);
  },
  tn = (e, t) => {
    const n = Xl(t);
    if ((n.flags & 8) === 0) {
      const s = Vn(t);
      z();
      const i = n.textNode,
        o = s.ownerDocument;
      let l = vt(t, !1, !0);
      const c = vt(t, !0, !0),
        a = i || (c instanceof It ? c.element : c?.textNode) || null;
      let g = a;
      for (; l && Y(l); ) {
        if ((l.flags & 8) === 0) {
          const b = o.createTextNode(l.text);
          (e.push(6, s, g, b), (g = b), (l.textNode = b), (l.flags |= 8));
        }
        l = vt(l, !1, !0);
      }
      for (l = t; l && Y(l); ) {
        const b = vt(l, !0, !0),
          P = b ? !Y(b) : !0;
        if ((l.flags & 8) === 0) {
          if (P && i) e.push(1, i, l.text);
          else {
            const m = o.createTextNode(l.text);
            (e.push(6, s, a, m), (l.textNode = m));
          }
          l.flags |= 8;
        }
        l = b;
      }
    }
  },
  Mt = (e, t) => {
    Rt(e);
    let n = e;
    const r = e.element,
      { qVNodeRefs: s } = r;
    let i = -1,
      o;
    if (typeof t == 'string') (z(), (i = parseInt(t)), (o = s.get(i)));
    else {
      o = t;
      const l = o.vNode;
      if (l) return l;
    }
    if ((z(), X(o))) n = o;
    else {
      ie(r.contains(o));
      let l = o;
      const c = [o];
      for (; l && l !== r && !l.vNode; ) ((l = l.parentElement), c.push(l));
      l.vNode && (n = l.vNode);
      for (let a = c.length - 2; a >= 0; a--) n = tc(n, c[a]);
      i != -1 && ((o.vNode = n), s.set(i, n));
    }
    if (typeof t == 'string') {
      const l = t.length;
      let c = nc(t, l),
        a = 0;
      for (; c < l; ) {
        const g = t.charCodeAt(c);
        ((a *= 26), g >= 97 ? (a += g - 97) : ((a += g - 65), (n = ec(n, a)), (a = 0)), c++);
      }
    }
    return n;
  },
  ec = (e, t) => {
    let n = pe(e);
    for (z(); n.flags >>> 8 !== t; ) ((n = n.nextSibling), z());
    return n;
  },
  gt = [],
  tc = (e, t) => {
    Rt(e);
    let n = pe(e);
    for (z(); n && (!(n instanceof It) || n.element !== t); ) {
      if (ce(n)) {
        const r = n.nextSibling,
          s = pe(n);
        s ? (r && gt.push(r), (n = s)) : (n = r || (gt.length ? gt.pop() : null));
      } else {
        const r = n.nextSibling;
        r ? (n = r) : (n = r || gt.pop());
      }
      z();
    }
    for (; gt.length; ) gt.pop();
    return (Rt(n), Vt(n.element), n);
  },
  nc = (e, t) => {
    let n = 0;
    for (; n < t; )
      if (e.charCodeAt(n) <= 57) n++;
      else return n;
    return t;
  },
  rc = (e) => (e === 'false' ? !1 : !!e),
  sc = (e, t) =>
    (t == 'allowfullscreen' ||
      t == 'async' ||
      t == 'autofocus' ||
      t == 'autoplay' ||
      t == 'checked' ||
      t == 'controls' ||
      t == 'default' ||
      t == 'defer' ||
      t == 'disabled' ||
      t == 'formnovalidate' ||
      t == 'inert' ||
      t == 'ismap' ||
      t == 'itemscope' ||
      t == 'loop' ||
      t == 'multiple' ||
      t == 'muted' ||
      t == 'nomodule' ||
      t == 'novalidate' ||
      t == 'open' ||
      t == 'playsinline' ||
      t == 'readonly' ||
      t == 'required' ||
      t == 'reversed' ||
      t == 'selected') &&
    t in e,
  ic = (e) => {
    let t = 0;
    const n = e.length;
    for (; t < n; )
      switch (e[t++]) {
        case 1:
          const s = e[t++];
          s.nodeValue = e[t++];
          break;
        case 2:
          const i = e[t++];
          let o = e[t++];
          o === 'className' && (o = 'class');
          const l = e[t++];
          sc(i, o)
            ? (i[o] = rc(l))
            : o === 'value' && o in i
              ? (i.value = String(l))
              : o === On
                ? ((i.innerHTML = l), i.setAttribute(We, 'html'))
                : l == null || l === !1
                  ? i.removeAttribute(o)
                  : i.setAttribute(o, String(l));
          break;
        case 3:
          const c = e[t++],
            a = c.head,
            g = c.querySelectorAll(Zo);
          for (let h = 0; h < g.length; h++) a.appendChild(g[h]);
          break;
        case 4:
          const b = e[t++];
          let P;
          for (; t < n && typeof (P = e[t]) != 'number'; ) (b.removeChild(P), t++);
          break;
        case 5:
          const m = e[t++];
          m.replaceChildren ? m.replaceChildren() : (m.textContent = '');
          break;
        case 6:
          const d = e[t++],
            C = e[t++];
          let p;
          for (; t < n && typeof (p = e[t]) != 'number'; ) (d.insertBefore(p, C), t++);
          break;
      }
    e.length = 0;
  },
  Le = (e, t, n, r) => {
    (Yl(t), te(t) && Qn(t));
    const s = n.parent;
    if (n === r) {
      if (s) return;
      r = null;
    }
    const i = Mn(t, !1),
      o = i && i.element;
    let l = null;
    (i && (l = Pl(e, i, n)),
      s && (n.previousSibling || n.nextSibling || s !== t) && Yt(e, s, n, !1));
    const c = t.flags & 32;
    if (!c) {
      let b = null;
      (r == null ? ce(t) && (b = vt(t, !0, !1)) : ce(r) ? (b = vt(r, !0, !0)) : (b = r),
        b && Zl(e, b),
        l && l.length && e.push(6, o, Pt(b), ...l));
    }
    const a = r,
      g = a ? a.previousSibling : t.lastChild;
    (a ? (a.previousSibling = n) : (t.lastChild = n),
      g ? (g.nextSibling = n) : (t.firstChild = n),
      (n.previousSibling = g),
      (n.nextSibling = a),
      (n.parent = t),
      c && (n.flags |= 32));
  },
  Vn = (e, t = !0) => ((e = Mn(e, t)), e && e.element),
  Mn = (e, t = !0) => {
    for (; e && !te(e); ) e = e.parent || (t ? e.slotParent : null);
    return e;
  },
  Yt = (e, t, n, r) => {
    if ((Vt(t, n.parent), Y(n) && tn(e, n), r)) {
      const o = Vn(t, !1);
      if (t.getAttr(On)) return;
      const c = Ot(e, n);
      o && c.length && e.push(4, o, ...c);
    }
    const s = n.previousSibling,
      i = n.nextSibling;
    (s ? (s.nextSibling = i) : (t.firstChild = i),
      i ? (i.previousSibling = s) : (t.lastChild = s),
      (n.previousSibling = null),
      (n.nextSibling = null));
  },
  oc = (e, t, n) => {
    z();
    const r = Vn(t);
    if (r)
      if (te(t)) e.push(5, r);
      else {
        const i = Ot(e, t);
        i.length && e.push(4, r, ...i);
      }
    const s = n.previousSibling;
    (s ? (s.nextSibling = null) : (t.firstChild = null), (t.lastChild = s));
  },
  Ne = (e) => {
    const t = Rt(e);
    let n = t.elementName;
    if (n === void 0) {
      const r = t.element,
        s = dc(r).toLowerCase();
      ((n = t.elementName = s), (t.flags |= Cl(r)));
    }
    return n;
  },
  Ii = (e) => {
    let t = e.text;
    return (t === void 0 && (t = e.text = e.textNode.nodeValue), t);
  },
  lc = (e, t, n) => {
    tn(e, t);
    const r = t.textNode;
    e.push(1, r, (t.text = n));
  },
  pe = (e) => {
    if (Y(e)) return null;
    let t = e.firstChild;
    return (t === void 0 && (t = Qn(e)), t);
  },
  cc = (e) => {
    const t = e.element,
      n = $c(t),
      r = t.ownerDocument?.qVNodeData?.get(t);
    return ac(e, t, n, r);
  },
  ac = (e, t, n, r) => {
    if (r) {
      if (r.charCodeAt(0) === G.SEPARATOR) {
        let i = 1;
        for (; r.charCodeAt(i) !== G.SEPARATOR; ) i++;
        const o = r.substring(1, i);
        r = r.substring(i + 1);
        const l = Ns(e, n, o);
        if (!r) return l;
      }
      return yc(e, r, t, n);
    } else return Ns(e, n);
  },
  Qn = (e) => {
    const t = Rt(e);
    let n = t.firstChild;
    if (n === void 0) {
      const r = t.element;
      t.parent && Ri(r) ? (n = t.firstChild = t.lastChild = null) : (n = cc(t));
    }
    return (ie(t.firstChild !== void 0), ie(t.lastChild !== void 0), n);
  },
  Un = null,
  Ri = (e) => (Un || (Un = e.hasAttribute), Un.call(e, We)),
  jn = null,
  _e = (e) => (jn || (jn = $t(e, 'nodeType')), jn.call(e)),
  fc = (e) => {
    const t = _e(e);
    return t === 3 || t === 1;
  },
  mt = null,
  Ct = (e) => {
    for (mt || (mt = $t(e, 'nextSibling')), st || (st = $t(e, 'firstChild')); e; )
      if (((e = mt.call(e)), e !== null)) {
        const t = _e(e);
        if (t === 3 || t === 1) break;
        if (t === 8) {
          const n = e.nodeValue;
          if (n?.startsWith(gi)) return Es(e, pi, mt, st);
          if (e.nodeValue?.startsWith(rl)) return Es(e, sl, mt, st);
          if (n?.startsWith(We))
            for (; e && (e = mt.call(e)) && !(_e(e) === 8 && e.nodeValue?.startsWith(il)); );
        }
      }
    return e;
  };
function Es(e, t, n, r) {
  for (; e; ) {
    if (e.nodeValue?.startsWith(t)) return ((e = n.call(e) || null), e);
    let s = r.call(e);
    (s || (s = n.call(e)), s || ((s = uc(e)), s && (s = n.call(s))), (e = s));
  }
  return null;
}
var Kn = null,
  uc = (e) => (Kn || (Kn = $t(e, 'parentNode')), Kn.call(e)),
  st = null,
  $c = (e) => {
    for (st || (st = $t(e, 'firstChild')), e = e && st.call(e); e && !fc(e); ) e = Ct(e);
    return e;
  },
  Gn = null,
  hc = (e) => (Gn || (Gn = $t(e, 'namespaceURI')), Gn.call(e)),
  Xn = null,
  dc = (e) => (Xn || (Xn = $t(e, 'nodeName')), Xn.call(e)),
  $t = (e, t) => {
    let n;
    for (; e && !(n = Object.getOwnPropertyDescriptor(e, t)?.get); ) e = Object.getPrototypeOf(e);
    return (
      n ||
      function () {
        return this[t];
      }
    );
  },
  pc = (e) => e.nodeName === 'STYLE' && (e.hasAttribute(_t) || e.hasAttribute(fr)),
  gc = (e) => e.hasAttribute(Rn),
  Ns = (e, t, n) => {
    let r = null;
    const s = () => {
      for (; wr(i) && yr(i); ) i = Ct(i);
    };
    let i = t;
    s();
    let o = null;
    for (; i; ) {
      const l = _e(i);
      let c = null;
      (l === 3 ? (c = Ti(i, i.textContent ?? void 0)) : l === 1 && (c = Kr(i)),
        c && ((c.parent = e), o && (o.nextSibling = c), (c.previousSibling = o), (o = c)),
        r || (e.firstChild = r = o),
        (i = Ct(i)),
        s());
    }
    if (((e.lastChild = o || null), (e.firstChild = r), n)) {
      let l = null;
      Di(n, (c, a) => {
        if (c() === G.ID) {
          l || (l = Ie(e.element));
          const g = a();
          l.$setRawState$(parseInt(g), e);
        } else c() === G.BACK_REFS ? (l || (l = Ie(e.element)), Oi(e, a(), l)) : a();
      });
    }
    return r;
  };
function Oi(e, t, n) {
  if (!e[se])
    Object.defineProperty(e, se, {
      get() {
        const r = n.$getObjectById$(t);
        return ((e[se] = r), r);
      },
      set(r) {
        Object.defineProperty(e, se, { value: r, writable: !0, enumerable: !0, configurable: !0 });
      },
      enumerable: !0,
      configurable: !0,
    });
  else {
    const r = e[se];
    Tl(r, n.$getObjectById$(t));
  }
}
var Di = (e, t) => {
    let n = 0,
      r = 0,
      s = 0;
    const i = (a) => (a < e.length ? e.charCodeAt(a) : 0),
      o = () => (s !== 0 ? s : (s = i(n))),
      l = () => ((r = o()), (s = 0), n++, r),
      c = () => {
        l();
        const a = n;
        for (
          ;
          (o() <= 58 && s !== 0) || s === 95 || (s >= 65 && s <= 90) || (s >= 97 && s <= 122);

        )
          l();
        return e.substring(a, n);
      };
    for (; o() !== 0; ) t(o, c, l, i, n);
  },
  Dt = (e) => (e.props || (e.props = []), e.props),
  mc = (e, t) => {
    let n = An(e);
    for (; n; ) {
      if (n === t) return !0;
      n = An(n);
    }
    return !1;
  },
  An = (e) => e.parent || e.slotParent,
  Pt = (e) => (e === null || ce(e) ? null : te(e) ? e.element : (ie(Y(e)), e.textNode)),
  Cs = (e) => 48 <= e && e <= 57,
  Sc = (e) => 97 <= e && e <= 122;
function yr(e) {
  return !gc(e) || pc(e);
}
var St = [];
function yc(e, t, n, r) {
  let s = 0,
    i = null,
    o = null,
    l = null;
  const c = (m) => {
    ((m.flags = (m.flags & 255) | (s << 8)),
      s++,
      o && (o.nextSibling = m),
      (m.previousSibling = o),
      (m.parent = e),
      i || (e.firstChild = i = m),
      (o = m));
  };
  let a = 0,
    g = null,
    b = null;
  const P = (m) => {
    const d = wr(m);
    return !d || (d && yr(m));
  };
  return (
    Di(t, (m, d, C, p, h) => {
      if (Cs(m())) {
        for (; P(r); ) if (((r = Ct(r)), !r)) throw H(27, [t, m(), h]);
        ((g = null), (l = null));
        let $ = 0;
        for (; Cs(m()); ) (($ *= 10), ($ += C() - 48));
        for (; $--; ) (c(Kr(r)), (r = Ct(r)));
      } else if (m() === G.SCOPED_STYLE) e.setAttr(_t, d(), null);
      else if (m() === G.RENDER_FN) e.setAttr(ge, d(), null);
      else if (m() === G.ID) {
        b || (b = Ie(n));
        const $ = d();
        b.$setRawState$(parseInt($), e);
      } else if (m() === G.PROPS) e.setAttr(Ce, d(), null);
      else if (m() === G.KEY) {
        const $ = p(h + 1) === G.SEPARATOR;
        let T;
        ($ ? (C(), (T = decodeURI(d())), C()) : (T = d()), e.setAttr(we, T, null));
      } else if (m() === G.SEQ) e.setAttr(xt, d(), null);
      else if (m() === G.SEQ_IDX) e.setAttr(Jt, d(), null);
      else if (m() === G.BACK_REFS) (b || (b = Ie(n)), Oi(e, d(), b));
      else if (m() === G.SLOT_PARENT) (b || (b = Ie(n)), (e.slotParent = Mt(b.rootVNode, d())));
      else if (m() === G.CONTEXT) e.setAttr(zt, d(), null);
      else if (m() === G.OPEN)
        (C(), c(wt()), St.push(e, i, o, l, s), (s = 0), (e = o), (i = o = null));
      else if (m() === G.SEPARATOR) {
        const $ = d(),
          T = d();
        e.setAttr($, T, null);
      } else if (m() === G.CLOSE)
        (C(),
          (e.lastChild = o),
          (s = St.pop()),
          (l = St.pop()),
          (o = St.pop()),
          (i = St.pop()),
          (e = St.pop()));
      else if (m() === G.SLOT) e.setAttr(rt, d(), null);
      else {
        for (; wr(r) && yr(r); ) r = Ct(r);
        const $ = r && _e(r) === 3 ? r : null;
        g === null && ((g = $ ? $.nodeValue : null), (a = 0));
        let T = 0;
        for (; Sc(m()); ) ((T += C() - 97), (T *= 26));
        T += C() - 65;
        const M = g === null ? '' : g.substring(a, a + T);
        (c((l = jl(l, $, M))), (a += T));
      }
    }),
    (e.lastChild = o),
    i
  );
}
var wc = (e) => {
    const t = e.flags;
    if (t & 1) return 1;
    if (t & 2) return 11;
    if (t & 4) return 3;
    throw H(26, [t]);
  },
  wr = (e) => e && typeof e == 'object' && _e(e) === 1,
  bc = (e) => {
    let t = 1;
    for (; t--; ) {
      for (; e && (!ce(e) || e.getProp(ge, null) === null); ) {
        const n = e.slotParent,
          r = ce(e) && n;
        (r && t++, (e = r || e.parent));
      }
      t > 0 && (e = e.parent);
    }
    return e;
  },
  ke,
  Se = () => {
    if (!ke) {
      const e = typeof document < 'u' && document && document.__q_context__;
      return e ? (Re(e) ? (document.__q_context__ = Vi(e)) : e) : void 0;
    }
    return ke;
  },
  Fi = () => {
    const e = Se();
    if (!e) throw H(9);
    return e;
  },
  Li = () => {
    const e = Se();
    if (!e || e.$event$ !== Wr) throw H(10);
    return (
      z(e.$hostElement$, 'invoke: $hostElement$ must be defined', e),
      z(e.$effectSubscriber$, 'invoke: $effectSubscriber$ must be defined', e),
      e
    );
  };
function He(e, t, ...n) {
  return br.call(this, e, t, n);
}
function br(e, t, n) {
  const r = ke;
  let s;
  try {
    ((ke = e), (s = t.apply(this, n)));
  } finally {
    ke = r;
  }
  return s;
}
var Vi = ([e, t, n]) => {
    const r = Ie(e),
      s = Mt(r.rootVNode, e),
      i = r.$locale$;
    return (i && wl(i), De(i, s, e, t, n));
  },
  De = (e, t, n, r, s) => {
    const i = e || (r && Ke(r) && 'locale' in r ? r.locale : void 0);
    return {
      $url$: s,
      $i$: 0,
      $hostElement$: t,
      $element$: n,
      $event$: r,
      $qrl$: void 0,
      $effectSubscriber$: void 0,
      $locale$: i,
      $container$: void 0,
    };
  },
  Ft = (e) => {
    if (ke) {
      const t = ke.$effectSubscriber$;
      try {
        return ((ke.$effectSubscriber$ = void 0), e());
      } finally {
        ke.$effectSubscriber$ = t;
      }
    } else return e();
  },
  Ze = De(void 0, void 0, void 0, Wr),
  Xr = (e, t, n, r, s) => {
    const i = Ze.$effectSubscriber$,
      o = Ze.$container$;
    try {
      return ((Ze.$effectSubscriber$ = Fn(t, n, s)), (Ze.$container$ = r), He(Ze, e));
    } finally {
      ((Ze.$effectSubscriber$ = i), (Ze.$container$ = o));
    }
  },
  it = (e, t, n, r, s) => (
    e instanceof me && e.$hostElement$ !== t && t && (e.$hostElement$ = t),
    Xr(() => e.value, t, n, r, s)
  ),
  bf = () => {
    const e = Se();
    if (e) return e.$container$;
  },
  dt = () => {
    const e = Li(),
      n = e.$hostElement$;
    let r = e.$container$.getHostProp(n, xt);
    r === null && ((r = []), e.$container$.setHostProp(n, xt, r));
    let s = e.$container$.getHostProp(n, Jt);
    for (s === null && (s = 0), e.$container$.setHostProp(n, Jt, s + 1); r.length <= s; )
      r.push(void 0);
    const i = (o) => (r[s] = o);
    return { val: r[s], set: i, i: s, iCtx: e };
  },
  vc = (e) => (
    ie(/^[\w/.-]+$/.test(e), 'Context name must only contain A-Z,a-z,0-9,_,.,-', e),
    Object.freeze({ id: en(e) })
  ),
  vf = (e, t) => {
    const { val: n, set: r, iCtx: s } = dt();
    n === void 0 && (s.$container$.setContext(s.$hostElement$, e, t), r(1));
  },
  Ef = (e, t) => {
    const { val: n, set: r, iCtx: s } = dt();
    if (n !== void 0) return n;
    const i = s.$container$.resolveContext(s.$hostElement$, e);
    if (i !== void 0) return r(i);
    throw H(8, [e.id]);
  },
  Ec = vc('qk-error'),
  qn = () => {
    const e = Fi();
    let t = e.$qrl$;
    if (t)
      z(t.$captureRef$, 'invoke: qrl $captureRef$ must be defined inside useLexicalScope()', t);
    else {
      const n = e.$element$;
      z(n, 'invoke: element must be defined inside useLexicalScope()', e);
      const r = co(n);
      (z(r, 'invoke: cant find parent q:container of', n),
        (t = Ie(r).parseQRL(decodeURIComponent(String(e.$url$)))));
    }
    return t.$captureRef$;
  },
  Nc = (e, t) => {
    const [n] = qn();
    n.value = t.type === 'number' ? t.valueAsNumber : t.value;
  },
  Cc = (e, t) => {
    const [n] = qn();
    n.value = t.checked;
  },
  hn = 'bind:value',
  Ut = 'bind:checked',
  Ye = class {
    constructor(e, t, n, r, s, i, o) {
      if (
        (k(this, 'type'),
        k(this, 'toSort'),
        k(this, 'key'),
        k(this, 'varProps'),
        k(this, 'constProps'),
        k(this, 'children'),
        k(this, 'dev'),
        k(this, '_proxy', null),
        (this.type = e),
        (this.toSort = !!i),
        (this.key = s == null ? null : String(s)),
        (this.varProps = !t || As(t) ? qe : t),
        (this.constProps = !n || As(n) ? null : n),
        (this.children = r),
        typeof e == 'string')
      ) {
        for (const l in this.constProps) {
          const c = Xt(l);
          c && (Ps(this.constProps, c, this.constProps[l]), delete this.constProps[l]);
        }
        for (const l in this.varProps) {
          const c = Xt(l);
          c &&
            ((!n || !(l in n)) && (i = Ps(this.varProps, c, this.varProps[l]) || i),
            delete this.varProps[l]);
        }
        (Ut in this.varProps
          ? (i = dn(this.varProps, Ut) || i)
          : hn in this.varProps
            ? (i = dn(this.varProps, hn) || i)
            : this.constProps &&
              (Ut in this.constProps
                ? dn(this.constProps, Ut)
                : hn in this.constProps && dn(this.constProps, hn)),
          'className' in this.varProps &&
            ((this.varProps.class = this.varProps.className),
            (this.varProps.className = void 0),
            (i = !0)),
          this.constProps &&
            'className' in this.constProps &&
            ((this.constProps.class = this.constProps.className),
            (this.constProps.className = void 0)));
      }
    }
    get props() {
      return this._proxy || (this._proxy = Ni(this));
    }
  },
  Ps = (e, t, n) => {
    let r = e[t];
    if (r) Array.isArray(r) ? r.push(n) : (r = e[t] = [r, n]);
    else return ((e[t] = n), !0);
  },
  ze = (e) => e instanceof Ye,
  As = (e) => {
    for (const t in e) if (e[t] !== void 0) return !1;
    return !0;
  },
  dn = (e, t) => {
    const n = e[t];
    if (((e[t] = void 0), n))
      return (
        t === Ut
          ? ((e.checked = n), (e['on:input'] = je(null, '_chk', Cc, null, null, [n])))
          : ((e.value = n), (e['on:input'] = je(null, '_val', Nc, null, null, [n]))),
        !0
      );
  },
  _s = (e, t, n, r, s) => Yr(e, t, null, null, 0, n, s);
function Nf(e, t, ...n) {
  const r = { children: arguments.length > 2 ? n.flat(100) : null };
  let s = null;
  for (const i in t) i == 'key' ? (s = t[i]) : (r[i] = t[i]);
  return (
    typeof e == 'string' && !s && 'dangerouslySetInnerHTML' in r && (s = 'innerhtml'),
    Yr(e, t, null, r.children, 0, s)
  );
}
var Te = (e) => e.children,
  Pc = (e, t) => new Ye(Mi, null, null, e.children, t),
  vr = (e, t, n, r, s, i, o) => Ft(() => new Ye(e, t, n, r, i, !1, o)),
  Yr = (e, t, n, r, s, i, o) =>
    Ft(() => {
      if (t)
        for (const l in t)
          l === 'children'
            ? (r || (r = t.children), (t.children = void 0))
            : l === 'key'
              ? (i || (i = t.key), (t.key = void 0))
              : n && l in n && (t[l] = void 0);
      return new Ye(e, t, n, r, i, !0, o);
    }),
  Mi = (e) => e.children,
  sn = (e) => vr(Mi, null, { [Yo]: '' }, e.children, 0, e.name ?? ''),
  Ac = [
    void 0,
    null,
    !0,
    !1,
    '',
    Ae,
    qe,
    oe,
    Qe,
    Tt,
    sn,
    Te,
    NaN,
    1 / 0,
    -1 / 0,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER - 1,
    Number.MIN_SAFE_INTEGER,
  ],
  Lt = class {
    constructor(e) {
      (k(this, 'data'), (this.data = e));
    }
  },
  Cf = (e) => {
    const { val: t, set: n, iCtx: r, i: s } = dt();
    if (t) return;
    n(1);
    const i = new Qt(10, s, r.$hostElement$, e, void 0, null);
    n(i);
    const o = r.$container$,
      l = Jr(i, o, r.$hostElement$);
    if (K(l)) throw l;
  },
  Jr = (e, t, n) => {
    ((e.$flags$ &= -9), nn(e));
    const r = De(t.$locale$, n, void 0, ul);
    r.$container$ = t;
    const s = e.$qrl$.getFn(r, () => ut(t, e)),
      i = Ur(e, t),
      [o] = jr(e, (c) => t.handleError(c, n)),
      l = { track: i, cleanup: o };
    return Dn(
      () => s(l),
      o,
      (c) => {
        if (K(c)) return c.then(() => Jr(e, t, n));
        throw c;
      }
    );
  },
  nn = (e) => {
    const t = e.$destroy$;
    if (t) {
      e.$destroy$ = null;
      try {
        t();
      } catch (n) {
        Wo(n);
      }
    }
  },
  Qt = class extends xi {
    constructor(e, t, n, r, s, i) {
      (super(),
        (this.$flags$ = e),
        (this.$index$ = t),
        (this.$el$ = n),
        (this.$qrl$ = r),
        (this.$state$ = s),
        (this.$destroy$ = i));
    }
  },
  on = (e) => e instanceof Qt,
  _c = (e, t) => {
    const [n] = qn(),
      r = n.$flags$ & 1 ? 16 : 3;
    Ie(t).$scheduler$(r, n);
  },
  xc = (e) => ({
    __brand: 'resource',
    value: void 0,
    loading: !be(),
    _resolved: void 0,
    _error: void 0,
    _state: 'pending',
    _timeout: -1,
    _cache: 0,
  }),
  kc = (e, t, n) => {
    const r = xc();
    return ((r.value = n), ho(e, r, 1));
  },
  Qi = (e, t, n) => {
    ((e.$flags$ &= -9), nn(e));
    const r = De(t.$locale$, n, void 0, fl);
    r.$container$ = t;
    const s = e.$qrl$.getFn(r, () => ut(t, e)),
      i = e.$state$;
    z(i, 'useResource: when running a resource, "task.resource" must be a defined.', e);
    const o = Ur(e, t),
      [l, c] = jr(e, (h) => t.handleError(h, n)),
      a = os(i),
      g = {
        track: o,
        cleanup: l,
        cache(h) {
          let $ = 0;
          (h === 'immutable' ? ($ = 1 / 0) : ($ = h), (i._cache = $));
        },
        previous: a._resolved,
      };
    let b,
      P,
      m = !1;
    const d = (h, $) =>
      m
        ? !1
        : ((m = !0),
          h
            ? ((m = !0),
              (a.loading = !1),
              (a._state = 'resolved'),
              (a._resolved = $),
              (a._error = void 0),
              b($))
            : ((m = !0), (a.loading = !1), (a._state = 'rejected'), (a._error = $), P($)),
          be() || Da(i, '_state'),
          !0);
    (c.push(() => {
      if (Ft(() => i.loading) === !0) {
        const h = Ft(() => i._resolved);
        d(!0, h);
      }
    }),
      He(r, () => {
        ((i._state = 'pending'),
          (i.loading = !be()),
          (i.value = new Promise((h, $) => {
            ((b = h), (P = $));
          })));
      }));
    const C = Dn(
        () => s(g),
        (h) => {
          d(!0, h);
        },
        (h) => {
          if (K(h)) return h.then(() => Qi(e, t, n));
          d(!1, h);
        }
      ),
      p = a._timeout;
    return p > 0
      ? Promise.race([
          C,
          Sl(p).then(() => {
            d(!1, new Error('timeout')) && nn(e);
          }),
        ])
      : C;
  };
function qi(e, t, n) {
  let r = t.$symbol$,
    s = t.$chunk$;
  const i = mi();
  if (i) {
    const c = i.chunkForSymbol(r, s, t.dev?.file);
    c && ((s = c[1]), (r = c[0]));
  }
  if (ai(t)) {
    const c = t.resolved;
    ((s = ''), (r = String(e.$addSyncFn$(null, 0, c))));
  } else {
    if ((s || (s = e.$symbolToChunkResolver$(t.$hash$)), !s)) throw H(14, [t.$symbol$]);
    s.startsWith('./') && (s = s.slice(2));
  }
  if (
    (!t.$capture$ &&
      Array.isArray(t.$captureRef$) &&
      t.$captureRef$.length > 0 &&
      (t.$capture$ = t.$captureRef$.map((c) => `${e.$addRoot$(c)}`)),
    n)
  )
    return [s, r, t.$capture$];
  let l = `${s}#${r}`;
  return (t.$capture$ && t.$capture$.length > 0 && (l += `[${t.$capture$.join(' ')}]`), l);
}
function Er(e, t, n) {
  return je(e, t, null, null, n, null);
}
function Tc(e) {
  const t = e.indexOf('#'),
    n = e.indexOf('[', t),
    r = e.indexOf(']', n),
    s = t > -1 ? e.slice(0, t) : e.slice(0, n),
    i = n > -1 ? e.slice(t + 1, n) : e.slice(t + 1),
    o =
      n > -1 && r > -1
        ? e
            .slice(n + 1, r)
            .split(' ')
            .filter((l) => l.length)
            .map((l) => parseInt(l, 10))
        : null;
  return Er(s, i, o);
}
var Bi = new WeakMap(),
  Nr = new Map(),
  Zr = (e, t, n) => {
    switch (t) {
      case 0:
        return n;
      case 1:
        return e.$getObjectById$(n);
      case 2:
        if (!e.$forwardRefs$) return Tt;
        const r = e.$forwardRefs$[n];
        return r === -1 || r === void 0 ? Tt : e.$getObjectById$(r);
      case 13:
        return n;
      case 3:
        return Ac[n];
      case 4:
        return Array(n.length / 2);
      case 5:
        return {};
      case 19:
      case 20:
        if (typeof n == 'string') {
          const m = n.split(' ').map(Number),
            d = e.$getObjectById$(m[0]),
            C = e.$getObjectById$(m[1]),
            p = m.length > 2 ? m.slice(2) : null;
          return Er(d, C, p);
        } else return Er('', String(n));
      case 21:
        return new Qt(-1, -1, null, null, null, null);
      case 22: {
        const m = kc(e, void 0, void 0);
        return ((m.loading = !1), m);
      }
      case 6:
        return new URL(n);
      case 7:
        return new Date(n);
      case 8:
        const s = n.lastIndexOf('/');
        return new RegExp(n.slice(1, s), n.slice(s + 1));
      case 14:
        return new Error();
      case 23:
        return Ba(null);
      case 24:
        return new Ge(e, 0);
      case 25:
        return new me(e, null, null, null);
      case 26:
        return new Xe(e, null);
      case 27:
        return new ft(e, null);
      case 28:
        return new Ai(e, null);
      case 29: {
        const m = n,
          d = m[0],
          C = m[1],
          p = Zr(e, d, C),
          h = ls(p, 0, e);
        return (ss(d) && Nr.set(h, { t: d, v: C }), (m[0] = 0), (m[1] = p), h);
      }
      case 12:
        return new URLSearchParams(n);
      case 30:
        return new FormData();
      case 31:
        return new Ye(null);
      case 11:
        return BigInt(n);
      case 16:
        return new Set();
      case 17:
        return new Map();
      case 15:
        let i, o;
        const l = new Promise((m, d) => {
          ((i = m), (o = d));
        });
        return (Bi.set(l, [i, o]), l.catch(() => {}), l);
      case 18:
        const c = n.length,
          a = c >>> 2,
          g = c & 3,
          b = a * 3 + (g ? g - 1 : 0);
        return new Uint8Array(b);
      case 32:
        return Ni(null);
      case 9:
        return xs(e, n);
      case 10:
        const P = xs(e, n);
        if (X(P)) return (Qn(P), Pt(P));
        throw H(17, [typeof P]);
      case 33:
        return new Lt({});
      default:
        throw H(18, [t]);
    }
  };
function xs(e, t) {
  return t ? (e.rootVNode ? Mt(e.rootVNode, t) : void 0) : e.element?.ownerDocument;
}
var Pf = (e, t, n = Ae) => je(null, t, e, null, null, n),
  Af = (e, t = Ae) => je(null, e, null, null, null, t),
  es = (e, t, n, r, s) => {
    const i = De(e.$locale$, n || void 0, void 0, Wr);
    n && ((i.$effectSubscriber$ = Fn(n, ':')), (i.$container$ = e));
    let o;
    e.ensureProjectionResolved(t);
    let l = !1;
    if ((r === null && ((r = e.getHostProp(t, ge)), z()), Oe(r)))
      ((s = s || e.getHostProp(t, Ce) || qe),
        'children' in s && delete s.children,
        (o = r.getFn(i)));
    else if (pt(r)) {
      const a = r;
      o = () => br(i, a, [s || qe, null, 0]);
    } else {
      l = !0;
      const a = r;
      o = () => br(i, a, [s || qe]);
    }
    const c = (a = 0) =>
      Dn(
        () => (
          l || (e.setHostProp(t, Jt, null), e.setHostProp(t, Cn, null)),
          a > 0 && X(t) && ut(e, t),
          o(s)
        ),
        (g) => {
          const b = e.getHostProp(t, dr);
          return b ? Ic(g, b) : g;
        },
        (g) => {
          if (K(g) && a < pr) return g.then(() => c(++a));
          throw a >= pr ? new Error('Max retry count of component execution reached') : g;
        }
      );
    return c();
  };
function Ic(e, t) {
  const n = Cr(e);
  let r = e;
  const s = 'on:qvisible';
  return Zt(n, (i) => {
    const o = !i;
    let l = null;
    for (const c in t)
      if (Object.prototype.hasOwnProperty.call(t, c)) {
        let a = i,
          g = c;
        if (o)
          if (c === s || c.startsWith('on-document:') || c.startsWith('on-window:')) {
            if (!l) {
              const [b, P] = Wi(r);
              ((r = P), (l = b));
            }
            a = l;
          } else continue;
        a && (a.type === 'script' && c === s && (g = 'on-document:qinit'), Rc(a, g, t[c]));
      }
    return r;
  });
}
function Rc(e, t, n) {
  const r = e.constProps || (e.constProps = {}),
    s = r[t];
  (s == null ? (r[t] = n) : Array.isArray(s) ? s.push(...n) : (r[t] = [s, ...n]),
    e.varProps[t] &&
      (Array.isArray(s) ? s.push(...r[t]) : (e.varProps[t] = [s, ...n]), (r[t] = void 0)));
}
function Cr(e) {
  const t = [e];
  for (; t.length; ) {
    const n = t.shift();
    if (ze(n)) {
      if (typeof n.type == 'string') return n;
      t.push(n.children);
    } else if (Re(n)) t.push(...n);
    else {
      if (K(n)) return Zt(n, (r) => Cr(r));
      if (de(n)) return Cr(Ft(() => n.value));
    }
  }
  return null;
}
function Wi(e) {
  if (ze(e)) {
    const t = ks();
    return e.type !== Te && !pt(e.type)
      ? [t, vr(Te, null, null, [e, t], 0, null)]
      : (e.children == null
          ? (e.children = t)
          : Re(e.children)
            ? e.children.push(t)
            : (e.children = [e.children, t]),
        [t, e]);
  }
  if (Ko(e)) {
    const t = ks();
    return [t, vr(Te, null, null, [e, t], 0, null)];
  }
  if (Re(e) && e.length > 0) {
    const [t, n] = Wi(e[0]);
    return [t, e];
  }
  return [null, e];
}
function ks() {
  return new Ye('script', null, { hidden: '' });
}
var Oc = Symbol('skip render'),
  Hi = () => null,
  zi = () => null,
  Dc = (e, t) => _s(Pc, { children: _s(Fc, e) }, t),
  Fc = () => null;
function Lc(e) {
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
function ts(e) {
  return !e.startsWith('q:') && !e.startsWith(In);
}
var Vc = (e) => Br + e;
function Ts(e) {
  return 'class' in e || 'className' in e;
}
function Ui(e) {
  return e === 'class' || e === 'className';
}
function Mc(e) {
  return e?.split(' ') ?? null;
}
function Qc(e) {
  return Array.from(e).join(' ');
}
var ji = (e) => {
    if (e) {
      let t = 0;
      do e = e.substring(0, t) + Vc(e.substring(t));
      while ((t = e.indexOf(' ', t) + 1) !== 0);
    }
    return e || null;
  },
  qc = new Set([
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
  Bc = (e) => qc.has(e),
  Wc = (e, t = 0) => {
    for (let n = 0; n < e.length; n++) {
      const r = e.charCodeAt(n);
      ((t = (t << 5) - t + r), (t |= 0));
    }
    return Number(Math.abs(t)).toString(36);
  },
  Ki = (e) => {
    if (!e) return '';
    if (li(e)) return e.trim();
    const t = [];
    if (Re(e))
      for (const n of e) {
        const r = Ki(n);
        r && t.push(r);
      }
    else for (const [n, r] of Object.entries(e)) r && t.push(n.trim());
    return t.join(' ');
  },
  Hc = (e) => e.replace(/([A-Z])/g, '-$1').toLowerCase(),
  zc = (e) => {
    if (e == null) return '';
    if (typeof e == 'object') {
      if (Re(e)) throw H(0, [e, 'style']);
      {
        const t = [];
        for (const n in e)
          if (Object.prototype.hasOwnProperty.call(e, n)) {
            const r = e[n];
            r != null &&
              typeof r != 'function' &&
              (n.startsWith('--') ? t.push(n + ':' + r) : t.push(Hc(n) + ':' + Kc(n, r)));
          }
        return t.join(';');
      }
    }
    return String(e);
  },
  Uc = (e) => (e != null ? String(e) : null);
function _n(e, t, n) {
  if (Ui(e)) {
    const r = Ki(t);
    t = n ? n + (r.length ? ' ' + r : r) : r;
  } else
    e === 'style'
      ? (t = zc(t))
      : jc(e) || typeof t == 'number'
        ? (t = Uc(t))
        : t === !1 || t == null
          ? (t = null)
          : t === !0 && Ei(e) && (t = '');
  return t;
}
function jc(e) {
  return Gc(e) || ['spellcheck', 'draggable', 'contenteditable'].includes(e);
}
var Kc = (e, t) => (typeof t == 'number' && t !== 0 && !Bc(e) ? t + 'px' : t);
function Gc(e) {
  return e.startsWith('aria-');
}
var Xc = (e, t) => `${Wc(e.$hash$)}-${t}`,
  Is = (e, t, n, r) => {
    let s = e.$journal$;
    const i = [],
      o = [];
    let l = null,
      c = null,
      a = null,
      g = null,
      b = null,
      P = null,
      m = null,
      d = null,
      C = 0,
      p = 0,
      h = !0;
    const $ = new Lt({ $scopedStyleIdPrefix$: r, $isConst$: !0 }),
      T = new Lt({ $scopedStyleIdPrefix$: r, $isConst$: !1 });
    return (M(t, n), j());
    function M(S, v) {
      if ((le(), ie(), (l = v), (a = null), (c = pe(v)), u(S, !0), !(l.flags & 32)))
        for (; i.length; ) {
          for (; C < p; ) {
            if ((le(), typeof d == 'string')) Hn(d);
            else if (typeof d == 'number') Hn(String(d));
            else if (d && typeof d == 'object') {
              if (Array.isArray(d)) x(d, !1);
              else if (de(d)) {
                Wn('S', null);
                const N = d instanceof me ? d.$unwrapIfSignal$() : d;
                c?.[se]?.get('.')?.[0] !== N && x(it(N, a || c, '.', e), !0);
              } else if (K(d)) (Wn('A', null), o.push(d, a || c));
              else if (ze(d)) {
                const N = d.type;
                typeof N == 'string'
                  ? (fe(), Bn(d, N), x(d.children, !0))
                  : typeof N == 'function' &&
                    (N === Te
                      ? (fe(), Wn('F', d.key), x(d.children, !0))
                      : N === sn
                        ? (fe(), y() || x(d.children, !0))
                        : N === Rs
                          ? (R(), x(d.children, !0, !1))
                          : N === zi || N === Hi
                            ? ae()
                            : (fe(), ko(N)));
              }
            } else d === Oc ? (s = []) : Hn('');
            U();
          }
          (ae(), D(), f());
        }
    }
    function U() {
      if (!h) {
        h = !0;
        return;
      }
      if ((C++, C < p)) d = m[C];
      else if (i[i.length - 1] === !1) return f();
      a !== null ? (a = null) : Z();
    }
    function J() {
      return c ? c.nextSibling : null;
    }
    function Z() {
      c = J();
    }
    function x(S, v, N = !0) {
      if (N && (S == null || (v && Re(S) && S.length === 0))) {
        ee();
        return;
      }
      (u(S, v),
        v && (z(), (P = null), (g = null), (b = null), (l = a || c), (c = pe(l)), (a = null)),
        (h = !1));
    }
    function f() {
      (i.pop() &&
        ((P = i.pop()), (g = i.pop()), (b = i.pop()), (a = i.pop()), (c = i.pop()), (l = i.pop())),
        (d = i.pop()),
        (p = i.pop()),
        (C = i.pop()),
        (m = i.pop()),
        U());
    }
    function u(S, v) {
      (i.push(m, C, p, d),
        v && i.push(l, c, a, b, g, P),
        i.push(v),
        Array.isArray(S)
          ? ((C = 0), (p = S.length), (m = S), (d = p > 0 ? S[0] : null))
          : S === void 0
            ? ((C = 0), (d = null), (m = null), (p = 0))
            : ((C = 0), (d = S), (m = null), (p = 1)));
    }
    function w() {
      return a ? c : J();
    }
    function E(S, v) {
      const N = Array.isArray(S) ? S : [S],
        A = (F) => new Ye(Rs, null, null, [], F),
        I = [];
      if (v) {
        const F = Dt(v);
        for (let W = 0; W < F.length; W = W + 2) {
          const q = F[W];
          if (ts(q)) {
            const V = q;
            (I.push(V), I.push(A(V)));
          }
        }
      }
      if (!(I.length === 0 && S == null)) {
        for (let F = 0; F < N.length; F++) {
          const W = N[F],
            q = String((ze(W) && at(W, rt)) || Nn),
            V = lt(I, q, 0);
          let O;
          (V >= 0 ? (O = I[V + 1]) : I.splice(~V, 0, q, (O = A(q))),
            W === !1 || O.children.push(W));
        }
        for (let F = I.length - 2; F >= 0; F = F - 2) I.splice(F, 1);
        x(I, !0);
      }
    }
    function R() {
      const v = d.key;
      ((c = l.getProp(v, (N) => Mt(e.rootVNode, N))),
        (c = c && c.flags & 32 ? null : c),
        c == null && ((a = wt()), a.setProp(rt, v), (a.slotParent = l), l.setProp(v, a)));
    }
    function y() {
      const S = bc(l),
        v = _(S),
        N = S ? S.getProp(v, null) : null;
      return N == null
        ? (Le(s, l, (a = wt()), c && w()), a.setProp(rt, v), S && S.setProp(v, a), !1)
        : (N === c || (Le(s, l, (a = N), c && w()), a.setProp(rt, v), S && S.setProp(v, a)), !0);
    }
    function _(S) {
      const v = d,
        N = v.constProps;
      if (N && typeof N == 'object' && 'name' in N) {
        const A = N.name;
        if (S && A instanceof me) return it(A, S, ':', e);
      }
      return at(v, 'name') || Nn;
    }
    function D() {
      if (P) {
        for (const S of P.values()) S.flags & 32 || (jt(e, S), Yt(s, l, S, !0));
        (P.clear(), (P = null));
      }
      c = null;
    }
    function j() {
      for (; o.length; ) {
        const S = o.shift(),
          v = o.shift();
        if (K(S)) return S.then((N) => (M(N, v), j()));
        M(S, v);
      }
    }
    function ee() {
      const S = c && pe(c);
      if (S !== null) {
        let v = S;
        for (; v; ) (jt(e, v), (v = v.nextSibling));
        oc(s, c, S);
      }
    }
    function ae() {
      if ((le(), c !== null))
        for (; c; ) {
          const S = c;
          (Z(), l === S.parent && (jt(e, S), Yt(s, l, S, !0)));
        }
    }
    function fe() {
      for (; c !== null && Y(c); ) {
        jt(e, c);
        const S = c;
        (Z(), Yt(s, l, S, !0));
      }
    }
    function Je(S, v, N) {
      const A = ne(v),
        { constProps: I } = S;
      let F = !1;
      if (I)
        for (const q in I) {
          let V = I[q];
          if (tt(q)) {
            const O = mr(q);
            if (O) {
              const Q = O[0],
                B = O[1];
              B && (a.setProp(Jn + ':' + Q + ':' + B, V), Q && a.setAttr(q, '', s), he(B));
            }
            F = !0;
            continue;
          }
          if (q === 'ref')
            if (de(V)) {
              V.value = A;
              continue;
            } else if (typeof V == 'function') {
              V(A);
              continue;
            } else {
              if (V == null) continue;
              throw H(15, [N]);
            }
          if ((de(V) && (V = it(V, a, q, e, $)), q === On)) {
            V && ((A.innerHTML = String(V)), A.setAttribute(We, 'html'));
            continue;
          }
          if (v === 'textarea' && q === 'value') {
            if (V && typeof V != 'string') continue;
            A.value = Lc(V || '');
            continue;
          }
          if (((V = _n(q, V, r)), V != null)) {
            if (a.flags & 64) {
              const O = kl(q);
              if (O) {
                A.setAttributeNS(O, q, String(V));
                continue;
              }
            }
            A.setAttribute(q, String(V));
          }
        }
      const W = S.key;
      return (
        W && a.setProp(we, W),
        r && (Ts(S.varProps) || (S.constProps && Ts(S.constProps)) || A.setAttribute('class', r)),
        Le(s, l, a, c),
        F
      );
    }
    function ne(S) {
      const v = Mn(l),
        { elementNamespace: N, elementNamespaceFlag: A } = zr(v, S),
        I = e.document.createElementNS(N, S);
      return ((a = Ul(I, S)), (a.flags |= A), I);
    }
    function Bn(S, v) {
      const N = c && te(c) && v === Ne(c),
        A = S.key;
      let I = !1;
      const F = Ve(c);
      if (!N || A !== F) {
        const Q = Fe(v, A);
        fn(v, A, Q, l, () => (I = Je(S, v)));
      } else an(v, A);
      const W = [],
        q = S.varProps;
      if (S.toSort) {
        const Q = Object.keys(q).sort();
        for (const B of Q) {
          const ue = q[B];
          ue != null && W.push(B, ue);
        }
      } else
        for (const Q in q) {
          const B = q[Q];
          B != null && W.push(Q, B);
        }
      A !== null && Gt(W, we, A, 0);
      const V = a || c,
        O = V.element;
      (O.vNode || (O.vNode = V),
        (I = ye(V, W, null) || I),
        I &&
          (O.qDispatchEvent ||
            (O.qDispatchEvent = (Q, B) => {
              const ue = en(Q.type),
                re = ':' + B.substring(1) + ':' + ue,
                qt = [V.getProp(re, null), V.getProp(Jn + re, null)];
              let zn = !1;
              return (
                qt.flat(2).forEach((un) => {
                  if (un)
                    if (ai(un)) un(Q, O);
                    else {
                      const To = e.$scheduler$(2, V, un, [Q, O]);
                      zn = zn || To === !0;
                    }
                }),
                zn
              );
            })));
    }
    function ye(S, v, N) {
      wn(S);
      const A = Dt(S);
      let I = 0,
        F = 0,
        W = !1;
      const q = (O, Q) => {
          if (O.startsWith(':')) {
            S.setProp(O, Q);
            return;
          }
          if (O === 'ref') {
            const ue = S.element;
            if (de(Q)) {
              Q.value = ue;
              return;
            } else if (typeof Q == 'function') {
              Q(ue);
              return;
            } else throw H(15, [N]);
          }
          const B = S[se]?.get(O);
          if (de(Q)) {
            const ue = Q instanceof me ? Q.$unwrapIfSignal$() : Q;
            if (B?.[0] === ue) return;
            (B && Sr(e, B), (Q = it(ue, S, O, e, T)));
          } else B && Sr(e, B);
          S.setAttr(O, Q !== null ? _n(O, Q, r) : null, s);
        },
        V = (O, Q) => {
          const B = mr(O);
          if (B) {
            const [ue, re] = B;
            (q(':' + ue + ':' + re, Q), he(re), (W = !0));
          }
        };
      for (; I < v.length || F < A.length; ) {
        const O = I < v.length ? v[I] : void 0,
          Q = F < A.length ? A[F] : void 0;
        if (Q?.startsWith(Jn) || Q?.startsWith(hl)) {
          F += 2;
          continue;
        }
        if (O === void 0) tt(Q) ? (F += 2) : q(Q, null);
        else if (Q === void 0) {
          const B = v[I + 1];
          (tt(O) ? V(O, B) : q(O, B), (I += 2), (F += 2));
        } else if (O === Q) {
          const B = v[I + 1],
            ue = A[F + 1],
            re = tt(O);
          (B !== ue ? (re ? V(O, B) : q(O, B)) : re && !S.element.qDispatchEvent && V(O, B),
            (I += 2),
            (F += 2));
        } else if (O < Q) {
          const B = v[I + 1];
          (tt(O) ? V(O, B) : q(O, B), (I += 2), (F += 2));
        } else tt(Q) ? (F += 2) : q(Q, null);
      }
      return W;
    }
    function he(S) {
      const v = e.document.defaultView;
      v && (v.qwikevents || (v.qwikevents = [])).push(S);
    }
    function ve(S, v) {
      let N = null;
      if (g === null) {
        ((g = new Map()), (b = []));
        let A = c;
        for (; A; ) {
          const I = te(A) ? Ne(A) : null,
            F = Ve(A) || yt(A, e.$getObjectById$);
          (N === null && F == v && I == S
            ? (N = A)
            : F === null
              ? b.push(I, A)
              : g.set(Fe(I, F), A),
            (A = A.nextSibling));
        }
      } else if (v === null) {
        for (let A = 0; A < b.length; A += 2)
          if (b[A] === S) {
            ((N = b[A + 1]), b.splice(A, 2));
            break;
          }
      } else {
        const A = Fe(S, v);
        g.has(A) && ((N = g.get(A)), g.delete(A));
      }
      return (xo(N), N);
    }
    function xo(S) {
      if (!S) {
        if (c) {
          const N = te(c) ? Ne(c) : null,
            A = Ve(c) || yt(c, e.$getObjectById$);
          if (A != null) {
            const I = Fe(N, A);
            (P || (P = new Map()), P.set(I, c), g?.delete(I));
          }
        }
        return;
      }
      let v = c;
      for (; v && v !== S; ) {
        const N = te(v) ? Ne(v) : null,
          A = Ve(v) || yt(v, e.$getObjectById$);
        if (A != null) {
          const I = Fe(N, A);
          (P || (P = new Map()), P.set(I, v), g?.delete(I));
        }
        v = v.nextSibling;
      }
    }
    function Fe(S, v) {
      return v == null ? null : S ? S + ':' + v : v;
    }
    function an(S, v) {
      const N = Fe(S, v);
      return N && P?.has(N) ? (P.delete(N), !0) : !1;
    }
    function fn(S, v, N, A, I, F) {
      if (((a = ve(S, v)), a)) {
        ((c = a), (a = null));
        return;
      }
      if (N != null) {
        const W = P?.get(N) || null;
        if (W) {
          if ((P.delete(N), F && c)) {
            const q = Ve(c) || yt(c, e.$getObjectById$);
            if (q != null) {
              const V = te(c) ? Ne(c) : null,
                O = Fe(V, q);
              O != null && (P || (P = new Map()), P.set(O, c));
            }
          }
          (Le(s, A, W, c), (c = W), (a = null));
          return;
        }
      }
      return I();
    }
    function Wn(S, v) {
      const N = S === 'F',
        A = Ve(c);
      if (c && ce(c) && A === v && (N ? !!v : !0)) {
        an(null, A);
        return;
      }
      const F = () => {
        (Le(s, l, (a = wt()), c && w()), a.setProp(we, v));
      };
      if (N && v === null) {
        F();
        return;
      }
      fn(null, v, Fe(null, v), l, F, !0);
    }
    function ko(S) {
      const v = S[ht];
      let N = a || c;
      const A = d;
      if (v) {
        const I = A.props;
        let F = !1;
        const [W] = v,
          q = W.$hash$,
          V = yt(N, e.$getObjectById$),
          O = A.key || q,
          Q = Ve(N) || V;
        if (
          (O === Q
            ? !(q === V) || !A.key
              ? (us(N, W, I), (N = a), (F = !0))
              : an(null, O)
            : (fn(null, O, O, l, () => {
                (us(N, W, I), (F = !0));
              }),
              (N = a || c)),
          N)
        ) {
          let re = N.getProp(Ce, e.$getObjectById$),
            qt = !1;
          (F || ((qt = Os(I[Me], re?.[Me]) || Os(I[Pe], re?.[Pe])), (F = F || qt)),
            F &&
              (qt &&
                (re
                  ? ((re[Me] = I[Me]), (re[Pe] = I[Pe]), (re[kt] = I[kt]))
                  : I && (N.setProp(Ce, I), (re = I))),
              N.setProp(ge, W),
              (N.flags &= -33),
              e.$scheduler$(6, N, W, re)));
        }
        E(A.children, N);
      } else {
        const I = A.key,
          F = Ve(N),
          W = I === F,
          V = yt(N, e.$getObjectById$) == null;
        if (
          ((N && !V) || I == null
            ? ($s(), (N = a))
            : W
              ? an(null, I)
              : (fn(null, I, I, l, () => {
                  $s();
                }),
                (N = a || c)),
          N)
        ) {
          let O = N;
          for (; O && (!ce(O) || O.getProp(ge, null) === null); ) O = O.parent;
          const Q = es(e, N, O || e.rootVNode, S, A.props);
          o.push(Q, N);
        }
      }
    }
    function us(S, v, N) {
      (S && ut(e, S), Le(s, l, (a = wt()), c && w()));
      const A = d;
      (e.setHostProp(a, ge, v), e.setHostProp(a, Ce, N), e.setHostProp(a, we, A.key));
    }
    function $s() {
      Le(s, l, (a = wt()), c && w());
      const S = d;
      (a.setProp(Ce, S.props), S.key && a.setProp(we, S.key));
    }
    function Hn(S) {
      if (c !== null && wc(c) === 3) {
        if (S !== Ii(c)) {
          lc(s, c, S);
          return;
        }
        return;
      }
      Le(s, l, (a = Ti(e.document.createTextNode(S), S)), c);
    }
  };
function Ve(e) {
  return e == null ? null : e.getProp(we, null);
}
function yt(e, t) {
  if (e == null) return null;
  const n = e.getProp(ge, t);
  return n ? n.$hash$ : null;
}
function Rs() {}
function Os(e, t) {
  const n = Ds(e),
    r = Ds(t);
  if (n && r) return !1;
  if (n || r) return !0;
  const s = Object.keys(e),
    i = Object.keys(t);
  let o = s.length,
    l = i.length;
  if (('children' in e && o--, Et in e && o--, 'children' in t && l--, Et in t && l--, o !== l))
    return !0;
  for (const c of s)
    if (
      !(c === 'children' || c === Et) &&
      (!Object.prototype.hasOwnProperty.call(t, c) || e[c] !== t[c])
    )
      return !0;
  return !1;
}
function Ds(e) {
  return e ? Object.keys(e).length === 0 : !0;
}
function jt(e, t) {
  let n = t;
  if (Y(t)) {
    Yn(n);
    return;
  }
  let r = null;
  do {
    const s = n.flags;
    if (s & 3) {
      if ((ut(e, n), Yn(n), s & 2)) {
        const c = e.getHostProp(n, xt);
        if (c)
          for (let a = 0; a < c.length; a++) {
            const g = c[a];
            if (on(g)) {
              const b = g;
              (ut(e, b), b.$flags$ & 1 ? e.$scheduler$(32, b) : nn(b));
            }
          }
      }
      if (s & 2 && n.getProp(ge, null) !== null) {
        const c = Dt(n);
        for (let a = 0; a < c.length; a = a + 2) {
          const g = c[a];
          if (ts(g)) {
            const b = c[a + 1];
            if (b) {
              c[a + 1] = null;
              const P = typeof b == 'string' ? Mt(e.rootVNode, b) : b;
              let m = pe(P);
              for (; m; ) (jt(e, m), (m = m.nextSibling));
              Yc(e.$journal$, P);
            }
          }
        }
      }
      if (Gl(n)) {
        if (n === t) {
          const c = pe(n);
          if (c) {
            Jl(c, (a) => {
              a.flags & 2 && a.slotParent;
            });
            return;
          }
        }
      } else {
        const c = pe(n);
        if (c) {
          n = c;
          continue;
        }
      }
    } else s & 4 && Yn(n);
    if (n === t) return;
    const i = n.nextSibling;
    if (i) {
      n = i;
      continue;
    }
    for (r = n.parent; r; ) {
      if (r === t) return;
      const o = r.nextSibling;
      if (o) {
        n = o;
        break;
      }
      r = r.parent;
    }
    if (r == null) return;
  } while (!0);
}
function Yc(e, t) {
  const n = t.parent;
  n && n.flags & 1 && Ne(n) === ol && Yt(e, n, t, !0);
}
function Yn(e) {
  e.flags |= 32;
}
var Jn = ':',
  Gi = [
    { blockedType: 16, blockingType: 4, match: (e, t) => pn(e, t) || pn(t, e) },
    { blockedType: 16, blockingType: 6, match: (e, t) => pn(e, t) || pn(t, e) },
  ],
  Jc = [
    {
      blockedType: 2,
      blockingType: 1,
      match: (e, t) => {
        const n = e.$target$,
          r = t.$target$;
        return Zn(e, t) && er(n, r);
      },
    },
    {
      blockedType: 3,
      blockingType: 1,
      match: (e, t) => {
        const n = e.$payload$,
          r = t.$target$;
        return Zn(e, t) && er(n.$qrl$, r);
      },
    },
    {
      blockedType: 16,
      blockingType: 1,
      match: (e, t) => {
        const n = e.$payload$,
          r = t.$target$;
        return Zn(e, t) && er(n.$qrl$, r);
      },
    },
    { blockedType: 4, blockingType: 6, match: (e, t) => e.$host$ === t.$host$ },
    { blockedType: 5, blockingType: 6, match: (e, t) => e.$host$ === t.$host$ },
    ...Gi,
    {
      blockedType: 3,
      blockingType: 3,
      match: (e, t, n) => {
        if (e.$host$ !== t.$host$) return !1;
        const r = e.$idx$;
        return !jo(r) || r <= 0 ? !1 : Zc(e.$host$, r, n) === t.$payload$;
      },
    },
  ];
function pn(e, t) {
  const n = e.$host$,
    r = t.$host$;
  return !X(n) || !X(r) ? !1 : mc(n, r);
}
function Zn(e, t) {
  return e.$host$ === t.$host$;
}
function er(e, t) {
  return e.$symbol$ === t.$symbol$;
}
function Fs(e, t) {
  const n = e.$host$;
  if (!X(n)) return null;
  const r = t === 0;
  let s = n;
  for (s = An(s); s; ) {
    const i = r ? s.chores : s.blockedChores;
    if (i) {
      for (const o of i)
        if (o.$type$ < 16 && o.$type$ !== 3 && o.$type$ !== 1 && o.$type$ !== 2) return o;
    }
    s = An(s);
  }
  return null;
}
function Ls(e, t, n, r, s) {
  const i = Fs(e, 0);
  if (i) return i;
  const o = Fs(e, 1);
  if (o) return o;
  for (const l of Jc)
    if (e.$type$ === l.blockedType) {
      for (const c of t) if (c.$type$ === l.blockingType && l.match(e, c, s)) return c;
      for (const c of n) if (c.$type$ === l.blockingType && l.match(e, c, s)) return c;
      for (const c of r) if (c.$type$ === l.blockingType && l.match(e, c, s)) return c;
    }
  return null;
}
function Zc(e, t, n) {
  const r = n.getHostProp(e, xt);
  if (!r || r.length <= t) return null;
  for (let s = t - 1; s >= 0; s--) {
    const i = r[s];
    if (i instanceof Qt && i.$flags$ & 2) return i;
  }
  return null;
}
function ea(e, t, n) {
  for (const r of Gi)
    if (e.$type$ === r.blockedType) {
      for (const s of t) if (s.$type$ === r.blockingType && r.match(e, s, n)) return s;
    }
  return null;
}
var ta = (e) => {
    let t;
    if (typeof setImmediate == 'function')
      t = () => {
        setImmediate(e);
      };
    else if (typeof MessageChannel < 'u') {
      const n = new MessageChannel();
      ((n.port1.onmessage = () => {
        e();
      }),
        (t = () => {
          n.port2.postMessage(null);
        }));
    } else
      t = () => {
        setTimeout(e);
      };
    return t;
  },
  Vs = [],
  Ms = [],
  na = (e, t) => {
    if (e === t) return 0;
    let n = -1,
      r = -1;
    for (; e; ) e = (Vs[++n] = e).parent || e.slotParent;
    for (; t; ) t = (Ms[++r] = t).parent || t.slotParent;
    for (; n >= 0 && r >= 0; )
      if (((e = Vs[n]), (t = Ms[r]), e === t)) (n--, r--);
      else {
        let s = t;
        do if (((s = s.nextSibling), s === e)) return 1;
        while (s);
        s = t;
        do if (((s = s.previousSibling), s === e)) return -1;
        while (s);
        return t.slotParent ? -1 : 1;
      }
    return n < r ? -1 : 1;
  },
  Qs = [],
  qs = [],
  ra = (e, t) => {
    if (e === t) return 0;
    let n = -1,
      r = -1;
    for (; e; ) e = (Qs[++n] = e).parentComponent;
    for (; t; ) t = (qs[++r] = t).parentComponent;
    for (; n >= 0 && r >= 0; )
      if (((e = Qs[n]), (t = qs[r]), e === t)) (n--, r--);
      else return 1;
    return n < r ? -1 : 1;
  },
  rn = class extends Array {
    add(e) {
      const t = sa(this, e);
      if (t < 0) return (this.splice(~t, 0, e), t);
      const n = this[t];
      return (n.$payload$ !== e.$payload$ && (n.$payload$ = e.$payload$), t);
    }
    delete(e) {
      const t = this.indexOf(e);
      return (t >= 0 && this.splice(t, 1), t);
    }
  };
function sa(e, t) {
  let n = 0,
    r = e.length;
  for (; n < r; ) {
    const s = n + ((r - n) >> 1),
      i = e[s],
      o = Xi(t, i);
    if (o < 0) r = s;
    else if (o > 0) n = s + 1;
    else return s;
  }
  return ~n;
}
function Xi(e, t) {
  const n = (e.$type$ & 240) - (t.$type$ & 240);
  if (n !== 0) return n;
  const r = e.$host$,
    s = t.$host$;
  if (r !== s && r !== null && s !== null)
    if (X(r) && X(s)) {
      const l = na(r, s);
      if (l !== 0) return l;
    } else {
      (le(), le());
      const l = ra(r, s);
      if (l !== 0) return l;
    }
  const i = (e.$type$ & 15) - (t.$type$ & 15);
  if (i !== 0) return i;
  const o = Bs(e.$idx$) - Bs(t.$idx$);
  return o !== 0
    ? o
    : e.$target$ !== t.$target$
      ? Oe(e.$target$) && Oe(t.$target$) && e.$target$.$hash$ === t.$target$.$hash$
        ? 0
        : 1
      : e.$type$ === 7 &&
          t.$type$ === 7 &&
          ((e.$target$ instanceof kr && t.$target$ instanceof kr) ||
            (e.$target$ instanceof ft && t.$target$ instanceof ft)) &&
          e.$payload$ !== t.$payload$
        ? 1
        : 0;
}
function Bs(e) {
  return typeof e == 'number' ? e : -1;
}
var ia = !1,
  Yi = ((e) => (
    (e[(e.NONE = 0)] = 'NONE'),
    (e[(e.RUNNING = 1)] = 'RUNNING'),
    (e[(e.FAILED = 2)] = 'FAILED'),
    (e[(e.DONE = 3)] = 'DONE'),
    e
  ))(Yi || {}),
  ns = (e) =>
    e.$state$ === 0
      ? e.$returnValue$ ||
        (e.$returnValue$ = new Promise((t, n) => {
          ((e.$resolve$ = t), (e.$reject$ = n));
        }))
      : e.$returnValue$,
  oa = (e, t, n, r, s) => {
    let i = null,
      o = !1,
      l = !1,
      c = !1,
      a = 0,
      g = performance.now();
    const b = ta(U);
    let P = null;
    function m() {
      o || ((o = !0), b());
    }
    const d = Math.floor(1e3 / 60);
    return C;
    function C(u, w = null, E = null, R = null) {
      if (u === 255 && i) return i;
      const y = u === 3 || u === 16 || u === 32;
      y && (w.$flags$ |= 8);
      const _ = {
        $type$: u,
        $idx$: y ? w.$index$ : typeof E == 'string' ? E : 0,
        $host$: y ? w.$el$ : w,
        $target$: E,
        $payload$: y ? w : R,
        $state$: 0,
        $blockedChores$: null,
        $startTime$: void 0,
        $endTime$: void 0,
        $resolve$: void 0,
        $reject$: void 0,
        $returnValue$: null,
      };
      if (u === 255) return (ns(_), (i = _), m(), _);
      const D = be();
      if (D && (u === 4 || u === 1)) return (J(_, void 0), _);
      if (
        D &&
        _.$host$ &&
        Pi(_.$host$) &&
        !!!(_.$host$.flags & 1) &&
        _.$type$ !== 5 &&
        _.$type$ !== 7
      )
        return (
          `${Hs(_.$type$)}${Hs(_.$type$)}${_.$host$.toString()}${_.$host$.currentFile}`,
          Uo(),
          _
        );
      const ee = Ls(_, n, r, s, e);
      if (ee) return (tr(_, ee, r), _);
      const ae = f(_);
      return (ae ? tr(_, ae, r) : Ws(_, n), ((D && u === 6) || u === 2) && !l ? p() : m(), _);
    }
    function p() {
      ((o = !0), U());
    }
    function h() {
      P != null && (clearTimeout(P), (P = null));
    }
    function $() {
      if (be() || P != null) return;
      const E = performance.now() - a,
        R = Math.max(0, d - E);
      if (R === 0) {
        l || T();
        return;
      }
      P = setTimeout(() => {
        ((P = null), T());
      }, R);
    }
    function T() {
      c || ((c = !0), t(), (c = !1), (a = performance.now()), h());
    }
    function M(u) {
      return !u && g - a >= d;
    }
    function U() {
      const u = be();
      if (((o = !1), l)) return;
      if (!n.length) {
        (T(), i && !s.size && (i.$resolve$(null), (i = null)));
        return;
      }
      ((l = !0), (a = performance.now()), h());
      const w = () =>
          n.length
            ? (m(), !1)
            : i && s.size
              ? (M(u) && T(), !1)
              : ((R = null), T(), i?.$resolve$(null), (i = null), !0),
        E = (y) => {
          let _ = !1;
          if (y.$blockedChores$) {
            for (const D of y.$blockedChores$) {
              const j = Ls(D, n, r, s, e);
              j
                ? (j.$blockedChores$ || (j.$blockedChores$ = new rn())).add(D)
                : (r.delete(D),
                  X(D.$host$) && D.$host$.blockedChores?.delete(D),
                  Ws(D, n),
                  (_ = !0));
            }
            y.$blockedChores$ = null;
          }
          _ && !l && m();
        };
      let R = null;
      try {
        for (; n.length; ) {
          g = performance.now();
          const y = (R = n.shift());
          if (y.$state$ !== 0) continue;
          if (la(y) && y.$type$ !== 32) {
            (ia && ca('skip chore', y, n, r), X(y.$host$) && y.$host$.chores?.delete(y));
            continue;
          }
          if (y.$type$ === 16) {
            T();
            const D = ea(y, s, e);
            if (D && D.$state$ === 1) {
              tr(y, D, r);
              continue;
            }
          }
          y.$startTime$ = performance.now();
          const _ = x(y, u);
          if (
            ((y.$returnValue$ = _),
            K(_)
              ? (s.add(y),
                (y.$state$ = 1),
                _.then((D) => {
                  J(y, D);
                })
                  .catch((D) => {
                    y.$state$ === 1 && Z(y, D);
                  })
                  .finally(() => {
                    (s.delete(y), E(y));
                    let D = !1;
                    (i && !s.size && (D = w()), !D && !l && $());
                  }))
              : (J(y, _), E(y)),
            M(u))
          ) {
            (T(), m());
            return;
          }
        }
      } catch (y) {
        (Z(R, y), E(R));
      } finally {
        ((l = !1), w());
      }
    }
    function J(u, w) {
      ((u.$endTime$ = performance.now()),
        (u.$state$ = 3),
        (u.$returnValue$ = w),
        u.$resolve$?.(w),
        X(u.$host$) && u.$host$.chores?.delete(u));
    }
    function Z(u, w) {
      ((u.$endTime$ = performance.now()),
        (u.$state$ = 2),
        u.$reject$?.(w),
        e.handleError(w, u.$host$));
    }
    function x(u, w) {
      const E = u.$host$;
      let R;
      switch (u.$type$) {
        case 6:
          R = Dn(
            () => es(e, E, E, u.$target$, u.$payload$),
            (y) => {
              if (w) return y;
              {
                const _ = e.getHostProp(E, _t);
                return Ee(() => Is(e, y, E, ji(_)));
              }
            },
            (y) => {
              Z(u, y);
            }
          );
          break;
        case 2:
          {
            const y = u.$target$.getFn();
            R = Ee(() => y(...u.$payload$));
          }
          break;
        case 3:
        case 16:
          {
            const y = u.$payload$;
            y.$flags$ & 4 ? (R = Qi(y, e, E)) : (R = Jr(y, e, E));
          }
          break;
        case 32:
          {
            const y = u.$payload$;
            nn(y);
          }
          break;
        case 4:
          {
            const y = u.$target$;
            let _ = u.$payload$;
            (de(_) && (_ = _.value), (R = Ee(() => Is(e, _, y, null))));
          }
          break;
        case 5:
          {
            const y = u.$host$,
              _ = u.$payload$;
            let D = _.$value$;
            de(D) && (D = D.value);
            const j = _.$isConst$,
              ee = e.$journal$,
              ae = u.$idx$,
              fe = _n(ae, D, _.$scopedStyleIdPrefix$);
            if (w) (e.addBackpatchEntry(u.$host$.id, ae, fe), (R = null));
            else {
              if (j) {
                const Je = y.element;
                ee.push(2, Je, ae, fe);
              } else y.setAttr(ae, fe, ee);
              R = void 0;
            }
          }
          break;
        case 1: {
          {
            const y = u.$target$;
            R = y.resolved ? null : y.resolve();
          }
          break;
        }
        case 7: {
          {
            const y = u.$target$,
              _ = u.$payload$;
            if (!_?.size) break;
            let D = y instanceof Xe || y instanceof me;
            if ((y instanceof ft && _ !== y.$effects$ && (D = !1), D)) {
              const j = De();
              ((j.$container$ = e),
                (R = Zt(
                  Ee(() => He.call(y, j, y.$computeIfNeeded$)),
                  () => {
                    if (y.$flags$ & 2) return ((y.$flags$ &= -3), Ee(() => _r(e, y, _)));
                  }
                )));
            } else
              R = Ee(() => {
                _r(e, y, _);
              });
          }
          break;
        }
      }
      return R;
    }
    function f(u) {
      if (s.size) {
        for (const w of s) if (Xi(u, w) === 0) return w;
      }
      return null;
    }
  };
function la(e) {
  return !!(e.$host$ && X(e.$host$) && e.$host$.flags & 32);
}
function tr(e, t, n) {
  var r;
  ((t.$blockedChores$ || (t.$blockedChores$ = new rn())).add(e),
    n.add(e),
    X(e.$host$) && ((r = e.$host$).blockedChores || (r.blockedChores = new rn())).add(e));
}
function Ws(e, t) {
  var n;
  t.add(e) < 0 && X(e.$host$) && ((n = e.$host$).chores || (n.chores = new rn())).add(e);
}
function Hs(e) {
  return (
    {
      1: 'Resolve QRL',
      2: 'Run QRL',
      3: 'Task',
      4: 'Changes diffing',
      5: 'Updating node property',
      6: 'Component',
      7: 'Signal recompute',
      16: 'Visible',
      32: 'Cleanup visible',
      255: 'Wait for queue',
    }[e] || 'Unknown: ' + e
  );
}
function gn(e) {
  return (
    {
      1: 'QRL_RESOLVE',
      2: 'RUN_QRL',
      3: 'TASK',
      4: 'NODE_DIFF',
      5: 'NODE_PROP',
      6: 'COMPONENT',
      7: 'RECOMPUTE_SIGNAL',
      16: 'VISIBLE',
      32: 'CLEANUP_VISIBLE',
      255: 'WAIT_FOR_QUEUE',
    }[e] || 'UNKNOWN: ' + e
  );
}
function ca(e, t, n, r) {
  const s = [];
  if ((s.push(`Scheduler: ${e}`), t))
    if ((s.push(''), t && '$type$' in t)) {
      const i = t,
        o = gn(i.$type$),
        l = String(i.$host$).replaceAll(/\n.*/gim, ''),
        c = i.$target$?.$symbol$,
        a = i.$type$ === 1 || i.$type$ === 2 ? c : l;
      if (
        (s.push('🎯 Current Chore:'),
        s.push(`  Type: ${o}`),
        s.push(`  Host: ${a}`),
        i.$startTime$ && i.$endTime$)
      ) {
        const g = i.$endTime$ - i.$startTime$;
        s.push(`  Time: ${g.toFixed(2)}ms`);
      } else if (i.$startTime$) {
        const g = performance.now() - i.$startTime$;
        s.push(`  Time: ${g.toFixed(2)}ms (running)`);
      }
      i.$blockedChores$ &&
        i.$blockedChores$.length > 0 &&
        (s.push('  ⛔ Blocked Chores:'),
        i.$blockedChores$.forEach((g, b) => {
          const P = gn(g.$type$),
            m = String(g.$host$).replaceAll(/\n.*/gim, '');
          s.push(`    ${b + 1}. ${P} ${m} ${g.$idx$}`);
        }));
    } else s.push(`📝 Argument: ${String(t).replaceAll(/\n.*/gim, '')}`);
  if (n && n.length > 0) {
    (s.push(''), s.push(`📋 Queue (${n.length} items):`));
    for (let i = 0; i < n.length; i++) {
      const o = n[i],
        c = o === t ? '▶ ' : '  ',
        a = gn(o.$type$),
        g = o.$state$ ? `[${Yi[o.$state$]}]` : '',
        b = String(o.$host$).replaceAll(/\n.*/gim, ''),
        P = o.$target$?.$symbol$,
        m = o.$type$ === 1 || o.$type$ === 2 ? P : b,
        d = `${c}${g} ${a} ${m} ${o.$idx$}`;
      s.push(d);
    }
  }
  (r &&
    r.size > 0 &&
    (s.push(''),
    s.push(`🚫 Blocked Chores (${r.size} items):`),
    Array.from(r).forEach((i, o) => {
      const l = gn(i.$type$),
        c = String(i.$host$).replaceAll(/\n.*/gim, ''),
        a = i.$target$?.$symbol$,
        g = i.$type$ === 1 || i.$type$ === 2 ? a : c;
      s.push(`  ${o + 1}. ${l} ${g} ${i.$idx$}`);
    })),
    s.push(''),
    s.push('─'.repeat(60)),
    console.log(
      s.join(`
`) +
        `
`
    ));
}
var aa = (...e) => {
    const [t] = qn(),
      n = Fi(),
      r = n.$hostElement$;
    if (!r) return;
    const i = Ie(n.$element$).$scheduler$;
    if (!i) throw H(1);
    const o = i(2, r, t, e);
    return ns(o);
  },
  _f = (e, t, n) => new me(null, e, t, n);
async function fa(e) {
  const {
    $writer$: t,
    $isSsrNode$: n,
    $isDomRef$: r,
    $storeProxyMap$: s,
    $addRoot$: i,
    $promoteToRoot$: o,
    getSeenRef: l,
    $markSeen$: c,
  } = e;
  let a = 0;
  const g = [];
  let b = 0;
  const P = new Set(),
    m = new Set(),
    d = new Map();
  let C;
  const p = new Map(),
    h = (f, u, w) => {
      t.write('[');
      let E = !1,
        R;
      if (u) R = f.length;
      else {
        for (R = f.length - 1; R >= 0 && f[R] === null; ) R--;
        R++;
      }
      for (let y = 0; y < R; y++) (E ? t.write(',') : (E = !0), w(f[y], y));
      t.write(']');
    },
    $ = (f, u, w) => {
      if ((t.write(`${f},`), typeof u == 'number')) t.write(u.toString());
      else if (typeof u == 'string') {
        const E = JSON.stringify(u);
        let R = -1,
          y = 0;
        for (; (R = E.indexOf('</', y)) !== -1; )
          (t.write(E.slice(y, R)), t.write('<\\/'), (y = R + 2));
        t.write(y === 0 ? E : E.slice(y));
      } else
        h(u, w, (E, R) => {
          U(E, R);
        });
    },
    T = (f) => {
      (m.add(f), e.$addRoot$(f));
    },
    M = (f, u, w) => {
      let E = l(f);
      const R = !w && d.get(f);
      if (!E) {
        if (w) return !0;
        if (typeof R == 'number') E = i(f, !0);
        else return c(f, C, u);
      }
      (E.$parent$ && (C ? o(E) : (o(E, u), (f = e.$roots$[u]))),
        typeof R == 'number' && ((g[R] = E.$index$), d.delete(f)));
      const y = f instanceof Ar ? f.$path$ : E.$index$;
      if (!C && y === u) return E;
      $(1, y);
    },
    U = (f, u) => {
      if (rr(f)) $(3, 0);
      else
        switch (typeof f) {
          case 'undefined':
            $(3, 0);
            break;
          case 'boolean':
            $(3, f ? 2 : 3);
            break;
          case 'number':
            Number.isNaN(f)
              ? $(3, 12)
              : Number.isFinite(f)
                ? f === Number.MAX_SAFE_INTEGER
                  ? $(3, 15)
                  : f === Number.MAX_SAFE_INTEGER - 1
                    ? $(3, 16)
                    : f === Number.MIN_SAFE_INTEGER
                      ? $(3, 17)
                      : $(0, f)
                : $(3, f < 0 ? 14 : 13);
            break;
          case 'string':
            f.length === 0 ? $(3, 4) : (f.length < 4 || M(f, u)) && $(0, f);
            break;
          case 'bigint':
            ((f < 1e4 && f > -1e3) || M(f, u)) && $(11, f.toString());
            break;
          case 'symbol':
            f === oe ? $(3, 7) : f === Qe ? $(3, 8) : f === Tt && $(3, 9);
            break;
          case 'function':
            if (f === sn) $(3, 10);
            else if (f === Te) $(3, 11);
            else if (Oe(f)) {
              if (M(f, u)) {
                const [w, E, R] = qi(e, f, !0);
                let y;
                if (w !== '') {
                  y = `${i(w)} ${i(E)}${R ? ' ' + R.join(' ') : ''}`;
                  const D = p.get(y);
                  if (D) {
                    const j = i(D);
                    $(1, j);
                    return;
                  } else p.set(y, f);
                } else y = Number(E);
                const _ = m.has(f) ? 20 : 19;
                $(_, y);
              }
            } else if (pt(f)) {
              const [w] = f[ht];
              (e.$renderSymbols$.add(w.$symbol$), $(23, [w]));
            } else throw H(34, [f.toString()]);
            break;
          case 'object':
            if (f === Ae) $(3, 5);
            else if (f === qe) $(3, 6);
            else if (f === null) $(3, 1);
            else if (f instanceof Ar) $(1, f.$path$);
            else {
              const w = M(f, u);
              if (w) {
                const E = C;
                ((C = w), J(f), (C = E));
              }
            }
            break;
          default:
            throw H(20, [typeof f]);
        }
    },
    J = (f) => {
      if (Ci(f)) {
        const u = f[kt];
        $(32, [ma(u), u.varProps, u.constProps]);
      } else if (f instanceof Lt) $(33, [f.data.$scopedStyleIdPrefix$, f.data.$isConst$]);
      else if (cn(f))
        if (da(f)) {
          e.$resources$.add(f);
          const u = Z(f.value, i, (w, E) => new Wt(22, w, E, Ue(f).$effects$));
          $(2, u);
        } else {
          const u = Ue(f),
            w = ln(f),
            E = u.$flags$,
            R = u.$effects$,
            y = [];
          for (const D in w) {
            const j = w[D],
              ee = s.get(j);
            ee && y.push(ee);
          }
          const _ = [w, E, R, ...y];
          for (; _[_.length - 1] == null; ) _.pop();
          $(29, _);
        }
      else if (Ra(f)) {
        const u = f[kn](f);
        if (K(u)) {
          const w = Z(u, i, (E, R) => new Wt(28, E, R, null, null));
          $(2, w);
        } else {
          const w = C.$index$;
          ((C = C.$parent$), U(u, w));
        }
      } else if (ha(f))
        if (Array.isArray(f)) $(4, f);
        else {
          const u = [];
          for (const w in f)
            if (Object.prototype.hasOwnProperty.call(f, w)) {
              const E = f[w];
              rr(E) || u.push(w, E);
            }
          $(5, u.length ? u : 0);
        }
      else if (r(f)) ((f.$ssrNode$.vnodeData[0] |= 16), $(10, f.$ssrNode$.id));
      else if (f instanceof Ge) {
        if (f instanceof Ai) {
          T(f.$computeQrl$);
          const u = Z(
            ua(f, f.$untrackedValue$),
            i,
            (w, E) => new Wt(28, w, E, f.$effects$, f.$computeQrl$)
          );
          $(2, u);
          return;
        }
        if (f instanceof me)
          $(25, [...pa(e, f), ga(f[se]), f.$flags$, f.$hostElement$, ...(f.$effects$ || [])]);
        else if (f instanceof Xe) {
          let u = f.$untrackedValue$;
          const w = f.$flags$ & 32,
            E = f.$flags$ & 16,
            R = f.$flags$ & 1,
            y = rr(f.$untrackedValue$);
          (w ? (u = f.$untrackedValue$) : (E || R || y) && (u = oe), T(f.$computeQrl$));
          const _ = [f.$computeQrl$, f.$effects$],
            D = f instanceof ft;
          (D &&
            _.push(f.$loadingEffects$, f.$errorEffects$, f.$untrackedLoading$, f.$untrackedError$),
            u !== oe && _.push(u),
            $(D ? 27 : 26, _));
        } else $(24, [f.$untrackedValue$, ...(f.$effects$ || [])]);
      } else if (f instanceof URL) $(6, f.href);
      else if (f instanceof Date) $(7, Number.isNaN(f.valueOf()) ? '' : f.valueOf());
      else if (f instanceof RegExp) $(8, f.toString());
      else if (f instanceof Error) {
        const u = [f.message];
        (u.push(...Object.entries(f).flat()), $(14, u));
      } else if (n(f)) {
        const u = i(f);
        (e.$setProp$(f, $l, String(u)), $(9, f.id));
        const w = f.vnodeData;
        if ((w && ($a(w, (E) => i(E)), (w[0] |= 16)), f.children))
          for (const E of f.children) {
            const R = E.vnodeData;
            if (R) {
              for (const y of R)
                if (Ji(y)) {
                  const _ = y.findIndex((D) => D === Et);
                  _ !== -1 && i(y[_ + 1]);
                }
              R[0] |= 16;
            }
          }
      } else if (typeof FormData < 'u' && f instanceof FormData) {
        const u = [];
        (f.forEach((w, E) => {
          typeof w == 'string' ? u.push(E, w) : u.push(E, w.name);
        }),
          $(30, u));
      } else if (f instanceof URLSearchParams) $(12, f.toString());
      else if (f instanceof Set) $(16, [...f.values()]);
      else if (f instanceof Map) {
        const u = [];
        for (const [w, E] of f.entries()) u.push(w, E);
        $(17, u);
      } else if (ze(f)) {
        const u = [f.type, f.key, f.varProps, f.constProps, f.children, f.toSort || null];
        for (; u[u.length - 1] == null; ) u.pop();
        $(31, u);
      } else if (f instanceof Qt) {
        const u = [f.$qrl$, f.$flags$, f.$index$, f.$el$, f[se], f.$state$];
        for (; u[u.length - 1] == null; ) u.pop();
        $(21, u);
      } else if (K(f)) {
        const u = Z(f, i, (w, E) => new Wt(15, w, E));
        $(2, u);
      } else if (f instanceof Wt)
        if (f.$type$ === 22) $(22, [f.$resolved$, f.$value$, f.$effects$]);
        else if (f.$type$ === 28)
          if (f.$qrl$) $(28, [f.$qrl$, f.$effects$, f.$value$]);
          else if (f.$resolved$) {
            const u = C.$index$;
            ((C = C.$parent$), U(f.$value$, u));
          } else throw (console.error(f.$value$), H(33));
        else $(15, [f.$resolved$, f.$value$]);
      else if (f instanceof Uint8Array) {
        let u = '';
        for (const E of f) u += String.fromCharCode(E);
        const w = btoa(u).replace(/=+$/, '');
        $(18, w);
      } else if (f instanceof Zi) {
        const u = f.$obj$;
        if (M(u, C.$index$, !0)) {
          let w = d.get(u);
          (w === void 0 && ((w = b++), d.set(u, w), (g[w] = -1)), $(2, w));
        }
      } else if (X(f)) $(3, 0);
      else throw H(20, [typeof f]);
    };
  function Z(f, u, w) {
    const E = b++;
    return (
      f
        .then((R) => {
          (P.delete(f), (g[E] = u(w(!0, R))));
        })
        .catch((R) => {
          (P.delete(f), (g[E] = u(w(!1, R))));
        }),
      P.add(f),
      E
    );
  }
  await (async () => {
    t.write('[');
    const { $roots$: f } = e;
    for (; a < f.length || P.size; ) {
      a !== 0 && t.write(',');
      let u = !1;
      for (; a < f.length; a++) (u ? t.write(',') : (u = !0), U(f[a], a));
      if (P.size)
        try {
          await Promise.race(P);
        } catch {}
    }
    if (g.length) {
      let u = g.length - 1;
      for (; u >= 0 && g[u] === -1; ) u--;
      if (u >= 0) {
        (t.write(','), t.write('13,'));
        const w = u === g.length - 1 ? g : g.slice(0, u + 1);
        h(w, !0, (E) => {
          t.write(String(E));
        });
      }
    }
    t.write(']');
  })();
}
var Wt = class {
  constructor(e, t, n, r = null, s = null) {
    ((this.$type$ = e),
      (this.$resolved$ = t),
      (this.$value$ = n),
      (this.$effects$ = r),
      (this.$qrl$ = s));
  }
};
function ua(e, t) {
  return new Promise((n) => {
    e.$computeQrl$.resolve().then((r) => {
      let s;
      (r.serialize ? (s = r.serialize(t)) : kn in t && (s = t[kn](t)),
        s === void 0 && (s = oe),
        n(s));
    });
  });
}
var $a = (e, t) => {
    for (const n of e)
      if (Ji(n))
        for (let r = 1; r < n.length; r += 2) {
          const s = n[r - 1],
            i = n[r];
          i == null || typeof i == 'string' || (s === Ce && Object.keys(i).length === 0) || t(i);
        }
  },
  Ji = (e) => Array.isArray(e) && e.length > 0;
function ha(e) {
  const t = Object.getPrototypeOf(e);
  return t == null || t === Object.prototype || t === Array.prototype;
}
function da(e) {
  return '__brand' in e && e.__brand === 'resource';
}
function pa(e, t) {
  return (
    t.$funcStr$ && t.$funcStr$[0] === '{' && (t.$funcStr$ = `(${t.$funcStr$})`),
    [e.$addSyncFn$(t.$funcStr$, t.$args$.length, t.$func$), t.$args$]
  );
}
function ga(e) {
  let t = null;
  if (e) for (const [n, r] of e) r[2] && (t || (t = new Map()), t.set(n, r));
  return t;
}
var Zi = class {
    constructor(e) {
      this.$obj$ = e;
    }
  },
  ma = (e) => new Zi(e),
  Pr = (e) => !1,
  Ar = class {
    constructor(e) {
      this.$path$ = e;
    }
  },
  eo = (e, t, n, r, s, i, o) => {
    if (!o) {
      const h = [];
      o = { write: ($) => h.push($), toString: () => h.join('') };
    }
    const l = new Map(),
      c = new Map(),
      a = [],
      g = [],
      b = (h) => l.get(h),
      P = (h, $, T) => {
        const M = { $index$: T, $parent$: $ };
        return (l.set(h, M), M);
      },
      m = (h) => {
        const $ = [];
        for (; h.$parent$; ) ($.unshift(h.$index$), (h = h.$parent$));
        return ($.unshift(h.$index$), $.join(' '));
      },
      d = (h, $) => {
        const T = m(h);
        ($ === void 0 && ($ = g.length), (g[$] = new Ar(T)), (h.$parent$ = null), (h.$index$ = $));
      },
      C = (h, $) => {
        let T = l.get(h),
          M;
        return (
          T
            ? (T.$parent$ && d(T), (M = T.$index$))
            : ((M = g.length), (T = { $index$: M }), l.set(h, T), g.push(h)),
          $ ? T : M
        );
      },
      p = e ? (h) => h instanceof e : () => !1;
    return (
      (Pr = t ? (h) => h instanceof t : () => !1),
      {
        async $serialize$() {
          return await fa(this);
        },
        $isSsrNode$: p,
        $isDomRef$: Pr,
        $symbolToChunkResolver$: n,
        getSeenRef: b,
        $roots$: g,
        $markSeen$: P,
        $hasRootId$: (h) => {
          const $ = l.get(h);
          return $ && ($.$parent$ ? void 0 : $.$index$);
        },
        $promoteToRoot$: d,
        $addRoot$: C,
        $syncFns$: a,
        $addSyncFn$: (h, $, T) => {
          const M = h == null;
          M && (h = T.serialized || T.toString());
          let U = c.get(h);
          if (U === void 0)
            if (((U = a.length), c.set(h, U), M)) a.push(h);
            else {
              let J = '(';
              for (let Z = 0; Z < $; Z++) J += (Z == 0 ? 'p' : ',p') + Z;
              a.push((J += ')=>' + h));
            }
          return U;
        },
        $writer$: o,
        $eventQrls$: new Set(),
        $eventNames$: new Set(),
        $resources$: new Set(),
        $renderSymbols$: new Set(),
        $storeProxyMap$: i,
        $getProp$: r,
        $setProp$: s,
      }
    );
  },
  Sa = class {
    constructor(e, t, n) {
      (k(this, '$version$'),
        k(this, '$scheduler$'),
        k(this, '$storeProxyMap$'),
        k(this, '$locale$'),
        k(this, '$getObjectById$'),
        k(this, '$serverData$'),
        k(this, '$currentUniqueId$', 0),
        k(this, '$instanceHash$', null),
        k(this, '$buildBase$', null),
        k(this, '$flushEpoch$', 0),
        (this.$serverData$ = t),
        (this.$locale$ = n),
        (this.$version$ = Qr),
        (this.$storeProxyMap$ = new WeakMap()),
        (this.$getObjectById$ = (o) => {
          throw Error('Not implemented');
        }));
      const r = new rn(),
        s = new Set(),
        i = new Set();
      this.$scheduler$ = oa(this, e, r, s, i);
    }
    trackSignalValue(e, t, n, r) {
      return it(e, t, n, this, r);
    }
    serializationCtxFactory(e, t, n, r) {
      return eo(
        e,
        t,
        n,
        this.getHostProp.bind(this),
        this.setHostProp.bind(this),
        this.$storeProxyMap$,
        r
      );
    }
  };
function ya(e) {
  return !!e[Symbol.asyncIterator];
}
var wa = (e, t, n, r) => {
    const s = e.getOrCreateLastNode();
    return es(e, s, t, n, r.props);
  },
  ba = (e, t, n) => {
    const r = e.getOrCreateLastNode(),
      [s] = n[ht],
      i = t.props;
    (i && i.children && delete i.children,
      r.setProp(ge, s),
      r.setProp(Ce, i),
      t.key !== null && r.setProp(we, t.key));
    const o = e.$scheduler$(6, r, s, i);
    return ns(o);
  },
  Kt = class {
    constructor(e, t) {
      ((this.$scopedStyle$ = e), (this.$componentFrame$ = t));
    }
  },
  to = class {};
async function zs(e, t, n) {
  const r = [t],
    s = (o) => r.push(o);
  await (async () => {
    for (; r.length; ) {
      const o = r.pop();
      if (o instanceof Kt) {
        ((n.currentStyleScoped = o.$scopedStyle$), (n.parentComponentFrame = o.$componentFrame$));
        continue;
      } else if (o === to) {
        const l = r.pop();
        await Ee(() => r.push(l()));
        continue;
      } else if (typeof o == 'function') {
        if (o === Promise) {
          r.push(await r.pop());
          continue;
        }
        await o.apply(e);
        continue;
      }
      va(e, s, o, {
        styleScoped: n.currentStyleScoped,
        parentComponentFrame: n.parentComponentFrame,
      });
    }
  })();
}
function va(e, t, n, r) {
  if (n == null) e.textNode('');
  else if (typeof n == 'boolean') e.textNode('');
  else if (typeof n == 'number') e.textNode(String(n));
  else if (typeof n == 'string') e.textNode(n);
  else if (typeof n == 'object')
    if (Array.isArray(n)) for (let s = n.length - 1; s >= 0; s--) t(n[s]);
    else if (de(n)) {
      e.openFragment(Ae);
      const s = e.getOrCreateLastNode(),
        i = n instanceof me ? n.$unwrapIfSignal$() : n;
      (t(e.closeFragment), t(() => it(i, s, '.', e)), t(to));
    } else if (K(n))
      (e.openFragment(Ae), t(e.closeFragment), t(n), t(Promise), t(() => e.commentNode($n)));
    else if (ya(n))
      t(async () => {
        for await (const s of n)
          (await zs(e, s, {
            currentStyleScoped: r.styleScoped,
            parentComponentFrame: r.parentComponentFrame,
          }),
            e.commentNode($n));
      });
    else {
      const s = n,
        i = s.type;
      if (typeof i == 'string') {
        Aa(s, r.styleScoped);
        const l = e.openElement(
          i,
          Ea(s.varProps, s.constProps, {
            serializationCtx: e.serializationCtx,
            styleScopedId: r.styleScoped,
            key: s.key,
            toSort: s.toSort,
          }),
          Na(s.constProps, s.varProps, {
            serializationCtx: e.serializationCtx,
            styleScopedId: r.styleScoped,
          }),
          null
        );
        (l && e.htmlNode(l),
          t(e.closeElement),
          i === 'head'
            ? (e.emitQwikLoaderAtTopIfNeeded(), e.emitPreloaderPre(), t(e.additionalHeadNodes))
            : i === 'body'
              ? t(e.additionalBodyNodes)
              : !e.isHtml &&
                !e._didAddQwikLoader &&
                (e.emitQwikLoaderAtTopIfNeeded(),
                e.emitPreloaderPre(),
                (e._didAddQwikLoader = !0)));
        const c = s.children;
        c != null && t(c);
      } else if (Be(i))
        if (i === Te) {
          let o = s.key != null ? [we, s.key] : Ae;
          (e.openFragment(o), t(e.closeFragment));
          const l = s.children;
          l != null && t(l);
        } else if (i === sn) {
          const o = r.parentComponentFrame || e.unclaimedProjectionComponentFrameQueue.shift();
          if (o) {
            const l = o.componentNode.id || '',
              c = [];
            (c.push(Xo, l), e.openProjection(c));
            const a = o.componentNode,
              g = e.getOrCreateLastNode(),
              b = Pa(a, s, e);
            (c.push(rt, b), t(new Kt(r.styleScoped, r.parentComponentFrame)), t(e.closeProjection));
            const P = s.children || null,
              m = o.consumeChildrenForSlot(g, b) || P;
            (P && m !== P && e.addUnclaimedProjection(o, Nn, P),
              t(m),
              t(new Kt(o.projectionScopedStyle, o.projectionComponentFrame)));
          } else (e.openFragment(Ae), e.closeFragment());
        } else if (i === zi) e.commentNode(at(s, 'data') || '');
        else if (i === Dc) {
          e.commentNode($n);
          const o = s.children;
          let l;
          (Be(o)
            ? (l = o({
                async write(c) {
                  (await zs(e, c, {
                    currentStyleScoped: r.styleScoped,
                    parentComponentFrame: r.parentComponentFrame,
                  }),
                    e.commentNode($n));
                },
              }))
            : (l = o),
            t(l),
            K(l) && t(Promise));
        } else if (i === Hi) e.htmlNode(at(s, 'data'));
        else if (pt(i)) {
          e.openComponent([]);
          const o = e.getOrCreateLastNode(),
            l = e.getParentComponentFrame();
          l.distributeChildrenIntoSlots(s.children, r.styleScoped, r.parentComponentFrame);
          const c = ba(e, s, i),
            a = ji(o.getProp(_t));
          (t(new Kt(r.styleScoped, r.parentComponentFrame)),
            t(e.closeComponent),
            t(c),
            K(c) && t(Promise),
            t(new Kt(a, l)));
        } else {
          const o = [we, s.key];
          (e.openFragment(o), t(e.closeFragment));
          const l = e.getComponentFrame(0),
            c = wa(e, l && l.componentNode, i, s);
          (t(c), K(c) && t(Promise));
        }
    }
}
function Ea(e, t, n) {
  return no(e, n);
}
function Na(e, t, n) {
  return no(e, n);
}
function no(e, t) {
  if (e == null) return null;
  const n = [],
    r = (s, i) => {
      if (i != null) {
        if (tt(s)) {
          const o = ro(t.serializationCtx, s, i);
          o && n.push(s, o);
          return;
        }
        if (de(i)) {
          Ui(s) ? n.push(s, [i, t.styleScopedId]) : n.push(s, i);
          return;
        }
        (Ei(s) && Ca(t.serializationCtx, s), (i = _n(s, i, t.styleScopedId)), n.push(s, i));
      }
    };
  if (t.toSort) {
    const s = Object.keys(e).sort();
    for (const i of s) r(i, e[i]);
  } else for (const s in e) r(s, e[s]);
  return (t.key != null && n.push(we, t.key), n);
}
function ro(e, t, n) {
  let r = null;
  const s = n,
    i = (l) => {
      r =
        (r == null
          ? ''
          : r +
            `
`) + l;
    },
    o = (l) => (
      !l.$symbol$.startsWith('_') &&
        (l.$captureRef$ || l.$capture$) &&
        (l = je(null, '_run', aa, null, null, [l])),
      qi(e, l)
    );
  if (Array.isArray(s))
    for (let l = 0; l <= s.length; l++) {
      const c = s[l];
      if (Oe(c)) (i(o(c)), Us(e, t, c));
      else if (c != null) {
        const a = ro(e, t, c);
        a && i(a);
      }
    }
  else Oe(s) && ((r = o(s)), Us(e, t, s));
  return r;
}
function Us(e, t, n) {
  const r = mr(t);
  if (r) {
    const s = r[1];
    (e.$eventNames$.add(s), e.$eventQrls$.add(n));
  }
}
function Ca(e, t) {
  const n = t.substring(15);
  n && e.$eventNames$.add(n);
}
function Pa(e, t, n) {
  const r = t.constProps;
  if (r && typeof r == 'object' && 'name' in r) {
    const s = r.name;
    if (s instanceof me) return it(s, e, ':', n);
  }
  return at(t, 'name') || Nn;
}
function Aa(e, t) {
  !(at(e, 'class') != null) &&
    t &&
    (e.constProps || (e.constProps = {}), (e.constProps.class = ''));
}
var rs = (e, t, n, r) => {
    if (n !== 0)
      switch ((n !== 4 && Array.isArray(r) && (r = js(e, r)), n)) {
        case 4:
          js(e, r, t);
          break;
        case 5:
          if (r === 0) break;
          for (let p = 0; p < r.length; p += 2) {
            const h = r[p],
              $ = r[p + 1];
            t[h] = $;
          }
          break;
        case 19:
        case 20:
          so(e, t);
          break;
        case 21:
          const s = t,
            i = r;
          ((s.$qrl$ = i[0]),
            (s.$flags$ = i[1]),
            (s.$index$ = i[2]),
            (s.$el$ = i[3]),
            (s[se] = i[4]),
            (s.$state$ = i[5]));
          break;
        case 22:
          const [o, l, c] = r,
            a = t;
          (o
            ? ((a.value = Promise.resolve(l)), (a._resolved = l), (a._state = 'resolved'))
            : ((a.value = Promise.reject(l)), (a._error = l), (a._state = 'rejected')),
            (Ue(t).$effects$ = c));
          break;
        case 23:
          t[ht][0] = r[0];
          break;
        case 29: {
          const p = t,
            h = Nr.get(p);
          h && (Nr.delete(p), rs(e, p, h.t, h.v));
          const [, $, T] = r,
            M = Ue(p);
          ((M.$flags$ = $), (M.$effects$ = T));
          break;
        }
        case 24: {
          const p = t,
            h = r;
          ((p.$untrackedValue$ = h[0]), (p.$effects$ = new Set(h.slice(1))));
          break;
        }
        case 25: {
          const p = t,
            h = r;
          ((p.$func$ = e.getSyncFn(h[0])),
            (p.$args$ = h[1]),
            (p[se] = h[2]),
            (p.$untrackedValue$ = oe),
            (p.$flags$ = h[3]),
            (p.$flags$ |= 1),
            (p.$hostElement$ = h[4]),
            (p.$effects$ = new Set(h.slice(5))),
            _a(p));
          break;
        }
        case 27: {
          const p = t,
            h = r;
          ((p.$computeQrl$ = h[0]),
            (p.$effects$ = new Set(h[1])),
            (p.$loadingEffects$ = new Set(h[2])),
            (p.$errorEffects$ = new Set(h[3])),
            (p.$untrackedLoading$ = h[4]),
            (p.$untrackedError$ = h[5] || null),
            h.length > 6 && (p.$untrackedValue$ = h[6]),
            (p.$flags$ |= 1));
          break;
        }
        case 28:
        case 26: {
          const p = t,
            h = r;
          ((p.$computeQrl$ = h[0]),
            (p.$effects$ = new Set(h[1])),
            h.length > 2
              ? ((p.$untrackedValue$ = h[2]), n === 28 && (p.$flags$ |= 1))
              : ((p.$flags$ |= 1),
                p.$computeQrl$.resolve(),
                e.$scheduler$(1, null, p.$computeQrl$)));
          break;
        }
        case 14: {
          const p = r;
          t.message = p[0];
          for (let h = 1; h < p.length; h += 2) t[p[h]] = p[h + 1];
          break;
        }
        case 30: {
          const p = t,
            h = r;
          for (let $ = 0; $ < h.length; $++) p.append(h[$++], h[$]);
          break;
        }
        case 31: {
          const p = t,
            [h, $, T, M, U, J] = r;
          ((p.type = h),
            (p.key = $),
            (p.varProps = T),
            (p.constProps = M || null),
            (p.children = U),
            (p.toSort = !!J));
          break;
        }
        case 16: {
          const p = t,
            h = r;
          for (let $ = 0; $ < h.length; $++) p.add(h[$]);
          break;
        }
        case 17: {
          const p = t,
            h = r;
          for (let $ = 0; $ < h.length; $++) p.set(h[$++], h[$]);
          break;
        }
        case 15: {
          const p = t,
            [h, $] = r,
            [T, M] = Bi.get(p);
          h ? T($) : M($);
          break;
        }
        case 18:
          const g = t,
            b = atob(r);
          let P = 0;
          for (const p of b) g[P++] = p.charCodeAt(0);
          break;
        case 32:
          const m = t,
            d = r;
          let C = d[0];
          (C === Tt && ((C = new Ye(Te, d[1], d[2])), (C._proxy = m)), (m[kt] = C));
          break;
        case 33: {
          const p = t;
          ((p.data.$scopedStyleIdPrefix$ = r[0]), (p.data.$isConst$ = r[1]));
          break;
        }
        default:
          throw H(16, [n]);
      }
  },
  js = (e, t, n = Array(t.length / 2)) => {
    for (let r = 0; r < t.length; r += 2) n[r / 2] = io(e, t[r], t[r + 1]);
    return n;
  };
function so(e, t) {
  if (t.$captureRef$) return t;
  const n = t.$capture$;
  return (
    (t.$captureRef$ = n ? n.map((r) => e.$getObjectById$(r)) : null),
    (t.$capture$ = null),
    e.element && t.$setContainer$(e.element),
    t
  );
}
function io(e, t, n) {
  if (t === 0) return n;
  const r = Zr(e, t, n);
  return (ss(t) && rs(e, r, t, n), r);
}
function _a(e) {
  if (e.$hostElement$ !== null && X(e.$hostElement$)) {
    const t = e.$hostElement$,
      n = e.$effects$;
    let r = !1;
    if (n) {
      for (const [s, i] of n)
        if (li(i)) {
          const o = t.getAttr(i);
          if (o !== null) {
            ((e.$untrackedValue$ = o), (r = !0));
            break;
          }
        }
    }
    if (!r) {
      const s = pe(t);
      s && t.firstChild === t.lastChild && Y(s) && (e.$untrackedValue$ = Ii(s));
    }
  }
}
var ss = (e) => e >= 14 || e === 4 || e === 5,
  Ks = new WeakMap(),
  xa = (e) => Ke(e) && bn in e,
  bn = Symbol('UNWRAP'),
  oo = (e, t) => {
    if (!Array.isArray(t) || X(t) || xa(t)) return t;
    let n = Ks.get(t);
    if (!n) {
      const r = Array(t.length / 2).fill(void 0);
      ((n = new Proxy(r, new ka(e, t))), Ks.set(t, n));
    }
    return n;
  },
  ka = class {
    constructor(e, t) {
      ((this.$container$ = e),
        (this.$data$ = t),
        k(this, '$length$'),
        (this.$length$ = this.$data$.length / 2));
    }
    get(e, t, n) {
      if (t === bn) return e;
      const r = typeof t == 'number' ? t : typeof t == 'string' ? parseInt(t, 10) : NaN;
      if (Number.isNaN(r) || r < 0 || r >= this.$length$) return Reflect.get(e, t, n);
      const s = r * 2,
        i = this.$data$[s],
        o = this.$data$[s + 1];
      if (i === 0) return o;
      const l = this.$container$,
        c = Zr(l, i, o);
      return (
        Reflect.set(e, t, c),
        (this.$data$[s] = 0),
        (this.$data$[s + 1] = c),
        ss(i) && rs(l, c, i, o),
        c
      );
    }
    has(e, t) {
      return t === bn ? !0 : Object.prototype.hasOwnProperty.call(e, t);
    }
    set(e, t, n, r) {
      if (t === bn) return !1;
      const s = Reflect.set(e, t, n, r),
        i = typeof t == 'number' ? t : parseInt(t, 10);
      if (Number.isNaN(i) || i < 0 || i >= this.$data$.length / 2) return s;
      const o = i * 2;
      return ((this.$data$[o] = 0), (this.$data$[o + 1] = n), !0);
    }
  };
function Ta(e) {
  const t = 'q:container',
    n = '/' + t,
    r = ':',
    s = 'q:shadowroot',
    i = 'q:ignore',
    o = '/' + i,
    l = 'q:container-island',
    c = '/' + l,
    a = e,
    g = a.qVNodeData || (a.qVNodeData = new WeakMap()),
    b = e.body,
    P = (x, f) => {
      let u;
      for (; x && !(u = Object.getOwnPropertyDescriptor(x, f)?.get); ) x = Object.getPrototypeOf(x);
      return (
        u ||
        function () {
          return this[f];
        }
      );
    },
    m = b.getAttribute,
    d = b.hasAttribute,
    C = P(b, 'nodeType'),
    p = (x) => {
      (Array.from(x.querySelectorAll('script[type="qwik/vnode"]')).forEach((f) => {
        f.setAttribute('type', 'x-qwik/vnode');
        const u = f.closest('[q\\:container]');
        ((u.qVnodeData = f.textContent), (u.qVNodeRefs = new Map()));
      }),
        x.querySelectorAll('[q\\:shadowroot]').forEach((f) => {
          const u = f.shadowRoot;
          u && p(u);
        }));
    };
  p(e);
  let h;
  ((x) => {
    ((x[(x.CONTAINER_MASK = 1)] = 'CONTAINER_MASK'),
      (x[(x.ELEMENT = 2)] = 'ELEMENT'),
      (x[(x.ELEMENT_CONTAINER = 3)] = 'ELEMENT_CONTAINER'),
      (x[(x.ELEMENT_SHADOW_ROOT_WRAPPER = 6)] = 'ELEMENT_SHADOW_ROOT_WRAPPER'),
      (x[(x.COMMENT_SKIP_START = 9)] = 'COMMENT_SKIP_START'),
      (x[(x.COMMENT_SKIP_END = 8)] = 'COMMENT_SKIP_END'),
      (x[(x.COMMENT_IGNORE_START = 16)] = 'COMMENT_IGNORE_START'),
      (x[(x.COMMENT_IGNORE_END = 32)] = 'COMMENT_IGNORE_END'),
      (x[(x.COMMENT_ISLAND_START = 65)] = 'COMMENT_ISLAND_START'),
      (x[(x.COMMENT_ISLAND_END = 64)] = 'COMMENT_ISLAND_END'),
      (x[(x.OTHER = 0)] = 'OTHER'));
  })(h || (h = {}));
  const $ = (x) => {
      const f = C.call(x);
      if (f === 1) return m.call(x, t) === null ? (d.call(x, s) ? 6 : d.call(x, r) ? 2 : 0) : 3;
      if (f === 8) {
        const u = x.nodeValue || '';
        if (u.startsWith(l)) return 65;
        if (u.startsWith(i)) return 16;
        if (u.startsWith(t)) return 9;
        if (u.startsWith(c)) return 64;
        if (u.startsWith(o)) return 32;
        if (u.startsWith(n)) return 8;
      }
      return 0;
    },
    T = (x) => Bt.ADVANCE_1 <= x && x <= Bt.ADVANCE_8192,
    M = (x, f, u) => {
      let w = 0;
      for (; f < u; ) {
        const E = x.charCodeAt(f);
        if (w === 0 && T(E)) break;
        (E === G.OPEN ? w++ : E === G.CLOSE && w--, f++);
      }
      return f;
    },
    U = (x) => {
      for (; x && (x = x.nextSibling) && $(x) === 0; );
      return x;
    },
    J = (x, f, u, w, E, R, y) => {
      const _ = E.length;
      let D = 0,
        j = -1,
        ee = 0,
        ae = 0,
        fe = 0,
        Je = -1,
        ne = null;
      const Bn = () => {
        let ye = 0;
        for (
          ;
          T((fe = E.charCodeAt(ee))) && ((ye += 1 << (fe - Bt.ADVANCE_1)), ee++, !(ee >= _));

        );
        return ye;
      };
      do {
        if (u === w) return;
        ne = null;
        const ye = u == f ? 2 : $(u);
        if (ye === 3) {
          const he = u;
          let ve = u;
          for (; ve && !(ne = U(ve)); ) ve = ve.parentNode;
          J(x, he, u, ne, he.qVnodeData || '', he.qVNodeRefs);
        } else if (ye === 16) {
          let he = u;
          do
            if (((he = x.nextNode()), !he))
              throw new Error(`Island inside <!--${u?.nodeValue}--> not found!`);
          while ($(he) !== 65);
          ne = null;
        } else if (ye === 64) {
          ne = u;
          do if (((ne = x.nextNode()), !ne)) throw new Error('Ignore block not closed!');
          while ($(ne) !== 32);
          ne = null;
        } else if (ye === 9) {
          ne = u;
          do if (((ne = U(ne)), !ne)) throw new Error(`<!--${u?.nodeValue}--> not closed!`);
          while ($(ne) !== 8);
          J(x, u, u, ne, '', null);
        } else if (ye === 6) {
          ne = U(u);
          const ve = u?.shadowRoot;
          ve && J(e.createTreeWalker(ve, 129), null, ve, null, '', null);
        }
        if ((ye & 2) === 2) {
          if (
            (j < D &&
              (j === -1 && (j = 0),
              (ee = ae),
              ee < _
                ? ((j += Bn()),
                  fe === Bt.REFERENCE &&
                    ((Je = j), ee++, ee < _ ? (fe = E.charCodeAt(ae)) : (fe = Bt.ADVANCE_1)),
                  (ae = M(E, ee, _)))
                : (j = Number.MAX_SAFE_INTEGER)),
            D === j)
          ) {
            Je === D && R.set(D, u);
            const he = E.substring(ee, ae);
            g.set(u, he);
          }
          D++;
        }
      } while ((u = ne || x.nextNode()));
    },
    Z = e.createTreeWalker(e, 129);
  J(Z, null, Z.firstChild(), null, '', null);
}
function Ie(e) {
  const t = co(e);
  if (!t) throw H(24);
  return lo(t);
}
function lo(e) {
  const t = e;
  let n = t.qContainer;
  return (n || (n = new ao(t)), n);
}
function co(e) {
  return (X(e) ? Vn(e, !0) : e).closest(ll);
}
var Ia = (e) => e instanceof ao,
  ao = class extends Sa {
    constructor(e) {
      if (
        (super(
          () => {
            (this.$flushEpoch$++, ic(this.$journal$));
          },
          {},
          e.getAttribute(tl)
        ),
        k(this, 'element'),
        k(this, 'qContainer'),
        k(this, 'qManifestHash'),
        k(this, 'rootVNode'),
        k(this, 'document'),
        k(this, '$journal$'),
        k(this, '$rawStateData$'),
        k(this, '$storeProxyMap$', new WeakMap()),
        k(this, '$qFuncs$'),
        k(this, '$instanceHash$'),
        k(this, '$forwardRefs$', null),
        k(this, '$initialQRLs$', null),
        k(this, 'vNodeLocate', (r) => Mt(this.rootVNode, r)),
        k(this, '$stateData$'),
        k(this, '$styleIds$', null),
        k(this, '$getObjectById$', (r) => go(r, this.$stateData$)),
        (this.qContainer = e.getAttribute(We)),
        !this.qContainer)
      )
        throw H(25);
      ((this.$journal$ = [3, e.ownerDocument]),
        (this.document = e.ownerDocument),
        (this.element = e),
        (this.$buildBase$ = e.getAttribute(hi)),
        (this.$instanceHash$ = e.getAttribute(di)),
        (this.qManifestHash = e.getAttribute(nl)),
        (this.rootVNode = Kr(this.element)),
        (this.$rawStateData$ = []),
        (this.$stateData$ = []));
      const t = this.element.ownerDocument;
      (t.qVNodeData || Ta(t),
        (this.$qFuncs$ = $i(t, this.$instanceHash$) || Ae),
        this.$setServerData$(),
        e.setAttribute(We, 'resumed'),
        (e.qContainer = this));
      const n = e.querySelectorAll('script[type="qwik/state"]');
      if (n.length !== 0) {
        const r = n[n.length - 1];
        ((this.$rawStateData$ = JSON.parse(r.textContent)),
          po(this.$rawStateData$, this),
          (this.$stateData$ = oo(this, this.$rawStateData$)),
          this.$scheduleInitialQRLs$());
      }
    }
    $setRawState$(e, t) {
      this.$stateData$[e] = t;
    }
    parseQRL(e) {
      return so(this, Tc(e));
    }
    handleError(e, t) {
      const n = t && this.resolveContext(t, Ec);
      if (!n) throw e;
      n.error = e;
    }
    setContext(e, t, n) {
      let r = this.getHostProp(e, zt);
      (r == null && this.setHostProp(e, zt, (r = [])), Gt(r, t.id, n, 0, !0));
    }
    resolveContext(e, t) {
      for (; e; ) {
        const n = this.getHostProp(e, zt);
        if (n != null && bl(n, t.id, 0)) return yi(n, t.id, 0);
        e = this.getParentHost(e);
      }
    }
    getParentHost(e) {
      let t = e.parent;
      for (; t; )
        if (ce(t)) {
          if (t.getProp(ge, null) !== null) return t;
          t = t.parent || t.slotParent;
        } else t = t.parent;
      return null;
    }
    setHostProp(e, t, n) {
      e.setProp(t, n);
    }
    getHostProp(e, t) {
      const n = e;
      let r = null;
      switch (t) {
        case xt:
        case Ce:
        case ge:
        case zt:
        case Et:
          r = this.$getObjectById$;
          break;
        case Jt:
        case Cn:
          r = parseInt;
          break;
      }
      return n.getProp(t, r);
    }
    ensureProjectionResolved(e) {
      if ((e.flags & 16) === 0) {
        e.flags |= 16;
        const t = Dt(e);
        for (let n = 0; n < t.length; n = n + 2) {
          const r = t[n];
          if (ts(r)) {
            const s = t[n + 1];
            if (typeof s == 'string') {
              const i = this.vNodeLocate(s);
              t[n + 1] = i;
            }
          }
        }
      }
    }
    getSyncFn(e) {
      const t = this.$qFuncs$[e];
      return (ie(), t);
    }
    $appendStyle$(e, t, n, r) {
      if (r) {
        const s = this.getHostProp(n, _t),
          i = new Set(Mc(s));
        (i.add(t), this.setHostProp(n, _t, Qc(i)));
      }
      if (
        (this.$styleIds$ == null &&
          ((this.$styleIds$ = new Set()),
          this.element.querySelectorAll(ui).forEach((s) => {
            this.$styleIds$.add(s.getAttribute(fr));
          })),
        !this.$styleIds$.has(t))
      ) {
        this.$styleIds$.add(t);
        const s = this.document.createElement('style');
        (s.setAttribute(fr, t),
          (s.textContent = e),
          this.$journal$.push(6, this.document.head, null, s));
      }
    }
    $setServerData$() {
      const e = {},
        t = this.element.attributes;
      if (t)
        for (let n = 0; n < t.length; n++) {
          const r = t[n];
          r.name !== Rn && (e[r.name] = r.value);
        }
      this.$serverData$ = { containerAttributes: e };
    }
    $scheduleInitialQRLs$() {
      if (this.$initialQRLs$) {
        for (const e of this.$initialQRLs$) {
          const t = /#(.*)_([a-zA-Z0-9]+)(\[|$)/.exec(e);
          t && Fo(t[2], 0.3);
        }
        this.$initialQRLs$ = null;
      }
    }
  },
  is = (e) => {
    if (!e.resolved) throw e.resolve();
  },
  de = (e) => e instanceof Ge,
  fo = (e, t) => {
    !e.has(t) && e.add(t);
  },
  uo = (e, t) => {
    var n;
    (e[(n = 2)] || (e[n] = new Set()), !e[2].has(t) && e[2].add(t));
  },
  $o = (e, t) => {
    if (t && !Ia(t)) {
      const n = e[0],
        r = e[1];
      let s = null;
      (on(n)
        ? (s = n.$qrl$)
        : n instanceof Xe
          ? (s = n.$computeQrl$)
          : r === ':' && (s = t.getHostProp(n, ge)),
        s && t.serializationCtx.$eventQrls$.add(s));
    }
  },
  _r = (e, t, n) => {
    const r = !be();
    if (n) {
      const s = (i) => {
        const o = i[0],
          l = i[1];
        if ((z(), on(o))) {
          o.$flags$ |= 8;
          let c = 3;
          (o.$flags$ & 1 && (c = 16), e.$scheduler$(c, o));
        } else if (o instanceof Ge)
          (o instanceof Xe && (o.$computeQrl$.resolved || e.$scheduler$(1, null, o.$computeQrl$)),
            o.invalidate());
        else if (l === ':') {
          const c = o,
            a = e.getHostProp(c, ge);
          z();
          const g = e.getHostProp(c, Ce);
          e.$scheduler$(6, c, a, g);
        } else if (l === '.') {
          if (r) {
            const c = o;
            e.$scheduler$(4, c, c, t);
          }
        } else {
          const c = o,
            a = i[3];
          if (a instanceof Lt) {
            const b = { ...a.data, $value$: t };
            e.$scheduler$(5, c, l, b);
          }
        }
      };
      for (const i of n) s(i);
    }
  },
  Ra = (e) => Ke(e) && typeof e[kn] == 'function',
  Oa = (e) => {
    let t = 1;
    switch (e) {
      case 'never':
        t |= 16;
        break;
      case 'always':
        t |= 32;
        break;
    }
    return t;
  },
  nr = [];
function xn(e) {
  if (e === null) return 'null';
  if (e === void 0) return 'undefined';
  if (typeof e == 'string') return '"' + e + '"';
  if (typeof e == 'number' || typeof e == 'boolean') return String(e);
  if (on(e)) return `Task(${xn(e.$qrl$)})`;
  if (Oe(e)) return `Qrl(${e.$symbol$})`;
  if (typeof e == 'object' || typeof e == 'function') {
    if (nr.includes(e)) return '*';
    try {
      if ((nr.push(e), Array.isArray(e))) return X(e) ? '(' + e.getProp(ps, null) + ')' : e.map(xn);
      if (de(e))
        return e instanceof me ? 'WrappedSignal' : e instanceof Xe ? 'ComputedSignal' : 'Signal';
      if (cn(e)) return 'Store';
      if (ze(e)) return xr(e);
      if (X(e)) return '(' + e.getProp(ps, null) + ')';
    } finally {
      nr.pop();
    }
  }
  return e;
}
var xr = (e) => {
    if (ze(e)) {
      let t = '<' + e.type;
      if (e.props) {
        for (const [r, s] of Object.entries(e.props)) t += ' ' + r + '=' + xn(s);
        const n = e.children;
        n != null
          ? ((t += '>'),
            Array.isArray(n)
              ? n.forEach((r) => {
                  t += xr(r);
                })
              : (t += xr(n)),
            (t += '</' + e.type + '>'))
          : (t += '/>');
      }
      return t;
    } else return String(e);
  },
  Ue = (e) => e[vi],
  ln = (e) => e?.[Pn] || null,
  Da = (e, t) => {
    const n = Ue(e);
    n && n.force(t);
  },
  xf = (e, t) => {
    const n = Ue(e);
    return n ? (n.$effects$?.get(t)?.size ?? 0) > 0 : !1;
  },
  os = (e) => ln(e) || e,
  cn = (e) => Pn in e;
function ho(e, t, n) {
  return new Proxy(t, new kr(n, e || null));
}
var ls = (e, t, n) => {
    if (oi(e) && n) {
      let r = n.$storeProxyMap$.get(e);
      return (r || ((r = ho(n, e, t)), n.$storeProxyMap$.set(e, r)), r);
    }
    return e;
  },
  kr = class {
    constructor(e, t) {
      ((this.$flags$ = e), (this.$container$ = t), k(this, '$effects$', null));
    }
    toString() {
      return '[Store]';
    }
    force(e) {
      const t = ln(this);
      this.$container$?.$scheduler$(7, null, this, Tr(t, e, this.$effects$));
    }
    get(e, t) {
      if (typeof t == 'symbol') return t === Pn ? e : t === vi ? this : e[t];
      const n = Se(),
        r = e[t];
      if (n) {
        if (this.$container$ === null) {
          if (!n.$container$) return r;
          this.$container$ = n.$container$;
        } else ie(!n.$container$ || n.$container$ === this.$container$);
        const i = n.$effectSubscriber$;
        i && vn(e, Array.isArray(e) ? Qe : t, this, i);
      }
      return t === 'toString' && r === Object.prototype.toString
        ? this.toString
        : this.$flags$ & 1 && Ke(r) && !Object.isFrozen(r) && !cn(r) && !Object.isFrozen(e)
          ? ls(r, this.$flags$, this.$container$)
          : r;
    }
    set(e, t, n) {
      if (typeof t == 'symbol') return ((e[t] = n), !0);
      const r = this.$flags$ & 1 ? os(n) : n;
      if (t in e) {
        const s = e[t];
        r !== s && Gs(t, r, e, this);
      } else Gs(t, r, e, this);
      return !0;
    }
    deleteProperty(e, t) {
      return typeof t != 'string' || !delete e[t]
        ? !1
        : (Array.isArray(e) ||
            this.$container$?.$scheduler$(7, null, this, Tr(e, t, this.$effects$)),
          !0);
    }
    has(e, t) {
      if (t === Pn) return !0;
      if (typeof t == 'string') {
        const n = Se();
        if (n) {
          const r = n.$effectSubscriber$;
          r && vn(e, Array.isArray(e) ? Qe : t, this, r);
        }
      }
      return Object.prototype.hasOwnProperty.call(e, t);
    }
    ownKeys(e) {
      const n = Se()?.$effectSubscriber$;
      return (n && vn(e, Qe, this, n), Reflect.ownKeys(e));
    }
    getOwnPropertyDescriptor(e, t) {
      const n = Reflect.getOwnPropertyDescriptor(e, t);
      return Array.isArray(e) || typeof t == 'symbol' || (n && !n.configurable)
        ? n
        : { enumerable: !0, configurable: !0 };
    }
  };
function vn(e, t, n, r) {
  const s = n.$effects$ || (n.$effects$ = new Map());
  let i = s.get(t);
  (i || ((i = new Set()), s.set(t, i)), fo(i, r), uo(r, e), $o(r, n.$container$));
}
function Gs(e, t, n, r) {
  n[e] = t;
  const s = Tr(n, e, r.$effects$);
  s && r.$container$?.$scheduler$(7, null, r, s);
}
function Tr(e, t, n) {
  let r;
  if (n)
    if (Array.isArray(e))
      for (const i of n.values()) {
        r || (r = new Set());
        for (const o of i) r.add(o);
      }
    else r = n.get(t);
  const s = n?.get(Qe);
  if (s) {
    r || (r = new Set());
    for (const i of s) r.add(i);
  }
  return r || null;
}
var Ir = (e, t = new WeakSet()) => {
  if (
    e == null ||
    typeof e == 'string' ||
    typeof e == 'number' ||
    typeof e == 'boolean' ||
    typeof e == 'bigint'
  )
    return !0;
  if (typeof e == 'object') {
    if (t.has(e)) return !0;
    t.add(e);
    const n = Object.getPrototypeOf(e);
    if ((cn(e) && (e = ln(e)), n == Object.prototype)) {
      for (const r in e)
        if (
          !Ir(
            Ft(() => e[r]),
            t
          )
        )
          return !1;
      return !0;
    } else if (n == Array.prototype) {
      for (let r = 0; r < e.length; r++) if (!Ir(e[r], t)) return !1;
      return !0;
    } else {
      if (on(e)) return !0;
      if (Ci(e)) return !0;
      if (K(e)) return !0;
      if (ze(e)) return !0;
      if (e instanceof Error) return !0;
      if (e instanceof URL) return !0;
      if (e instanceof Date) return !0;
      if (e instanceof RegExp) return !0;
      if (e instanceof URLSearchParams) return !0;
      if (e instanceof FormData) return !0;
      if (e instanceof Set) return !0;
      if (e instanceof Map) return !0;
      if (e instanceof Uint8Array) return !0;
      if (e instanceof Lt) return !0;
      if (Pr?.(e)) return !0;
    }
  } else if (typeof e == 'function') {
    if (Oe(e) || pt(e) || e === sn || e === Te) return !0;
  } else if (e === Tt || e === oe || e === Qe) return !0;
  return !1;
};
function po(e, t) {
  const n = (o, l) => o === 1 && typeof l == 'string',
    r = (o) => o === 13,
    s = (o) => o === 20,
    i = (o) => {
      const l = e[o + 1].split(' ');
      let c = e,
        a = 1,
        g = 0,
        b = 0,
        P = null;
      for (let m = 0; m < l.length; m++)
        if (((P = c), (g = parseInt(l[m], 10) * 2), (b = g + 1), (a = c[g]), (c = c[b]), a === 1)) {
          const C = c * 2;
          ((a = e[C]), (c = e[C + 1]));
        }
      (P && ((P[g] = 1), (P[b] = o / 2)), (e[o] = a), (e[o + 1] = c));
    };
  for (let o = 0; o < e.length; o += 2)
    if (n(e[o], e[o + 1])) i(o);
    else if (r(e[o])) t.$forwardRefs$ = e[o + 1];
    else if (s(e[o])) {
      const l = e[o + 1];
      (t.$initialQRLs$ || (t.$initialQRLs$ = [])).push(l);
    }
}
async function kf(e) {
  const t = eo(
    null,
    null,
    () => '',
    () => '',
    () => {},
    new WeakMap()
  );
  for (const n of e) t.$addRoot$(n);
  return (await t.$serialize$(), t.$writer$.toString());
}
function Tf(e, t) {
  if (e == null) return [];
  const n = JSON.parse(e);
  if (!Array.isArray(n)) return [];
  let r;
  Si(t) && gl(t) ? (r = Xs(n, t)) : (r = Xs(n));
  const s = [];
  for (let i = 0; i < n.length; i += 2) s[i / 2] = io(r, n[i], n[i + 1]);
  return s;
}
function go(e, t) {
  return (
    typeof e == 'string' && (e = parseInt(e, 10)),
    ie(e < t.length, `Invalid reference ${e} >= ${t.length}`),
    t[e]
  );
}
function Xs(e, t) {
  let n;
  const r = {
    $getObjectById$: (s) => go(s, n),
    getSyncFn: (s) => () => {},
    $storeProxyMap$: new WeakMap(),
    element: null,
    $forwardRefs$: null,
    $initialQRLs$: null,
    $scheduler$: null,
  };
  return (po(e, r), (n = oo(r, e)), (r.$state$ = n), t && (r.element = t), r);
}
var If = (e, t) => Rr(e, new WeakSet(), '_'),
  Rr = (e, t, n, r) => {
    const s = os(e);
    if (s == null) return e;
    if (Fa(s)) {
      if (typeof s == 'object') {
        if (t.has(s)) return e;
        t.add(s);
      }
      if (de(s) || Ir(s)) return e;
      const i = typeof s;
      switch (i) {
        case 'object':
          if (K(s) || Si(s)) return e;
          if (Re(s)) {
            let l = 0;
            return (
              s.forEach((c, a) => {
                if (a !== l) throw H(3, [s]);
                (Rr(c, t, n + '[' + a + ']'), (l = a + 1));
              }),
              e
            );
          }
          if (oi(s)) {
            for (const [l, c] of Object.entries(s)) Rr(c, t, n + '.' + l);
            return e;
          }
          break;
      }
      let o;
      if (((o = 'Value cannot be serialized'), n !== '_' && (o += ` in ${n},`), i === 'object'))
        o += ` because it's an instance of "${e?.constructor.name}". You might need to use 'noSerialize()' or use an object literal instead. Check out https://qwik.dev/docs/advanced/dollar/`;
      else if (i === 'function') {
        const l = e.name;
        o += ` because it's a function named "${l}". You might need to convert it to a QRL using $(fn):

const ${l} = $(${String(e)});

Please check out https://qwik.dev/docs/advanced/qrl/ for more information.`;
      }
      throw H(3, [o]);
    }
    return e;
  },
  cs = new WeakSet(),
  Fa = (e) => (Ke(e) || Be(e) ? !cs.has(e) : !0),
  rr = (e) => !!e && (Ke(e) || typeof e == 'function') && (Va in e || cs.has(e)),
  La = (e) => (((Ke(e) && e !== null) || typeof e == 'function') && cs.add(e), e),
  Va = Symbol('noSerialize'),
  kn = Symbol('serialize'),
  je = (e, t, n, r, s, i) => {
    let o;
    const l = async function (...d) {
        return await a.call(this, Se())(...d);
      },
      c = (d) => (o || (o = d), o);
    function a(d, C) {
      const p = (...h) => {
        if (!l.resolved)
          return Ee(() => l.resolve()).then((J) => {
            if (!Be(J)) throw H(5);
            return p(...h);
          });
        if (C && C() === !1) return;
        const $ = P(d),
          T = $.$qrl$,
          M = $.$event$;
        (($.$qrl$ = l), $.$event$ || ($.$event$ = this));
        try {
          return He.call(this, $, n, ...h);
        } finally {
          (($.$qrl$ = T), ($.$event$ = M));
        }
      };
      return p;
    }
    const g = (d) =>
        typeof d != 'function' || (!s?.length && !i?.length)
          ? d
          : function (...C) {
              let p = Se();
              if (p) {
                if (p.$qrl$?.$symbol$ === l.$symbol$) return d.apply(this, C);
                const h = p.$qrl$;
                p.$qrl$ = l;
                try {
                  return d.apply(this, C);
                } finally {
                  p.$qrl$ = h;
                }
              }
              return ((p = De()), (p.$qrl$ = l), (p.$event$ = this), He.call(this, p, d, ...C));
            },
      b = n
        ? async () => n
        : async (d) => {
            if (n !== null) return n;
            if ((d && c(d), e === '')) {
              z();
              const h = o.getAttribute(di),
                $ = o.ownerDocument,
                T = $i($, h);
              return (l.resolved = n = T[Number(t)]);
            }
            const C = qa(),
              p = Se();
            {
              const h = mi().importSymbol(o, e, t);
              n = Zt(h, ($) => (l.resolved = g((n = $))));
            }
            return (
              K(n) &&
                n.then(
                  () => Ma(t, p?.$element$, C),
                  (h) => {
                    (console.error(`qrl ${t} failed to load`, h), (n = null));
                  }
                ),
              n
            );
          },
      P = (d) => (d == null ? De() : Re(d) ? Vi(d) : d),
      m = fi(t);
    return (
      Object.assign(l, {
        getSymbol: () => t,
        getHash: () => m,
        getCaptured: () => i,
        resolve: b,
        $setContainer$: c,
        $chunk$: e,
        $symbol$: t,
        $hash$: m,
        getFn: a,
        $capture$: s,
        $captureRef$: i,
        dev: null,
        resolved: void 0,
      }),
      n && (n = Zt(n, (d) => (l.resolved = g((n = d))))),
      l
    );
  },
  Ys = new Set(),
  Ma = (e, t, n) => {
    Ys.has(e) || (Ys.add(e), Qa('qsymbol', { symbol: e, element: t, reqTime: n }));
  },
  Qa = (e, t) => {
    !be() &&
      typeof document == 'object' &&
      document.dispatchEvent(new CustomEvent(e, { bubbles: !1, detail: t }));
  },
  qa = () => (be() ? 0 : typeof performance == 'object' ? performance.now() : 0),
  Rf = (e) => e,
  Of = function (e, t) {
    return (
      t === void 0 && (t = e.toString()),
      (e.serialized = t),
      je('', ci, e, null, null, null)
    );
  },
  Ba = (e) => {
    function t(n, r, s = 0) {
      yl();
      const o = e.$hash$.slice(0, 4) + ':' + (r || ''),
        l = () => {};
      return ((l[ht] = [e]), Yr(l, n, null, n.children, s, o));
    }
    return ((t[ht] = [e]), t);
  },
  ht = Symbol('serializable-data'),
  pt = (e) => typeof e == 'function' && e[ht] !== void 0,
  Df = (e, t) => {
    const { val: n, set: r, iCtx: s } = dt();
    if (n != null) return n;
    const i = Be(e) ? He(void 0, e) : e;
    if (t?.reactive === !1) return (r(i), i);
    {
      const o = s.$container$,
        c = (t?.deep ?? !0) ? 1 : 0,
        a = ls(i, c, o);
      return (r(a), a);
    }
  };
function Ff(e, t) {
  return Se()?.$container$?.$serverData$[e] ?? t;
}
var Js = new Map(),
  Wa = (e, t) => {
    let n = Js.get(t);
    return (n || Js.set(t, (n = Ha(e, t))), n);
  },
  Ha = (e, t) => {
    const n = e.length,
      r = [],
      s = [];
    let i = 0,
      o = i,
      l = At,
      c = 0;
    for (; i < n; ) {
      const m = i;
      let d = e.charCodeAt(i++);
      d === sf && (i++, (d = Co));
      const C = ff[l];
      for (let p = 0; p < C.length; p++) {
        const h = C[p],
          [$, T, M] = h;
        if (
          ($ === c || $ === L || ($ === Tn && En(c)) || ($ === Or && ei(c))) &&
          (T === d ||
            T === L ||
            (T === Tn && En(d)) ||
            (T === xe && !En(d) && d !== fs) ||
            (T === Or && ei(d))) &&
          (h.length == 3 || b(h))
        ) {
          if ((h.length > 3 && (d = e.charCodeAt(i - 1)), M === $e || M == nt)) {
            if (M === nt) {
              if (l === mo && !P()) (Zs(d) ? a(i - 2) : g(i - 2), o++);
              else if (!Zs(d)) {
                const U = T == xe ? 1 : T == Lr ? 2 : 0;
                g(i - U);
              }
            }
            T === xe && (i--, (d = c));
            do ((l = s.pop() || At), l === ot && (a(i - 1), o++));
            while (za(l));
          } else
            (s.push(l), l === ot && M === At ? (a(i - 8), (o = i)) : M === So && g(m), (l = M));
          break;
        }
      }
      c = d;
    }
    return (a(i), r.join(''));
    function a(m) {
      (r.push(e.substring(o, m)), (o = m));
    }
    function g(m) {
      l === ot || P() || (a(m), r.push('.', Br, t));
    }
    function b(m) {
      let d = 0;
      if (e.charCodeAt(i) === Vr) {
        for (let C = 1; C < 10; C++)
          if (e.charCodeAt(i + C) === Vr) {
            d = C + 1;
            break;
          }
      }
      e: for (let C = 3; C < m.length; C++) {
        const p = m[C];
        for (let h = 0; h < p.length; h++)
          if ((e.charCodeAt(i + h + d) | lf) !== p.charCodeAt(h)) continue e;
        return ((i += p.length + d), !0);
      }
      return !1;
    }
    function P() {
      return s.indexOf(ot) !== -1 || s.indexOf(as) !== -1;
    }
  },
  En = (e) =>
    (e >= ef && e <= tf) ||
    (e >= Co && e <= nf) ||
    (e >= cf && e <= af) ||
    e >= 128 ||
    e === of ||
    e === Vr,
  Zs = (e) => e === bt || e === fs || e === Po || e === No || En(e),
  za = (e) => e === yo || e === as || e === wo || e === ot,
  ei = (e) => e === Za || e === Xa || e === Ya || e === Ja,
  At = 0,
  mn = 1,
  mo = 2,
  Ua = 3,
  ja = 4,
  ot = 5,
  So = 6,
  Ka = 7,
  ti = 8,
  Ga = 9,
  as = 10,
  yo = 11,
  wo = 12,
  sr = 13,
  bo = 14,
  vo = 15,
  Eo = 16,
  $e = 17,
  nt = 18,
  L = 0,
  Tn = 1,
  xe = 2,
  Or = 3,
  Xa = 9,
  Ya = 10,
  Ja = 13,
  Za = 32,
  Dr = 34,
  No = 35,
  Fr = 39,
  Sn = 40,
  Lr = 41,
  ir = 42,
  Vr = 45,
  fs = 46,
  Mr = 47,
  ef = 48,
  tf = 57,
  bt = 58,
  or = 59,
  lr = 64,
  Co = 65,
  nf = 90,
  Po = 91,
  rf = 93,
  sf = 92,
  of = 95,
  lf = 32,
  cf = 97,
  af = 122,
  Ht = 123,
  yn = 125,
  et = [
    [L, Fr, bo],
    [L, Dr, vo],
    [L, Mr, Eo, '*'],
  ],
  ff = [
    [
      [L, ir, mo],
      [L, Po, Ka],
      [L, bt, So, ':', 'before', 'after', 'first-letter', 'first-line'],
      [L, bt, ot, 'global'],
      [L, bt, Ua, 'has', 'host-context', 'not', 'where', 'is', 'matches', 'any'],
      [L, bt, ja],
      [L, Tn, mn],
      [L, fs, mn],
      [L, No, mn],
      [L, lr, as, 'keyframe'],
      [L, lr, yo, 'media', 'supports', 'container'],
      [L, lr, wo],
      [L, Ht, sr],
      [Mr, ir, Eo],
      [L, or, $e],
      [L, yn, $e],
      [L, Lr, $e],
      ...et,
    ],
    [[L, xe, nt]],
    [[L, xe, nt]],
    [
      [L, Sn, At],
      [L, xe, nt],
    ],
    [
      [L, Sn, ti],
      [L, xe, nt],
    ],
    [
      [L, Sn, At],
      [L, xe, $e],
    ],
    [[L, xe, $e]],
    [
      [L, rf, nt],
      [L, Fr, bo],
      [L, Dr, vo],
    ],
    [[L, Lr, $e], ...et],
    [[L, yn, $e], ...et],
    [[L, yn, $e], [Or, Tn, mn], [L, bt, ot, 'global'], [L, Ht, sr], ...et],
    [[L, Ht, At], [L, or, $e], ...et],
    [[L, or, $e], [L, Ht, Ga], ...et],
    [[L, yn, $e], [L, Ht, sr], [L, Sn, ti], ...et],
    [[L, Fr, $e]],
    [[L, Dr, $e]],
    [[ir, Mr, $e]],
  ],
  Lf = (e) => ({ styleId: Ao(e, (t) => t, !1) }),
  Vf = (e) => ({ scopeId: Br + Ao(e, Wa, !0) }),
  Ao = (e, t, n) => {
    const { val: r, set: s, iCtx: i, i: o } = dt();
    if (r) return r;
    const l = Xc(e, o),
      c = i.$hostElement$;
    if ((s(l), e.resolved)) i.$container$.$appendStyle$(t(e.resolved, l), l, c, n);
    else throw e.resolve().then((a) => i.$container$.$appendStyle$(t(a, l), l, c, n));
    return l;
  },
  uf = (e, t) => {
    _o('on:', e, t);
  },
  ni = (e, t) => {
    _o('on-document:', e, t);
  },
  _o = (e, t, n) => {
    const { isAdded: r, addEvent: s } = $f();
    if (!r && n)
      if (Array.isArray(t)) for (const i of t) s(e + en(i), n);
      else s(e + en(t), n);
  },
  $f = () => {
    const e = Li(),
      n = e.$hostElement$;
    let r = e.$container$.getHostProp(n, dr);
    r === null && ((r = {}), e.$container$.setHostProp(n, dr, r));
    let s = e.$container$.getHostProp(n, Cn);
    (s === null && (s = 0), e.$container$.setHostProp(n, Cn, s + 1));
    let i = e.$container$.getHostProp(n, gs);
    for (i === null && ((i = []), e.$container$.setHostProp(n, gs, i)); i.length <= s; ) i.push(!1);
    const o = (l, c) => {
      i[s] = !0;
      let a = r[l];
      (a || (r[l] = a = []), a.push(c));
    };
    return { isAdded: i[s], addEvent: o };
  },
  Mf = (e) =>
    hf(() => {
      const t = Be(e) && !pt(e) ? He(void 0, e) : e;
      return Ql(t);
    }),
  hf = (e) => {
    const { val: t, set: n } = dt();
    return t ?? ((e = Be(e) && !pt(e) ? e() : e), n(e));
  },
  Qf = (e, t) => {
    const { val: n, set: r, i: s, iCtx: i } = dt(),
      o = t?.strategy ?? 'intersection-observer';
    if (n) {
      be() && ri(n, o);
      return;
    }
    const l = new Qt(1, s, i.$hostElement$, e, void 0, null);
    (r(l), ri(l, o), be() || (e.resolve(i.$element$), i.$container$.$scheduler$(16, l)));
  },
  ri = (e, t) => {
    t === 'intersection-observer'
      ? uf('qvisible', cr(e))
      : t === 'document-ready'
        ? ni('qinit', cr(e))
        : t === 'document-idle' && ni('qidle', cr(e));
  },
  cr = (e) => je(null, '_task', _c, null, null, [e]);
globalThis.__qwik &&
  console.error(`==============================================
Qwik version ${globalThis.__qwik} already imported while importing ${Qr}.
This can lead to issues due to duplicated shared structures.
Verify that the Qwik libraries you're using are in "resolve.noExternal[]" and in "optimizeDeps.exclude".
==============================================
`);
globalThis.__qwik = Qr;
export {
  Af as A,
  Lf as B,
  La as C,
  Ff as D,
  Ae as E,
  Te as F,
  Df as G,
  bf as H,
  kn as I,
  vf as J,
  Cf as K,
  Nf as L,
  Rf as M,
  Oc as N,
  gf as O,
  xf as P,
  mf as Q,
  Vf as R,
  sn as S,
  Pc as T,
  uf as U,
  ni as V,
  zi as W,
  Hi as X,
  Dc as Y,
  kf as _,
  Tt as a,
  Tf as b,
  Ba as c,
  vr as d,
  _f as e,
  wf as f,
  Sa as g,
  zs as h,
  Pf as i,
  Yr as j,
  de as k,
  Lt as l,
  se as m,
  ze as n,
  mi as o,
  Ef as p,
  Mf as q,
  Ft as r,
  pf as s,
  Of as t,
  qn as u,
  If as v,
  Qf as w,
  yf as x,
  Sf as y,
  vc as z,
};
