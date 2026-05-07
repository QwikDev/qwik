/**
 * Shared runtime snippet used by perf instrumentation code.
 *
 * This file exports a **string** (not executable TS) that gets concatenated into:
 *
 * - The virtual module `virtual:qwik-component-proxy`
 * - Injected wrappers for Qwik-generated `_component_` render-function modules
 *
 * It is intentionally framework-agnostic and relies only on `window`/`process`.
 */
const perfRuntime = `
// [qwik-perf-runtime] shared helpers (injected)
const __qwik_perf_is_server__ = () => typeof window === 'undefined';

const __qwik_perf_init_csr__ = () => {
  if (typeof window === 'undefined') return;
  window.__QWIK_PERF__ = window.__QWIK_PERF__ || { ssr: [], csr: [] };
  // Map: viteId -> index in perf.csr (used for upsert)
  window.__QWIK_PERF__._csrByViteId = window.__QWIK_PERF__._csrByViteId || {};
  // Map: component -> index in perf.ssr (used for componentQrl upsert on CSR)
  window.__QWIK_PERF__._ssrByComponent = window.__QWIK_PERF__._ssrByComponent || {};
};

const __qwik_perf_get_ssr_store__ = () =>
  typeof process !== 'undefined' && process ? process : globalThis;

const __qwik_perf_next_id__ = (perf) => {
  perf._id = (perf._id || 0) + 1;
  return perf._id;
};

const __qwik_perf_next_ssr_id__ = (store) => {
  store.__QWIK_SSR_PERF_ID__ = (store.__QWIK_SSR_PERF_ID__ || 0) + 1;
  return store.__QWIK_SSR_PERF_ID__;
};

const __qwik_perf_ssr_push__ = (store, entry) => {
  const id = __qwik_perf_next_ssr_id__(store);
  store.__QWIK_SSR_PERF__.push({ id, ...entry });
  return store.__QWIK_SSR_PERF__.length - 1;
};

const __qwik_perf_commit_ssr__ = (store, entry) => {
  store.__QWIK_SSR_PERF__ = store.__QWIK_SSR_PERF__ || [];

  // Upsert by key (viteId preferred, otherwise component). Keep only the latest entry per key,
  // but also attach an ever-increasing ssrCount so we can see how many times it rendered.
  store.__QWIK_SSR_PERF_INDEX__ = store.__QWIK_SSR_PERF_INDEX__ || {};
  store.__QWIK_SSR_PERF_COUNT__ = store.__QWIK_SSR_PERF_COUNT__ || {};

  const key = (entry && (entry.viteId || entry.component)) || 'unknown';
  const nextCount = (store.__QWIK_SSR_PERF_COUNT__[key] || 0) + 1;
  store.__QWIK_SSR_PERF_COUNT__[key] = nextCount;

  const next = { ...entry, ssrCount: nextCount };
  const existingIdx = store.__QWIK_SSR_PERF_INDEX__[key];

  if (typeof existingIdx === 'number') {
    const prev = store.__QWIK_SSR_PERF__[existingIdx];
    store.__QWIK_SSR_PERF__[existingIdx] = { id: prev?.id, ...next };
  } else {
    store.__QWIK_SSR_PERF_INDEX__[key] = __qwik_perf_ssr_push__(store, next);
  }
};

const __qwik_perf_commit_csr__ = (entry) => {
  __qwik_perf_init_csr__();
  const perf = window.__QWIK_PERF__;
  const next = { id: __qwik_perf_next_id__(perf), ...entry };

  // If viteId exists we treat it as an "upsert" record (render-function modules).
  if (entry && entry.viteId) {
    const idx = perf._csrByViteId[entry.viteId];
    if (typeof idx === 'number') perf.csr[idx] = next;
    else {
      perf._csrByViteId[entry.viteId] = perf.csr.length;
      perf.csr.push(next);
    }
  } else {
    perf.csr.push(next);
  }

  // Notify devtools hook + extension
  var renderEvent = {
    component: (entry && entry.component) || 'unknown',
    phase: 'csr',
    duration: (entry && entry.duration) || 0,
    timestamp: Date.now(),
  };
  if (window.__QWIK_DEVTOOLS_HOOK__ && window.__QWIK_DEVTOOLS_HOOK__._emitRender) {
    window.__QWIK_DEVTOOLS_HOOK__._emitRender(renderEvent);
  }
  window.postMessage({ source: 'qwik-devtools', type: 'RENDER_EVENT', event: renderEvent }, '*');
};

// Force componentQrl entries to be treated as SSR records.
// - On SSR: store into process/globalThis __QWIK_SSR_PERF__ (same as other SSR entries)
// - On CSR: store into window.__QWIK_PERF__.ssr (so csr only contains render-function modules)
const __qwik_perf_commit_componentqrl__ = (entry) => {
  const next = { ...entry, phase: 'ssr'};
  if (__qwik_perf_is_server__()) {
    const store = __qwik_perf_get_ssr_store__();
    __qwik_perf_commit_ssr__(store, next);
    return;
  }

  __qwik_perf_init_csr__();
  const perf = window.__QWIK_PERF__;
  perf.ssr = perf.ssr || [];
  // Build index lazily from any SSR-injected snapshot
  if (!perf._ssrIndexBuilt) {
    for (let i = 0; i < perf.ssr.length; i++) {
      const e = perf.ssr[i];
      if (e && e.component && typeof perf._ssrByComponent[e.component] !== 'number') {
        perf._ssrByComponent[e.component] = i;
      }
    }
    perf._ssrIndexBuilt = true;
  }

  const key = next && next.component;
  const idx = key ? perf._ssrByComponent[key] : undefined;
  if (typeof idx === 'number') {
    const prev = perf.ssr[idx];
    const prevCount = prev && typeof prev.ssrCount === 'number' ? prev.ssrCount : 0;
    const ssrCount = prevCount + 1;
    perf.ssr[idx] = { id: prev && prev.id, ...next, ssrCount };
  } else {
    const id = __qwik_perf_next_id__(perf);
    if (key) perf._ssrByComponent[key] = perf.ssr.length;
    perf.ssr.push({ id, ...next, ssrCount: 1 });
  }

  // Notify devtools hook + extension (componentQrl runs on CSR too)
  var renderEvent2 = {
    component: (entry && entry.component) || 'unknown',
    phase: 'csr',
    duration: (entry && entry.duration) || 0,
    timestamp: Date.now(),
  };
  if (window.__QWIK_DEVTOOLS_HOOK__ && window.__QWIK_DEVTOOLS_HOOK__._emitRender) {
    window.__QWIK_DEVTOOLS_HOOK__._emitRender(renderEvent2);
  }
  window.postMessage({ source: 'qwik-devtools', type: 'RENDER_EVENT', event: renderEvent2 }, '*');
};

const __qwik_perf_commit__ = (entry) => {
  if (__qwik_perf_is_server__()) {
    const store = __qwik_perf_get_ssr_store__();
    __qwik_perf_commit_ssr__(store, entry);
  } else {
    __qwik_perf_commit_csr__(entry);
  }
};
`;

export default perfRuntime;
