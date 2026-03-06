import {
  l as je,
  L as $,
  Q as qe,
  a as Ee,
  b as oe,
  i as Se,
  c as Ge,
  d as ie,
  s as ze,
} from './build/qwik-router.js';
import { _ as W, a as Be, v as Ke, b as ae } from './build/core.js';
import { createReadStream as Ye } from 'node:fs';
import { join as L, basename as Je, extname as Xe } from 'node:path';
import { fileURLToPath as ye } from 'node:url';
import { Http2ServerRequest as Ve } from 'node:http2';
import 'dotenv/config';
import q from 'express';
import Ze from './entry.ssr.js';
function B(e, t) {
  let n = 'Server Error';
  return (
    t != null && (typeof t.message == 'string' ? (n = t.message) : (n = String(t))),
    '<html>' + we(e, n) + '</html>'
  );
}
function we(e, t) {
  (typeof e != 'number' && (e = 500), typeof t == 'string' ? (t = et(t)) : (t = ''));
  const n = typeof t == 'string' ? '600px' : '300px',
    i = e >= 500 ? nt : tt;
  return `
<head>
  <meta charset="utf-8">
  <meta http-equiv="Status" content="${e}">
  <title>${e} ${t}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body { color: ${i}; background-color: #fafafa; padding: 30px; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Roboto, sans-serif; }
    p { max-width: ${n}; margin: 60px auto 30px auto; background: white; border-radius: 4px; box-shadow: 0px 0px 50px -20px ${i}; overflow: hidden; }
    strong { display: inline-block; padding: 15px; background: ${i}; color: white; }
    span { display: inline-block; padding: 15px; }
  </style>
</head>
<body><p><strong>${e}</strong> <span>${t}</span></p></body>
`;
}
const He = /[&<>]/g,
  et = (e) =>
    e.replace(He, (t) => {
      switch (t) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        default:
          return '';
      }
    }),
  tt = '#006ce9',
  nt = '#713fc2';
var rt = Object.defineProperty,
  ot = (e, t, n) =>
    t in e ? rt(e, t, { enumerable: !0, configurable: !0, writable: !0, value: n }) : (e[t] = n),
  D = (e, t, n) => ot(e, typeof t != 'symbol' ? t + '' : t, n),
  Re,
  be,
  xe,
  _e = ((e) => (
    (e[(e.Continue = 100)] = 'Continue'),
    (e[(e.SwitchingProtocols = 101)] = 'SwitchingProtocols'),
    (e[(e.Processing = 102)] = 'Processing'),
    (e[(e.Ok = 200)] = 'Ok'),
    (e[(e.Created = 201)] = 'Created'),
    (e[(e.Accepted = 202)] = 'Accepted'),
    (e[(e.NonAuthoritativeInformation = 203)] = 'NonAuthoritativeInformation'),
    (e[(e.NoContent = 204)] = 'NoContent'),
    (e[(e.ResetContent = 205)] = 'ResetContent'),
    (e[(e.PartialContent = 206)] = 'PartialContent'),
    (e[(e.MultiStatus = 207)] = 'MultiStatus'),
    (e[(e.AlreadyReported = 208)] = 'AlreadyReported'),
    (e[(e.ImUsed = 226)] = 'ImUsed'),
    (e[(e.MultipleChoices = 300)] = 'MultipleChoices'),
    (e[(e.MovedPermanently = 301)] = 'MovedPermanently'),
    (e[(e.Found = 302)] = 'Found'),
    (e[(e.SeeOther = 303)] = 'SeeOther'),
    (e[(e.NotModified = 304)] = 'NotModified'),
    (e[(e.UseProxy = 305)] = 'UseProxy'),
    (e[(e.SwitchProxy = 306)] = 'SwitchProxy'),
    (e[(e.TemporaryRedirect = 307)] = 'TemporaryRedirect'),
    (e[(e.PermanentRedirect = 308)] = 'PermanentRedirect'),
    (e[(e.BadRequest = 400)] = 'BadRequest'),
    (e[(e.Unauthorized = 401)] = 'Unauthorized'),
    (e[(e.PaymentRequired = 402)] = 'PaymentRequired'),
    (e[(e.Forbidden = 403)] = 'Forbidden'),
    (e[(e.NotFound = 404)] = 'NotFound'),
    (e[(e.MethodNotAllowed = 405)] = 'MethodNotAllowed'),
    (e[(e.NotAcceptable = 406)] = 'NotAcceptable'),
    (e[(e.ProxyAuthenticationRequired = 407)] = 'ProxyAuthenticationRequired'),
    (e[(e.RequestTimeout = 408)] = 'RequestTimeout'),
    (e[(e.Conflict = 409)] = 'Conflict'),
    (e[(e.Gone = 410)] = 'Gone'),
    (e[(e.LengthRequired = 411)] = 'LengthRequired'),
    (e[(e.PreconditionFailed = 412)] = 'PreconditionFailed'),
    (e[(e.PayloadTooLarge = 413)] = 'PayloadTooLarge'),
    (e[(e.UriTooLong = 414)] = 'UriTooLong'),
    (e[(e.UnsupportedMediaType = 415)] = 'UnsupportedMediaType'),
    (e[(e.RangeNotSatisfiable = 416)] = 'RangeNotSatisfiable'),
    (e[(e.ExpectationFailed = 417)] = 'ExpectationFailed'),
    (e[(e.IAmATeapot = 418)] = 'IAmATeapot'),
    (e[(e.MisdirectedRequest = 421)] = 'MisdirectedRequest'),
    (e[(e.UnprocessableEntity = 422)] = 'UnprocessableEntity'),
    (e[(e.Locked = 423)] = 'Locked'),
    (e[(e.FailedDependency = 424)] = 'FailedDependency'),
    (e[(e.UpgradeRequired = 426)] = 'UpgradeRequired'),
    (e[(e.PreconditionRequired = 428)] = 'PreconditionRequired'),
    (e[(e.TooManyRequests = 429)] = 'TooManyRequests'),
    (e[(e.RequestHeaderFieldsTooLarge = 431)] = 'RequestHeaderFieldsTooLarge'),
    (e[(e.UnavailableForLegalReasons = 451)] = 'UnavailableForLegalReasons'),
    (e[(e.InternalServerError = 500)] = 'InternalServerError'),
    (e[(e.NotImplemented = 501)] = 'NotImplemented'),
    (e[(e.BadGateway = 502)] = 'BadGateway'),
    (e[(e.ServiceUnavailable = 503)] = 'ServiceUnavailable'),
    (e[(e.GatewayTimeout = 504)] = 'GatewayTimeout'),
    (e[(e.HttpVersionNotSupported = 505)] = 'HttpVersionNotSupported'),
    (e[(e.VariantAlsoNegotiates = 506)] = 'VariantAlsoNegotiates'),
    (e[(e.InsufficientStorage = 507)] = 'InsufficientStorage'),
    (e[(e.LoopDetected = 508)] = 'LoopDetected'),
    (e[(e.NotExtended = 510)] = 'NotExtended'),
    (e[(e.NetworkAuthenticationRequired = 511)] = 'NetworkAuthenticationRequired'),
    e
  ))(_e || {});
function it(e) {
  const t = [];
  return (
    e === 'day'
      ? (e = 3600 * 24)
      : e === 'week'
        ? (e = 3600 * 24 * 7)
        : e === 'month'
          ? (e = 3600 * 24 * 30)
          : e === 'year'
            ? (e = 3600 * 24 * 365)
            : e === 'private'
              ? (e = { private: !0, noCache: !0 })
              : e === 'immutable'
                ? (e = { public: !0, immutable: !0, maxAge: 3600 * 24 * 365 })
                : e === 'no-cache' && (e = { noCache: !0 }),
    typeof e == 'number' && (e = { maxAge: e, sMaxAge: e }),
    e.immutable && t.push('immutable'),
    e.maxAge && t.push(`max-age=${e.maxAge}`),
    e.sMaxAge && t.push(`s-maxage=${e.sMaxAge}`),
    e.noStore && t.push('no-store'),
    e.noCache && t.push('no-cache'),
    e.private && t.push('private'),
    e.public && t.push('public'),
    e.staleWhileRevalidate && t.push(`stale-while-revalidate=${e.staleWhileRevalidate}`),
    e.staleIfError && t.push(`stale-if-error=${e.staleIfError}`),
    t.join(', ')
  );
}
const at = {
    lax: 'Lax',
    Lax: 'Lax',
    None: 'None',
    none: 'None',
    strict: 'Strict',
    Strict: 'Strict',
  },
  st = { seconds: 1, minutes: 60, hours: 3600, days: 3600 * 24, weeks: 3600 * 24 * 7 },
  se = (e, t, n) => {
    const i = [`${e}=${t}`];
    (typeof n.domain == 'string' && i.push(`Domain=${n.domain}`),
      typeof n.maxAge == 'number'
        ? i.push(`Max-Age=${n.maxAge}`)
        : Array.isArray(n.maxAge)
          ? i.push(`Max-Age=${n.maxAge[0] * st[n.maxAge[1]]}`)
          : typeof n.expires == 'number' || typeof n.expires == 'string'
            ? i.push(`Expires=${n.expires}`)
            : n.expires instanceof Date && i.push(`Expires=${n.expires.toUTCString()}`),
      n.httpOnly && i.push('HttpOnly'),
      typeof n.path == 'string' && i.push(`Path=${n.path}`));
    const a = lt(n.sameSite);
    return (a && i.push(`SameSite=${a}`), n.secure && i.push('Secure'), i.join('; '));
  };
function ce(e) {
  try {
    return decodeURIComponent(e);
  } catch {
    return e;
  }
}
const ct = (e) => {
  const t = {};
  if (typeof e == 'string' && e !== '') {
    const n = e.split(';');
    for (const i of n) {
      const a = i.indexOf('=');
      a !== -1 && (t[ce(i.slice(0, a).trim())] = ce(i.slice(a + 1).trim()));
    }
  }
  return t;
};
function lt(e) {
  if (e === !0) return 'Strict';
  if (e === !1) return 'None';
  if (e) return at[e];
}
const M = Symbol('request-cookies'),
  F = Symbol('response-cookies'),
  A = Symbol('live-cookies');
((xe = M), (be = F), (Re = A));
class dt {
  constructor(t) {
    (D(this, xe),
      D(this, be, {}),
      D(this, Re, {}),
      D(this, 'appendCounter', 0),
      (this[M] = ct(t)),
      (this[A] = { ...this[M] }));
  }
  get(t, n = !0) {
    const i = this[n ? A : M][t];
    return i
      ? {
          value: i,
          json() {
            return JSON.parse(i);
          },
          number() {
            return Number(i);
          },
        }
      : null;
  }
  getAll(t = !0) {
    return Object.keys(this[t ? A : M]).reduce((n, i) => ((n[i] = this.get(i)), n), {});
  }
  has(t, n = !0) {
    return !!this[n ? A : M][t];
  }
  set(t, n, i = {}) {
    this[A][t] = typeof n == 'string' ? n : JSON.stringify(n);
    const a = typeof n == 'string' ? n : encodeURIComponent(JSON.stringify(n));
    this[F][t] = se(t, a, i);
  }
  append(t, n, i = {}) {
    this[A][t] = typeof n == 'string' ? n : JSON.stringify(n);
    const a = typeof n == 'string' ? n : encodeURIComponent(JSON.stringify(n));
    this[F][++this.appendCounter] = se(t, a, i);
  }
  delete(t, n) {
    (this.set(t, 'deleted', { ...n, maxAge: 0 }), (this[A][t] = null));
  }
  headers() {
    return Object.values(this[F]);
  }
}
function ft(e, t, n, i, a = '/') {
  let r;
  const o = new Promise((s) => (r = s)),
    c = ht(e, t, n, a, r);
  return { response: o, requestEv: c, completion: ee ? ee.run(c, le, c, i, r) : le(c, i, r) };
}
async function le(e, t, n) {
  try {
    ((o) => new URL(o.pathname + o.search, o))(e.originalUrl);
  } catch {
    const o = 'Resource Not Found';
    e.status(404);
    const c = B(404, o);
    return (e.html(404, c), new j(404, o));
  }
  let i = 1;
  async function a() {
    try {
      await e.next();
    } catch (r) {
      if (r instanceof ne) return (await e.getWritableStream().close(), r);
      if (r instanceof De) {
        if (i > 50) return new Error('Infinite rewrite loop');
        i += 1;
        const o = new URL(e.url);
        o.pathname = r.pathname;
        const { loadedRoute: c, requestHandlers: s } = await t(o);
        return (e.resetRoute(c, s, o), await a());
      } else {
        if (r instanceof z) return;
        if (r instanceof j && !e.headersSent) {
          const o = r.status,
            c = e.request.headers.get('Accept');
          return (
            c && !c.includes('text/html')
              ? (e.headers.set('Content-Type', 'application/qwik-json'),
                e.send(o, await W([r.data])))
              : e.html(o, B(o, r.data)),
            r
          );
        }
      }
      if (v(e) !== 'dev')
        try {
          e.headersSent ||
            (e.headers.set('content-type', 'text/html; charset=utf-8'),
            e.cacheControl({ noCache: !0 }),
            e.status(500));
          const o = e.getWritableStream();
          if (!o.locked) {
            const c = o.getWriter();
            (await c.write(S.encode(B(500, 'Internal Server Error'))), await c.close());
          }
        } catch {
          console.error('Unable to render error page');
        }
      return r;
    }
  }
  try {
    return await a();
  } finally {
    e.isDirty() || n(null);
  }
}
function V(e) {
  const t = e.endsWith(C);
  if (t) {
    const n = e.length - C.length + 1;
    ((e = e.slice(0, n)), e === '' && (e = '/'));
  }
  return { pathname: e, isInternal: t };
}
const te = '@isQData',
  C = '/q-data.json',
  Ae = Symbol('RequestEvLoaders'),
  Te = Symbol('RequestEvMode'),
  Pe = Symbol('RequestEvRoute'),
  Me = Symbol('RequestEvLoaderSerializationStrategyMap'),
  Le = '@routeName',
  E = '@actionId',
  Ce = '@actionFormData',
  ut = '@nonce',
  ve = '@rewrite',
  Z = '@serverTiming',
  Ie = 'qData';
function ht(e, t, n, i, a) {
  const { request: r, platform: o, env: c } = e,
    s = new Map(),
    d = new dt(r.headers.get('cookie')),
    f = new Headers(),
    u = new URL(r.url),
    { pathname: m, isInternal: g } = V(u.pathname);
  g && ((u.pathname = m), s.set(te, !0));
  let p = -1,
    w = null,
    R,
    T = e.locale,
    b = 200;
  const $e = async () => {
      for (p++; p < n.length; ) {
        const l = n[p],
          h = l(x);
        (Se(h) && (await h), p++);
      }
    },
    Fe = (l, h, y = u) => {
      ((t = l), (n = h), (u.pathname = y.pathname), (u.search = y.search), (p = -1));
    },
    P = () => {
      if (w !== null) throw new Error('Response already sent');
    },
    O = (l, h) => {
      if ((P(), typeof l == 'number')) {
        b = l;
        const _ = x.getWritableStream().getWriter();
        (_.write(typeof h == 'string' ? S.encode(h) : h), _.close());
      } else if (
        ((b = l.status),
        l.headers.forEach((y, _) => {
          _.toLowerCase() !== 'set-cookie' && f.append(_, y);
        }),
        l.headers.getSetCookie().forEach((y) => {
          const _ = y.indexOf('=');
          if (_ === -1) return;
          const We = y.slice(0, _).trim(),
            Qe = y.slice(_ + 1).trim();
          d.set(We, Qe);
        }),
        l.body)
      ) {
        const y = x.getWritableStream();
        l.body.pipeTo(y);
      } else x.getWritableStream().getWriter().close();
      return k();
    },
    k = (l = new z()) => ((p = de), l),
    N = {},
    x = {
      [Ae]: N,
      [Me]: new Map(),
      [Te]: e.mode,
      get [Pe]() {
        return t;
      },
      cookie: d,
      headers: f,
      env: c,
      method: r.method,
      signal: r.signal,
      originalUrl: new URL(u),
      get params() {
        return t?.[$.Params] ?? {};
      },
      get pathname() {
        return u.pathname;
      },
      platform: o,
      get query() {
        return u.searchParams;
      },
      request: r,
      url: u,
      basePathname: i,
      sharedMap: s,
      get headersSent() {
        return w !== null;
      },
      get exited() {
        return p >= de;
      },
      get clientConn() {
        return e.getClientConn();
      },
      next: $e,
      resetRoute: Fe,
      exit: k,
      cacheControl: (l, h = 'Cache-Control') => {
        (P(), f.set(h, it(l)));
      },
      resolveValue: async (l) => {
        const h = l.__id;
        if (l.__brand === 'server_loader') {
          if (!(h in N))
            throw new Error(
              'You can not get the returned data of a loader that has not been executed for this request.'
            );
          if (N[h] === Be) {
            const y = v(x) === 'dev';
            await Ue(l, N, x, y);
          }
        }
        return N[h];
      },
      status: (l) => (typeof l == 'number' ? (P(), (b = l), l) : b),
      locale: (l) => (typeof l == 'string' && (T = l), T || ''),
      error: (l, h) => ((b = l), f.delete('Cache-Control'), new j(l, h)),
      redirect: (l, h) => {
        if ((P(), (b = l), h)) {
          if (/([^:])\/{2,}/.test(h)) {
            const y = h.replace(/([^:])\/{2,}/g, '$1/');
            (console.warn(`Redirect URL ${h} is invalid, fixing to ${y}`), (h = y));
          }
          f.set('Location', h);
        }
        return (
          f.delete('Cache-Control'),
          l > 301 && f.set('Cache-Control', 'no-store'),
          k(new ne())
        );
      },
      rewrite: (l) => {
        if ((P(), l.startsWith('http'))) throw new Error('Rewrite does not support absolute urls');
        return (s.set(ve, !0), k(new De(l.replace(/\/+/g, '/'))));
      },
      defer: (l) => (typeof l == 'function' ? l : () => l),
      fail: (l, h) => (P(), (b = l), f.delete('Cache-Control'), { failed: !0, ...h }),
      text: (l, h) => (f.set('Content-Type', 'text/plain; charset=utf-8'), O(l, h)),
      html: (l, h) => (f.set('Content-Type', 'text/html; charset=utf-8'), O(l, h)),
      parseBody: async () => (R !== void 0 ? R : (R = gt(x, s))),
      json: (l, h) => (
        f.set('Content-Type', 'application/json; charset=utf-8'),
        O(l, JSON.stringify(h))
      ),
      send: O,
      isDirty: () => w !== null,
      getWritableStream: () => {
        if (w === null) {
          if (e.mode === 'dev') {
            const l = s.get(Z);
            l && f.set('Server-Timing', l.map(([h, y]) => `${h};dur=${y}`).join(','));
          }
          w = e.getWritableStream(b, f, d, a, x);
        }
        return w;
      },
    };
  return Object.freeze(x);
}
function U(e) {
  return e[Ae];
}
function Ne(e) {
  return e[Me];
}
function mt(e) {
  return e[Pe];
}
function v(e) {
  return e[Te];
}
const de = Number.MAX_SAFE_INTEGER,
  gt = async ({ request: e, method: t, query: n }, i) => {
    const a = e.headers.get('content-type')?.split(/[;,]/, 1)[0].trim() ?? '';
    if (a === 'application/x-www-form-urlencoded' || a === 'multipart/form-data') {
      const r = await e.formData();
      return (i.set(Ce, r), pt(r));
    } else {
      if (a === 'application/json') return await e.json();
      if (a === 'application/qwik-json') {
        if (t === 'GET' && n.has(ie)) {
          const r = n.get(ie);
          if (r)
            try {
              return ae(decodeURIComponent(r));
            } catch {}
        }
        return ae(await e.text());
      }
    }
  },
  pt = (e) =>
    [...e.entries()].reduce(
      (n, [i, a]) => (
        i.split('.').reduce((r, o, c, s) => {
          if (o.endsWith('[]')) {
            const d = o.slice(0, -2);
            return ((r[d] = r[d] || []), (r[d] = [...r[d], a]));
          }
          return c < s.length - 1
            ? (r[o] = r[o] || (Number.isNaN(+s[c + 1]) ? {} : []))
            : (r[o] = a);
        }, n),
        n
      ),
      {}
    );
function yt(e) {
  const { params: t, request: n, status: i, locale: a, originalUrl: r } = e,
    o = {};
  n.headers.forEach((T, b) => (o[b] = T));
  const c = e.sharedMap.get(E),
    s = e.sharedMap.get(Ce),
    d = e.sharedMap.get(Le),
    f = e.sharedMap.get(ut),
    u = e.request.headers,
    m = new URL(r.pathname + r.search, r),
    g = u.get('X-Forwarded-Host'),
    p = u.get('X-Forwarded-Proto');
  (g && ((m.port = ''), (m.host = g)), p && (m.protocol = p));
  const w = U(e),
    R = Ne(e);
  return {
    url: m.href,
    requestHeaders: o,
    locale: a(),
    nonce: f,
    containerAttributes: { [Ge]: d },
    qwikrouter: {
      routeName: d,
      ev: e,
      params: { ...t },
      loadedRoute: mt(e),
      response: {
        status: i(),
        loaders: w,
        loadersSerializationStrategy: R,
        action: c,
        formData: s,
      },
    },
  };
}
const wt = (e, t, n, i, a, r) => {
    const o = [],
      c = [],
      s = [],
      d = !!(t && Pt(t[$.Mods]));
    if ((r && s.push(vt), e && fe(o, c, s, e, d, n), t)) {
      const f = t[$.Mods];
      fe(o, c, s, f, d, n);
      const u = t[$.RouteName];
      (i &&
        (n === 'POST' || n === 'PUT' || n === 'PATCH' || n === 'DELETE') &&
        (i === 'lax-proto' ? s.unshift(Mt) : s.unshift(Lt)),
        d && ((n === 'POST' || n === 'GET') && s.push(_t), s.push(At), r && s.push(It)),
        d &&
          (s.push((m) => {
            m.sharedMap.set(Le, u);
          }),
          s.push(Rt(c)),
          s.push(bt(o)),
          s.push(a)));
    }
    return s;
  },
  fe = (e, t, n, i, a, r) => {
    for (const o of i) {
      typeof o.onRequest == 'function'
        ? n.push(o.onRequest)
        : Array.isArray(o.onRequest) && n.push(...o.onRequest);
      let c;
      switch (r) {
        case 'GET': {
          c = o.onGet;
          break;
        }
        case 'POST': {
          c = o.onPost;
          break;
        }
        case 'PUT': {
          c = o.onPut;
          break;
        }
        case 'PATCH': {
          c = o.onPatch;
          break;
        }
        case 'DELETE': {
          c = o.onDelete;
          break;
        }
        case 'OPTIONS': {
          c = o.onOptions;
          break;
        }
        case 'HEAD': {
          c = o.onHead;
          break;
        }
      }
      if ((typeof c == 'function' ? n.push(c) : Array.isArray(c) && n.push(...c), a))
        for (const s of Object.values(o))
          typeof s == 'function' &&
            (s.__brand === 'server_loader'
              ? e.push(s)
              : s.__brand === 'server_action' && t.push(s));
    }
  };
function Rt(e) {
  return async (t) => {
    const n = t;
    if (n.headersSent) {
      n.exit();
      return;
    }
    const { method: i } = n,
      a = U(n),
      r = v(n) === 'dev';
    if (
      (r &&
        i === 'GET' &&
        n.query.has(oe) &&
        console.warn(`Seems like you are submitting a Qwik Action via GET request. Qwik Actions should be submitted via POST request.
Make sure your <form> has method="POST" attribute, like this: <form method="POST">`),
      i === 'POST')
    ) {
      const o = n.query.get(oe);
      if (o) {
        const c = globalThis._qwikActionsMap,
          s = e.find((d) => d.__id === o) ?? c?.get(o);
        if (s) {
          n.sharedMap.set(E, o);
          const d = await n.parseBody();
          if (!d || typeof d != 'object')
            throw new Error(`Expected request data for the action id ${o} to be an object`);
          const f = await Oe(n, s.__validators, d, r);
          if (!f.success) a[o] = n.fail(f.status ?? 500, f.error);
          else {
            const u = r
              ? await G(n, s.__qrl.getHash(), () => s.__qrl.call(n, f.data, n))
              : await s.__qrl.call(n, f.data, n);
            (r && Q(u, s.__qrl), (a[o] = u));
          }
        }
      }
    }
  };
}
function bt(e) {
  return async (t) => {
    const n = t;
    if (n.headersSent) {
      n.exit();
      return;
    }
    const i = U(n),
      a = v(n) === 'dev';
    if (e.length > 0) {
      const r = e.map((o) => Ue(o, i, n, a));
      await Promise.all(r);
    }
  };
}
async function Ue(e, t, n, i) {
  const a = e.__id;
  return (
    (t[a] = Oe(n, e.__validators, void 0, i)
      .then((o) =>
        o.success
          ? i
            ? G(n, e.__qrl.getHash(), () => e.__qrl.call(n, n))
            : e.__qrl.call(n, n)
          : n.fail(o.status ?? 500, o.error)
      )
      .then((o) => (typeof o == 'function' ? (t[a] = o()) : (i && Q(o, e.__qrl), (t[a] = o)), o))),
    Ne(n).set(a, e.__serializationStrategy),
    t[a]
  );
}
async function Oe(e, t, n, i) {
  let a = { success: !0, data: n };
  if (t)
    for (const r of t)
      if (
        (i ? (a = await G(e, 'validator$', () => r.validate(e, n))) : (a = await r.validate(e, n)),
        a.success)
      )
        n = a.data;
      else return a;
  return a;
}
function xt(e) {
  return e ? typeof e == 'object' && Symbol.asyncIterator in e : !1;
}
async function _t(e) {
  const t = e.query.get(qe);
  if (
    t &&
    e.request.headers.get('X-QRL') === t &&
    e.request.headers.get('Content-Type') === 'application/qwik-json'
  ) {
    e.exit();
    const n = v(e) === 'dev',
      i = await e.parseBody();
    if (Array.isArray(i)) {
      const [a, ...r] = i;
      if (Tt(a) && a.getHash() === t) {
        let o;
        try {
          n
            ? (o = await G(e, `server_${a.getSymbol()}`, () => a.apply(e, r)))
            : (o = await a.apply(e, r));
        } catch (c) {
          throw c instanceof j
            ? e.error(c.status, c.data)
            : (console.error(`Server function ${t} failed:`, c), e.error(500, 'Invalid request'));
        }
        if (xt(o)) {
          e.headers.set('Content-Type', 'text/qwik-json-stream');
          const s = e.getWritableStream().getWriter();
          for await (const d of o) {
            n && Q(d, a);
            const f = await W([d]);
            if (e.signal.aborted) break;
            await s.write(
              S.encode(`${f}
`)
            );
          }
          s.close();
        } else {
          (Q(o, a), e.headers.set('Content-Type', 'application/qwik-json'));
          const c = await W([o]);
          e.send(200, c);
        }
        return;
      }
    }
    throw e.error(500, 'Invalid request');
  }
}
function At(e) {
  const { basePathname: t, originalUrl: n, sharedMap: i } = e,
    { pathname: a, search: r } = n;
  if (!i.has(te) && a !== t && !a.endsWith('.html') && !a.endsWith('/'))
    throw e.redirect(_e.MovedPermanently, a + '/' + r);
}
function Q(e, t) {
  try {
    Ke(e, void 0);
  } catch (n) {
    throw (n instanceof Error && t.dev && (n.loc = t.dev), n);
  }
}
const Tt = (e) => typeof e == 'function' && typeof e.getSymbol == 'function';
function Pt(e) {
  const t = e[e.length - 1];
  return t && typeof t.default == 'function';
}
function H(e) {
  ((e = new URL(e)),
    e.pathname.endsWith(C) && (e.pathname = e.pathname.slice(0, -C.length)),
    e.pathname.endsWith('/') || (e.pathname += '/'));
  const t = e.search.slice(1).replaceAll(/&?q(action|data|func|loaders)=[^&]+/g, '');
  return `${e.pathname}${t ? `?${t}` : ''}${e.hash}`;
}
const S = new TextEncoder();
function Mt(e) {
  ke(e, 'lax-proto');
}
function Lt(e) {
  ke(e);
}
function ke(e, t) {
  if (
    Ut(e.request.headers, 'application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain')
  ) {
    const i = e.request.headers.get('origin'),
      a = e.url.origin;
    let r = i !== a;
    if ((r && t && i?.replace(/^http(s)?/g, '') === a.replace(/^http(s)?/g, '') && (r = !1), r))
      throw e.error(
        403,
        `CSRF check failed. Cross-site ${e.method} form submissions are forbidden.
The request origin "${i}" does not match the server origin "${a}".`
      );
  }
}
function Ct(e) {
  return async (t) => {
    if (t.headersSent || t.sharedMap.has(te)) return;
    t.request.headers.forEach((f, u) => f);
    const i = t.headers;
    i.has('Content-Type') || i.set('Content-Type', 'text/html; charset=utf-8');
    const { readable: a, writable: r } = new TextEncoderStream(),
      o = t.getWritableStream(),
      c = a.pipeTo(o, { preventClose: !0 }),
      s = r.getWriter(),
      d = t.status();
    try {
      const f = v(t) === 'static',
        u = yt(t),
        m = await e({
          base: t.basePathname + 'build/',
          stream: s,
          serverData: u,
          containerAttributes: { 'q:render': f ? 'static' : '', ...u.containerAttributes },
        }),
        g = {
          loaders: U(t),
          action: t.sharedMap.get(E),
          status: d !== 200 ? d : 200,
          href: H(t.url),
        };
      (typeof m.html == 'string' && (await s.write(m.html)), t.sharedMap.set(Ie, g));
    } finally {
      (await s.ready, await s.close(), await c);
    }
    await o.close();
  };
}
async function vt(e) {
  try {
    await e.next();
  } catch (a) {
    if (!(a instanceof ne)) throw a;
  }
  if (e.headersSent) return;
  const t = e.status(),
    n = e.headers.get('Location');
  if (t >= 301 && t <= 308 && n) {
    const a = Nt(n);
    if (a) {
      (e.headers.set('Location', a), e.getWritableStream().close());
      return;
    } else (e.status(200), e.headers.delete('Location'));
  }
}
async function It(e) {
  if ((await e.next(), e.headersSent || e.exited)) return;
  const t = e.status(),
    n = e.headers.get('Location');
  (e.request.headers.forEach((d, f) => d),
    e.headers.set('Content-Type', 'application/json; charset=utf-8'));
  let i = U(e);
  const a = e.query.getAll(Ee),
    r = a.length > 0;
  if (r) {
    const d = {};
    for (const f of a) {
      const u = i[f];
      d[f] = u;
    }
    i = d;
  }
  const o = r
      ? { loaders: i, status: t !== 200 ? t : 200, href: H(e.url) }
      : {
          loaders: i,
          action: e.sharedMap.get(E),
          status: t !== 200 ? t : 200,
          href: H(e.url),
          redirect: n ?? void 0,
          isRewrite: e.sharedMap.get(ve),
        },
    c = e.getWritableStream().getWriter(),
    s = await W([o]);
  (c.write(S.encode(s)), e.sharedMap.set(Ie, o), c.close());
}
function Nt(e) {
  if (e.startsWith('/')) {
    if (!e.includes(C)) {
      const t = new URL(e, 'http://localhost');
      return (t.pathname.endsWith('/') ? t.pathname.slice(0, -1) : t.pathname) + C + t.search;
    }
    return e;
  } else return;
}
function ue() {
  return typeof performance < 'u' ? performance.now() : 0;
}
async function G(e, t, n) {
  const i = ue();
  try {
    return await n();
  } finally {
    const a = ue() - i;
    let r = e.sharedMap.get(Z);
    (r || e.sharedMap.set(Z, (r = [])), r.push([t, a]));
  }
}
function Ut(e, ...t) {
  const n = e.get('content-type')?.split(/;/, 1)[0].trim() ?? '';
  return t.includes(n);
}
let ee;
import('node:async_hooks')
  .then((e) => {
    ee = new e.AsyncLocalStorage();
  })
  .catch((e) => {
    console.warn(
      `
=====================
  Qwik Router Warning:
    AsyncLocalStorage is not available, continuing without it.
    This impacts concurrent async server calls, where they lose access to the ServerRequestEv object.
=====================

`,
      e
    );
  });
let K;
async function Ot(e, t) {
  const { render: n, checkOrigin: i } = t;
  let { qwikRouterConfig: a } = t;
  if ((a || (K || (K = await import('./@qwik-router-config.js')), (a = K)), !a))
    throw new Error('qwikRouterConfig is required.');
  const { pathname: r, isInternal: o } = V(e.url.pathname),
    c = await he(a, r, e.request.method, i ?? !0, n, o);
  if (c) {
    const [s, d] = c;
    return ft(
      e,
      s,
      d,
      async (u) => {
        const { pathname: m } = V(u.pathname),
          g = await he(a, m, e.request.method, i ?? !0, n, o);
        if (g) {
          const [p, w] = g;
          return { loadedRoute: p, requestHandlers: w };
        } else return { loadedRoute: null, requestHandlers: [] };
      },
      a.basePathname
    );
  }
  return null;
}
async function he(e, t, n, i, a, r) {
  const { routes: o, serverPlugins: c, menus: s, cacheModules: d } = e,
    f = await je(o, s, d, t, r),
    u = wt(c, f, n, i, Ct(a), r);
  return u.length > 0 ? [f, u] : null;
}
const kt = [
  [
    '/',
    '<html>\n<head>\n  <meta charset="utf-8">\n  <meta http-equiv="Status" content="404">\n  <title>404 Resource Not Found</title>\n  <meta name="viewport" content="width=device-width,initial-scale=1">\n  <style>\n    body { color: #006ce9; background-color: #fafafa; padding: 30px; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Roboto, sans-serif; }\n    p { max-width: 600px; margin: 60px auto 30px auto; background: white; border-radius: 4px; box-shadow: 0px 0px 50px -20px #006ce9; overflow: hidden; }\n    strong { display: inline-block; padding: 15px; background: #006ce9; color: white; }\n    span { display: inline-block; padding: 15px; }\n  </style>\n</head>\n<body><p><strong>404</strong> <span>Resource Not Found</span></p></body>\n</html>',
  ],
];
function Dt(e) {
  for (const [t, n] of kt) if (e.startsWith(t)) return n;
  return we(404, 'Resource Not Found');
}
const Y = new Set([
  '/assets/hntX-3So-bundle-graph.json',
  '/build/@qwik-router-config.js',
  '/build/client.js',
  '/build/core.js',
  '/build/index.js',
  '/build/index.qwik.js',
  '/build/index.qwik.mjs_DocumentHeadTags_component_wN4EXdu8SGc.js',
  '/build/index.qwik.mjs_ErrorBoundary_component_useOnWindow_m5Sk2IlEID0.js',
  '/build/index.qwik.mjs_Form_form_onSubmit_BeAwOn57TTk.js',
  '/build/index.qwik.mjs_GetForm_component_form_onSubmit_1_064bkz4ABxQ.js',
  '/build/index.qwik.mjs_Link_component_useVisibleTask_s0AOvxtg8Ro.js',
  '/build/index.qwik.mjs_QwikRouterMockProvider_component_l3r5FZs1iZs.js',
  '/build/index.qwik.mjs_QwikRouterProvider_component_liu6N9qZ71A.js',
  '/build/index.qwik.mjs_RouterOutlet_component_ZqzYySEulAk.js',
  '/build/index.qwik.mjs_qwikifyQrl_component_useTask_RC85rQf70Eo.js',
  '/build/index.qwik.mjs_routeActionQrl_action_submit_lXw4ILRuCgg.js',
  '/build/index.qwik.mjs_serverQrl_9OpHM16tjMw.js',
  '/build/index.qwik.mjs_spaInit_event_JxM9f0jYvNc.js',
  '/build/index.qwik.mjs_usePreventNavigateQrl_useVisibleTask_SZCM0RmqYp4.js',
  '/build/index.qwik.mjs_useQwikMockRouter_goto_0NcoS0SO5YI.js',
  '/build/index.qwik.mjs_useQwikRouter_useStyles_7vVCXsPiLGY.js',
  '/build/index.qwik.mjs_useWakeupSignal_activate_OQ5ZKd8q0IE.js',
  '/build/index.tsx_QCounter_qwikify_XN4g00S0H0o.js',
  '/build/index.tsx_react_component_LV70raIZnaU.js',
  '/build/index.tsx_react_component_QCounter_onMount_BlOTm5FbA84.js',
  '/build/index.tsx_react_component_QCounter_onUnmount_HR37K1ubX2k.js',
  '/build/index.tsx_routes_component_gjfdAfVfon8.js',
  '/build/index2.js',
  '/build/index3.js',
  '/build/index4.js',
  '/build/layout.js',
  '/build/layout.tsx_layout_component_i4fGZrVJtMY.js',
  '/build/preloader.js',
  '/build/qwik-router.js',
  '/build/qwikloader.js',
  '/build/root.js',
  '/build/root.tsx_root_component_gFGlZ3bW0jM.js',
  '/build/routing.qwik.js',
  '/build/routing.qwik.mjs_createLoaderSignal_createAsyncComputed_9VejONLZLkg.js',
  '/q-manifest.json',
  '/sitemap.xml',
]);
function me(e, t) {
  if (e.toUpperCase() !== 'GET') return !1;
  const n = t.pathname;
  if (
    n.startsWith('/' + (globalThis.__QWIK_BUILD_DIR__ || 'build') + '/') ||
    n.startsWith('/' + (globalThis.__QWIK_ASSETS_DIR__ || 'assets') + '/') ||
    Y.has(n)
  )
    return !0;
  if (n.endsWith('/q-data.json')) {
    const i = n.replace(/\/q-data.json$/, '');
    if (Y.has(i + '/') || Y.has(i)) return !0;
  }
  return !1;
}
class j extends Error {
  constructor(t, n) {
    (super(typeof n == 'string' ? n : void 0), (this.status = t), (this.data = n));
  }
}
class z {}
class ne extends z {}
class De extends z {
  constructor(t) {
    (super(), (this.pathname = t));
  }
}
const $t = {
  '3gp': 'video/3gpp',
  '3gpp': 'video/3gpp',
  asf: 'video/x-ms-asf',
  asx: 'video/x-ms-asf',
  avi: 'video/x-msvideo',
  avif: 'image/avif',
  bmp: 'image/x-ms-bmp',
  css: 'text/css',
  flv: 'video/x-flv',
  gif: 'image/gif',
  htm: 'text/html',
  html: 'text/html',
  ico: 'image/x-icon',
  jng: 'image/x-jng',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  js: 'application/javascript',
  json: 'application/json',
  kar: 'audio/midi',
  m4a: 'audio/x-m4a',
  m4v: 'video/x-m4v',
  mid: 'audio/midi',
  midi: 'audio/midi',
  mng: 'video/x-mng',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
  ogg: 'audio/ogg',
  pdf: 'application/pdf',
  png: 'image/png',
  rar: 'application/x-rar-compressed',
  shtml: 'text/html',
  svg: 'image/svg+xml',
  svgz: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  ts: 'video/mp2t',
  txt: 'text/plain',
  wbmp: 'image/vnd.wap.wbmp',
  webm: 'video/webm',
  webp: 'image/webp',
  wmv: 'video/x-ms-wmv',
  woff: 'font/woff',
  woff2: 'font/woff2',
  xml: 'text/xml',
  zip: 'application/zip',
};
function J(e, t) {
  return t?.getOrigin?.(e) ?? t?.origin ?? process.env.ORIGIN ?? Ft(e);
}
function Ft(e) {
  const { PROTOCOL_HEADER: t, HOST_HEADER: n } = process.env,
    i = e.headers,
    a = (t && i[t]) || (e.socket.encrypted || e.connection.encrypted ? 'https' : 'http'),
    r = n ?? (e instanceof Ve ? ':authority' : 'host'),
    o = i[r];
  return `${a}://${o}`;
}
function X(e, t) {
  return Qt(e.originalUrl || e.url || '/', t);
}
function Wt(e = '') {
  return ['The stream has been destroyed', 'write after end'].some((n) => e.includes(n));
}
const ge = /^:(method|scheme|authority|path)$/i;
function Qt(e, t) {
  const n = /\/\/|\\\\/g;
  return new URL(e.replace(n, '/'), t);
}
async function jt(e, t, n, i, a) {
  const r = new Headers(),
    o = t.headers;
  try {
    for (const [m, g] of Object.entries(o))
      if (!ge.test(m)) {
        if (typeof g == 'string') r.set(m, g);
        else if (Array.isArray(g)) for (const p of g) r.append(m, p);
      }
  } catch (m) {
    console.error(m);
  }
  const c = async function* () {
      for await (const m of t) yield m;
    },
    s = t.method === 'HEAD' || t.method === 'GET' ? void 0 : c(),
    d = new AbortController(),
    f = { method: t.method, headers: r, body: s, signal: d.signal, duplex: 'half' };
  return (
    n.on('close', () => {
      d.abort();
    }),
    {
      mode: i,
      url: e,
      request: new Request(e.href, f),
      env: {
        get(m) {
          return process.env[m];
        },
      },
      getWritableStream: (m, g, p) => {
        n.statusCode = m;
        try {
          for (const [R, T] of g) ge.test(R) || n.setHeader(R, T);
          const w = p.headers();
          w.length > 0 && n.setHeader('Set-Cookie', w);
        } catch (w) {
          console.error(w);
        }
        return new WritableStream({
          write(w) {
            n.closed ||
              n.destroyed ||
              n.write(w, (R) => {
                R && !Wt(R.message) && console.error(R);
              });
          },
          close() {
            n.end();
          },
        });
      },
      getClientConn: () => (a ? a(t) : { ip: t.socket.remoteAddress }),
      platform: { ssr: !0, incomingMessage: t, node: process.versions.node },
      locale: void 0,
    }
  );
}
function qt(e) {
  (e.qwikCityPlan &&
    !e.qwikRouterConfig &&
    (console.warn('qwikCityPlan is deprecated. Simply remove it.'),
    (e.qwikRouterConfig = e.qwikCityPlan)),
    e.manifest && ze(e.manifest));
  const t = e.static?.root ?? L(ye(import.meta.url), '..', '..', 'dist');
  return {
    router: async (r, o, c) => {
      try {
        const s = J(r, e),
          d = await jt(X(r, s), r, o, 'server', e.getClientConn),
          f = await Ot(d, e);
        if (f) {
          const u = await f.completion;
          if (u) throw u;
          if (f.requestEv.headersSent) return;
        }
        c();
      } catch (s) {
        (console.error(s), c(s));
      }
    },
    notFound: async (r, o, c) => {
      try {
        if (!o.headersSent) {
          const s = J(r, e),
            d = X(r, s),
            f =
              !r.headers.accept?.includes('text/html') || me(r.method || 'GET', d)
                ? 'Not Found'
                : Dt(d.pathname);
          (o.writeHead(404, {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Not-Found': d.pathname,
          }),
            o.end(f));
        }
      } catch (s) {
        (console.error(s), c(s));
      }
    },
    staticFile: async (r, o, c) => {
      try {
        const s = J(r, e),
          d = X(r, s);
        if (me(r.method || 'GET', d)) {
          const f = d.pathname;
          let u;
          Je(f).includes('.') ? (u = L(t, f)) : (u = L(t, f + 'index.html'));
          const m = Xe(u).replace(/^\./, ''),
            g = Ye(u);
          g.on('error', c);
          const p = $t[m];
          (p && o.setHeader('Content-Type', p),
            e.static?.cacheControl && o.setHeader('Cache-Control', e.static.cacheControl),
            g.pipe(o));
          return;
        }
        return c();
      } catch (s) {
        (console.error(s), c(s));
      }
    },
  };
}
const re = L(ye(import.meta.url), '..', '..', 'dist'),
  Et = L(re, 'build'),
  St = L(re, 'assets'),
  pe = process.env.PORT ?? 3e3,
  { router: Gt, notFound: zt } = qt({ render: Ze }),
  I = q();
I.use('/build', q.static(Et, { immutable: !0, maxAge: '1y' }));
I.use('/assets', q.static(St, { immutable: !0, maxAge: '1y' }));
I.use(q.static(re, { redirect: !1 }));
I.use(Gt);
I.use(zt);
I.listen(pe, () => {
  console.log(`Server started: http://localhost:${pe}/`);
});
