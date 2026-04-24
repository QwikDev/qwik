import {
  QWIK_PRELOADS_UPDATE_EVENT,
  type QwikPreloadEntryRemembered,
  type QwikPreloadLoadMatchQuality,
  type QwikPreloadMatchMode,
  type QwikPreloadOriginKind,
  type QwikPreloadPhase,
  type QwikPreloadQrlRequestRemembered,
  type QwikSsrPreloadSnapshotRemembered,
  type QwikPreloadStatus,
  type QwikPreloadStoreRemembered,
} from '@qwik.dev/devtools/kit';

type MutablePreloadStore = QwikPreloadStoreRemembered & {
  _id?: number;
  _initialized?: boolean;
  _byHref?: Record<string, number>;
  _byId?: Record<number, QwikPreloadEntryRemembered>;
};

type MutableQrlRequest = QwikPreloadQrlRequestRemembered & {
  matchedEntryId?: number;
};

const DYNAMIC_IMPORT_RE = /(https?:\/\/[^\s)'"`]+\.m?js[^\s)'"`]*)/i;
const NODE_MODULES_RE = /(?:^|\/)node_modules(?:\/|$)/i;
const VIRTUAL_MODULE_RE = /(?:^|[/?#])(virtual:|@id\/|__x00__|__virtual__)/i;
const GENERATED_MODULE_RE = /(?:^|[/?#])(qrl:|__generated__|_component_)/i;
const VITE_PLUGIN_INJECTED_RE =
  /(?:@devtools\/(?:ui|plugin)|@qwik\.dev\/devtools\/ui|virtual-qwik-devtools\.ts|virtual:qwik-component-proxy|\/packages\/(?:ui|plugin)\/(?:src|lib)\/)/i;
const QRL_MATCH_WINDOW_MS = 1500;

const now = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const isTerminalStatus = (status?: string): boolean => status === 'loaded' || status === 'error';

const phaseHrefKey = (phase: QwikPreloadPhase | undefined, normalizedHref: string) =>
  `${phase || 'csr'}:${normalizedHref}`;

const toAbsoluteHref = (href: string) => {
  try {
    return new URL(href, document.baseURI).href;
  } catch {
    return href || '';
  }
};

const normalizeHref = (href: string) => {
  const absolute = toAbsoluteHref(href);
  try {
    const url = new URL(absolute);
    url.hash = '';
    return url.href;
  } catch {
    return absolute.split('#')[0];
  }
};

const getPathExtension = (href: string) => {
  try {
    const url = new URL(href, document.baseURI);
    const pathname = url.pathname || '';
    const lastDot = pathname.lastIndexOf('.');
    return lastDot >= 0 ? pathname.slice(lastDot + 1).toLowerCase() : '';
  } catch {
    const clean = (href || '').split('#')[0].split('?')[0];
    const lastDot = clean.lastIndexOf('.');
    return lastDot >= 0 ? clean.slice(lastDot + 1).toLowerCase() : '';
  }
};

const inferResourceType = (asValue?: string, href?: string, initiatorType?: string) => {
  if (asValue) {
    return asValue;
  }
  if (initiatorType) {
    return initiatorType;
  }
  const ext = getPathExtension(href || '');
  if (['js', 'mjs', 'cjs'].includes(ext)) {
    return 'script';
  }
  if (ext === 'css') {
    return 'style';
  }
  if (['woff', 'woff2', 'ttf', 'otf'].includes(ext)) {
    return 'font';
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'].includes(ext)) {
    return 'image';
  }
  if (['mp4', 'webm', 'mov'].includes(ext)) {
    return 'video';
  }
  if (['mp3', 'wav', 'ogg'].includes(ext)) {
    return 'audio';
  }
  if (ext === 'json') {
    return 'json';
  }
  return 'other';
};

const isExternalHref = (href: string) => {
  try {
    return new URL(href, document.baseURI).origin !== window.location.origin;
  } catch {
    return false;
  }
};

const inferOriginKind = (
  href?: string,
  source?: QwikPreloadEntryRemembered['source']
): QwikPreloadOriginKind => {
  if (!href) {
    return source === 'qrl-correlation' ? 'generated' : 'unknown';
  }

  if (VITE_PLUGIN_INJECTED_RE.test(href)) {
    return 'vite-plugin-injected';
  }
  if (NODE_MODULES_RE.test(href)) {
    return 'node_modules';
  }
  if (VIRTUAL_MODULE_RE.test(href)) {
    return 'virtual-module';
  }
  if (GENERATED_MODULE_RE.test(href)) {
    return 'generated';
  }
  if (isExternalHref(href)) {
    return 'external';
  }

  return 'current-project';
};

const inferPhase = (detail: Record<string, any>, fallback: QwikPreloadPhase = 'csr') => {
  const phase = detail.phase || detail.executionPhase || detail.env;
  if (phase === 'ssr' || phase === 'csr' || phase === 'unknown') {
    return phase;
  }
  return fallback;
};

const emitUpdate = (store: MutablePreloadStore) => {
  window.dispatchEvent(
    new CustomEvent(QWIK_PRELOADS_UPDATE_EVENT, {
      detail: {
        count: store.entries.length,
        updatedAt: now(),
      },
    })
  );
};

const syncImportDuration = (entry: QwikPreloadEntryRemembered, importDuration?: number) => {
  if (typeof importDuration !== 'number') {
    return;
  }
  entry.importDuration = importDuration;
  entry.duration = importDuration;
};

const syncLoadDuration = (entry: QwikPreloadEntryRemembered, loadDuration?: number) => {
  if (typeof loadDuration !== 'number') {
    return;
  }
  if (typeof entry.loadDuration === 'number' && entry.loadDuration >= loadDuration) {
    entry.qrlToLoadDuration = entry.loadDuration;
    return;
  }
  entry.loadDuration = loadDuration;
  entry.qrlToLoadDuration = loadDuration;
};

const createStore = (): MutablePreloadStore => {
  const existing = window.__QWIK_PRELOADS__ as MutablePreloadStore | undefined;
  if (existing) {
    return existing;
  }

  const store: MutablePreloadStore = {
    entries: [],
    qrlRequests: [],
    startedAt: now(),
    clear() {
      store.entries.length = 0;
      store.qrlRequests.length = 0;
      store._byHref = {};
      store._byId = {};
      emitUpdate(store);
    },
    _id: 0,
    _initialized: false,
    _byHref: {},
    _byId: {},
  };

  window.__QWIK_PRELOADS__ = store;
  return store;
};

const getEntryById = (store: MutablePreloadStore, id?: number) =>
  typeof id === 'number' ? store._byId?.[id] : undefined;

const findMostRecentEntry = (
  store: MutablePreloadStore,
  normalizedHref: string,
  phase?: QwikPreloadPhase
) => {
  for (let i = store.entries.length - 1; i >= 0; i--) {
    const entry = store.entries[i];
    if (entry.normalizedHref === normalizedHref && (!phase || entry.phase === phase)) {
      return entry;
    }
  }
  return undefined;
};

const findActiveEntry = (
  store: MutablePreloadStore,
  normalizedHref: string,
  phase?: QwikPreloadPhase
) => {
  const entry = getEntryById(store, store._byHref?.[phaseHrefKey(phase, normalizedHref)]);
  if (entry && !isTerminalStatus(entry.status)) {
    return entry;
  }
  return undefined;
};

const mergeEntry = (
  entry: QwikPreloadEntryRemembered,
  payload: Partial<QwikPreloadEntryRemembered>
) => {
  if (payload.href && !entry.href) {
    entry.href = payload.href;
  }
  if (payload.rel) {
    entry.rel = payload.rel;
  }
  if (payload.as) {
    entry.as = payload.as;
  }
  if (payload.resourceType && entry.resourceType === 'other') {
    entry.resourceType = payload.resourceType;
  }
  if (payload.source === 'performance' || entry.source !== 'performance') {
    entry.source = payload.source || entry.source;
  }
  if (typeof payload.discoveredAt === 'number' && !entry.discoveredAt) {
    entry.discoveredAt = payload.discoveredAt;
  }
  if (typeof payload.requestedAt === 'number') {
    entry.requestedAt = payload.requestedAt;
  }
  if (typeof payload.completedAt === 'number') {
    entry.completedAt = payload.completedAt;
  }
  if (typeof payload.importDuration === 'number') {
    syncImportDuration(entry, payload.importDuration);
  }
  if (typeof payload.duration === 'number' && typeof payload.importDuration !== 'number') {
    syncImportDuration(entry, payload.duration);
  }
  if (typeof payload.transferSize === 'number') {
    entry.transferSize = payload.transferSize;
  }
  if (typeof payload.decodedBodySize === 'number') {
    entry.decodedBodySize = payload.decodedBodySize;
  }
  if (payload.initiatorType) {
    entry.initiatorType = payload.initiatorType;
  }
  if (payload.status) {
    entry.status = payload.status;
  }
  if (payload.qrlSymbol) {
    entry.qrlSymbol = payload.qrlSymbol;
  }
  if (typeof payload.qrlRequestedAt === 'number') {
    entry.qrlRequestedAt = payload.qrlRequestedAt;
  }
  if (typeof payload.loadDuration === 'number') {
    syncLoadDuration(entry, payload.loadDuration);
  }
  if (typeof payload.qrlToLoadDuration === 'number' && typeof payload.loadDuration !== 'number') {
    syncLoadDuration(entry, payload.qrlToLoadDuration);
  }
  if (payload.loadMatchQuality) {
    entry.loadMatchQuality = payload.loadMatchQuality;
  }
  if (payload.originKind && payload.originKind !== 'unknown') {
    entry.originKind = payload.originKind;
  }
  if (payload.phase && payload.phase !== 'unknown') {
    entry.phase = payload.phase;
  }
  if (payload.matchedBy && payload.matchedBy !== 'none') {
    entry.matchedBy = payload.matchedBy;
  }
  if (payload.error) {
    entry.error = payload.error;
  }
  return entry;
};

const createEntry = (
  store: MutablePreloadStore,
  payload: Partial<QwikPreloadEntryRemembered> & {
    href: string;
    normalizedHref: string;
  }
) => {
  const entry: QwikPreloadEntryRemembered = {
    id: (store._id = (store._id || 0) + 1),
    href: payload.href,
    normalizedHref: payload.normalizedHref,
    rel: payload.rel || '',
    as: payload.as || '',
    resourceType: payload.resourceType || 'other',
    status: payload.status || 'pending',
    source: payload.source || 'mutation',
    discoveredAt: payload.discoveredAt ?? now(),
    requestedAt: payload.requestedAt,
    completedAt: payload.completedAt,
    duration: payload.duration,
    transferSize: payload.transferSize,
    decodedBodySize: payload.decodedBodySize,
    initiatorType: payload.initiatorType,
    qrlSymbol: payload.qrlSymbol,
    qrlRequestedAt: payload.qrlRequestedAt,
    qrlToLoadDuration: payload.qrlToLoadDuration,
    originKind: payload.originKind || inferOriginKind(payload.href, payload.source),
    phase: payload.phase || 'csr',
    importDuration: payload.importDuration ?? payload.duration,
    loadDuration: payload.loadDuration ?? payload.qrlToLoadDuration,
    loadMatchQuality: payload.loadMatchQuality || 'none',
    matchedBy: payload.matchedBy || 'none',
    error: payload.error,
  };

  syncImportDuration(entry, entry.importDuration);
  syncLoadDuration(entry, entry.loadDuration);
  store.entries.push(entry);
  store._byHref![phaseHrefKey(entry.phase, entry.normalizedHref)] = entry.id;
  store._byId![entry.id] = entry;
  return entry;
};

const upsertEntry = (
  store: MutablePreloadStore,
  payload: Partial<QwikPreloadEntryRemembered> & {
    href?: string;
    normalizedHref?: string;
  },
  preferActive = true
) => {
  const normalizedHref = payload.normalizedHref || normalizeHref(payload.href || '');
  if (!normalizedHref) {
    return undefined;
  }
  const href = payload.href || normalizedHref;
  const phase = payload.phase || 'csr';

  const activeTarget = findActiveEntry(store, normalizedHref, phase);
  if (activeTarget) {
    return mergeEntry(activeTarget, {
      ...payload,
      href,
      normalizedHref,
      phase,
    });
  }

  if (!preferActive) {
    const fallback = findMostRecentEntry(store, normalizedHref, phase);
    if (fallback) {
      return mergeEntry(fallback, { ...payload, href, normalizedHref, phase });
    }
  }

  return createEntry(store, { ...payload, href, normalizedHref, phase });
};

const isScriptLikeEntry = (entry: QwikPreloadEntryRemembered) =>
  entry.resourceType === 'script' ||
  entry.rel === 'modulepreload' ||
  entry.rel === 'dynamic-import' ||
  entry.as === 'script';

const timeDistance = (entry: QwikPreloadEntryRemembered, request: MutableQrlRequest) => {
  const anchor = entry.requestedAt ?? entry.completedAt ?? entry.discoveredAt;
  return Math.abs(anchor - request.requestedAt);
};

export function findBestQrlRequestMatch(
  entries: QwikPreloadEntryRemembered[],
  request: Pick<MutableQrlRequest, 'normalizedHref' | 'phase' | 'requestedAt' | 'symbol'>
): {
  entryId?: number;
  matchedBy: QwikPreloadMatchMode;
  loadMatchQuality: QwikPreloadLoadMatchQuality;
} {
  const phase = request.phase === 'ssr' || request.phase === 'csr' ? request.phase : 'csr';

  if (request.normalizedHref) {
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.qrlRequestedAt != null && entry.qrlSymbol !== request.symbol) {
        continue;
      }
      if (entry.phase === phase && entry.normalizedHref === request.normalizedHref) {
        return {
          entryId: entry.id,
          matchedBy: 'normalized-href',
          loadMatchQuality: 'best-effort',
        };
      }
    }
  }

  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.phase !== phase) {
      continue;
    }
    if (!request.symbol || entry.qrlSymbol !== request.symbol) {
      continue;
    }
    return {
      entryId: entry.id,
      matchedBy: 'resource-name',
      loadMatchQuality: 'best-effort',
    };
  }

  let bestEntry: QwikPreloadEntryRemembered | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.phase !== phase || !isScriptLikeEntry(entry)) {
      continue;
    }
    if (entry.qrlRequestedAt != null && entry.qrlSymbol !== request.symbol) {
      continue;
    }

    const distance = timeDistance(entry, request as MutableQrlRequest);
    const entryCompletedAt = entry.completedAt ?? entry.requestedAt ?? entry.discoveredAt;
    if (entryCompletedAt + 50 < request.requestedAt) {
      continue;
    }
    if (distance > QRL_MATCH_WINDOW_MS || distance >= bestDistance) {
      continue;
    }

    bestDistance = distance;
    bestEntry = entry;
  }

  if (!bestEntry) {
    return { matchedBy: 'none', loadMatchQuality: 'none' };
  }

  return {
    entryId: bestEntry.id,
    matchedBy: 'chunk-hash',
    loadMatchQuality: 'best-effort',
  };
}

const updateLoadDurationFromRequest = (
  entry: QwikPreloadEntryRemembered,
  request: MutableQrlRequest,
  eventCompletedAt?: number
) => {
  const completion =
    typeof eventCompletedAt === 'number'
      ? Math.max(eventCompletedAt, entry.completedAt ?? eventCompletedAt)
      : entry.completedAt;
  if (typeof completion === 'number') {
    syncLoadDuration(entry, Math.max(0, completion - request.requestedAt));
  }
};

const applyRequestToEntry = (
  entry: QwikPreloadEntryRemembered,
  request: MutableQrlRequest,
  matchedBy: QwikPreloadMatchMode,
  loadMatchQuality: QwikPreloadLoadMatchQuality,
  eventCompletedAt?: number
) => {
  request.matchedEntryId = entry.id;
  entry.qrlSymbol = request.symbol;
  entry.qrlRequestedAt = request.requestedAt;
  entry.loadMatchQuality = loadMatchQuality;
  if (
    request.originKind &&
    (entry.originKind === 'unknown' ||
      entry.originKind === 'generated' ||
      entry.originKind === 'current-project')
  ) {
    entry.originKind = request.originKind;
  }
  if (matchedBy !== 'none') {
    entry.matchedBy = matchedBy;
  }
  updateLoadDurationFromRequest(entry, request, eventCompletedAt);
  entry.qrlToLoadDuration = entry.loadDuration;
};

const tryMatchRequest = (
  store: MutablePreloadStore,
  request: MutableQrlRequest,
  eventCompletedAt?: number
) => {
  const match = findBestQrlRequestMatch(store.entries, request);
  if (typeof match.entryId !== 'number') {
    return undefined;
  }

  const entry = getEntryById(store, match.entryId);
  if (!entry) {
    return undefined;
  }

  applyRequestToEntry(entry, request, match.matchedBy, match.loadMatchQuality, eventCompletedAt);
  return entry;
};

const tryMatchPendingRequestsForEntry = (
  store: MutablePreloadStore,
  entry?: QwikPreloadEntryRemembered,
  eventCompletedAt?: number
) => {
  if (!entry) {
    return;
  }

  for (let i = store.qrlRequests.length - 1; i >= 0; i--) {
    const request = store.qrlRequests[i] as MutableQrlRequest;
    if (request.matchedEntryId) {
      continue;
    }

    const match = findBestQrlRequestMatch([entry], request);
    if (match.entryId !== entry.id) {
      continue;
    }

    applyRequestToEntry(entry, request, match.matchedBy, match.loadMatchQuality, eventCompletedAt);
    return;
  }
};

const finalizeEntry = (
  store: MutablePreloadStore,
  entry: QwikPreloadEntryRemembered | undefined,
  status: QwikPreloadStatus,
  errorMessage?: string
) => {
  if (!entry) {
    return;
  }
  const completedAt = now();
  entry.status = status;
  if (typeof entry.completedAt !== 'number') {
    entry.completedAt = completedAt;
  }
  if (typeof entry.duration !== 'number') {
    const start = typeof entry.requestedAt === 'number' ? entry.requestedAt : entry.discoveredAt;
    entry.duration = Math.max(0, entry.completedAt - start);
  }
  if (typeof entry.qrlRequestedAt === 'number') {
    syncLoadDuration(entry, Math.max(0, entry.completedAt - entry.qrlRequestedAt));
  }
  if (errorMessage) {
    entry.error = errorMessage;
  }
  emitUpdate(store);
};

const observeLink = (
  store: MutablePreloadStore,
  observedLinks: WeakSet<HTMLLinkElement>,
  link: HTMLLinkElement
) => {
  if (observedLinks.has(link)) {
    return;
  }
  observedLinks.add(link);
  link.addEventListener('load', () => {
    const normalizedHref = normalizeHref(link.href || link.getAttribute('href') || '');
    finalizeEntry(store, findMostRecentEntry(store, normalizedHref, 'csr'), 'loaded');
  });
  link.addEventListener('error', () => {
    const normalizedHref = normalizeHref(link.href || link.getAttribute('href') || '');
    finalizeEntry(
      store,
      findMostRecentEntry(store, normalizedHref, 'csr'),
      'error',
      'Failed to preload resource'
    );
  });
};

const recordLink = (
  store: MutablePreloadStore,
  observedLinks: WeakSet<HTMLLinkElement>,
  link: HTMLLinkElement,
  source: QwikPreloadEntryRemembered['source']
) => {
  const rel = (link.getAttribute('rel') || '').toLowerCase();
  if (!['preload', 'modulepreload', 'prefetch'].includes(rel)) {
    return;
  }

  const rawHref = link.getAttribute('href') || link.href;
  if (!rawHref) {
    return;
  }

  const href = toAbsoluteHref(rawHref);
  const normalizedHref = normalizeHref(href);
  const asValue = link.getAttribute('as') || link.as || '';

  const entry = upsertEntry(store, {
    href,
    normalizedHref,
    rel,
    as: asValue,
    resourceType: inferResourceType(asValue, href),
    source,
    status: 'pending',
    discoveredAt: now(),
    originKind: inferOriginKind(href, source),
    phase: 'csr',
  });

  observeLink(store, observedLinks, link);
  tryMatchPendingRequestsForEntry(store, entry);
  emitUpdate(store);
};

const shouldCreateFromResourceTiming = (entry: PerformanceResourceTiming) => {
  const href = entry.name || '';
  const resourceType = inferResourceType(undefined, href, entry.initiatorType || undefined);
  return (
    resourceType === 'script' ||
    entry.initiatorType === 'script' ||
    entry.initiatorType === 'link' ||
    href.includes('_component_') ||
    href.includes('/build/q-')
  );
};

const applyResourceTiming = (store: MutablePreloadStore, resourceEntry: PerformanceEntry) => {
  if (!('name' in resourceEntry)) {
    return;
  }
  const timing = resourceEntry as PerformanceResourceTiming;
  const normalizedHref = normalizeHref(timing.name || '');

  let entry = findMostRecentEntry(store, normalizedHref, 'csr');
  if (!entry && shouldCreateFromResourceTiming(timing)) {
    entry = createEntry(store, {
      href: toAbsoluteHref(timing.name || normalizedHref),
      normalizedHref,
      rel: timing.initiatorType === 'link' ? 'preload' : 'dynamic-import',
      as: inferResourceType(undefined, timing.name || '', timing.initiatorType || undefined),
      resourceType: inferResourceType(
        undefined,
        timing.name || '',
        timing.initiatorType || undefined
      ),
      source: 'performance',
      status: 'loaded',
      discoveredAt: timing.startTime,
      originKind: inferOriginKind(timing.name || normalizedHref, 'performance'),
      phase: 'csr',
    });
  }

  if (!entry) {
    return;
  }

  const completedAt = timing.responseEnd || timing.startTime || now();
  mergeEntry(entry, {
    source: 'performance',
    requestedAt: timing.startTime,
    completedAt,
    importDuration: Math.max(0, completedAt - timing.startTime),
    transferSize: typeof timing.transferSize === 'number' ? timing.transferSize : undefined,
    decodedBodySize:
      typeof timing.decodedBodySize === 'number' ? timing.decodedBodySize : undefined,
    initiatorType: timing.initiatorType || undefined,
    resourceType: inferResourceType(entry.as, entry.href, timing.initiatorType || undefined),
    status: 'loaded',
    originKind: inferOriginKind(entry.href, 'performance'),
    phase: 'csr',
  });

  tryMatchPendingRequestsForEntry(store, entry, completedAt);
  if (typeof entry.qrlRequestedAt === 'number') {
    syncLoadDuration(entry, Math.max(0, completedAt - entry.qrlRequestedAt));
  }
  emitUpdate(store);
};

const createSymbolHref = (symbol?: string) => `qrl:${symbol || 'unknown'}`;

const extractHrefFromUnknownError = (value: unknown) => {
  const text =
    typeof value === 'string'
      ? value
      : value && typeof value === 'object' && 'message' in value
        ? String((value as { message?: unknown }).message || '')
        : '';
  const match = text.match(DYNAMIC_IMPORT_RE);
  return match?.[1];
};

const recordQrlEvent = (
  store: MutablePreloadStore,
  detail: Record<string, any>,
  eventTime: number | undefined,
  status: QwikPreloadStatus,
  errorMessage?: string
) => {
  const symbol = detail.symbol ? String(detail.symbol) : 'unknown';
  const href = detail.href ? toAbsoluteHref(detail.href) : createSymbolHref(symbol);
  const normalizedHref = normalizeHref(href);
  const requestedAt = typeof detail.reqTime === 'number' ? detail.reqTime : now();
  const completedAt = typeof eventTime === 'number' ? eventTime : now();
  const originKind = inferOriginKind(href, 'qrl-correlation');
  const phase = inferPhase(detail, 'csr');

  const entry = createEntry(store, {
    href,
    normalizedHref,
    rel: detail.href ? 'modulepreload' : 'dynamic-import',
    as: 'script',
    resourceType: 'script',
    source: 'qrl-correlation',
    status,
    discoveredAt: requestedAt,
    requestedAt,
    completedAt,
    qrlSymbol: symbol,
    qrlRequestedAt: requestedAt,
    loadDuration: Math.max(0, completedAt - requestedAt),
    loadMatchQuality: detail.href ? 'best-effort' : 'none',
    originKind,
    phase,
    matchedBy: detail.href ? 'href' : 'none',
    error: errorMessage,
  });

  return entry;
};

const recordWindowError = (
  store: MutablePreloadStore,
  href: string,
  status: QwikPreloadStatus,
  errorMessage: string
) => {
  const normalizedHref = normalizeHref(href);
  const entry =
    findMostRecentEntry(store, normalizedHref, 'csr') ||
    createEntry(store, {
      href: toAbsoluteHref(href),
      normalizedHref,
      rel: 'dynamic-import',
      as: 'script',
      resourceType: 'script',
      source: 'performance',
      status,
      discoveredAt: now(),
      originKind: inferOriginKind(href, 'performance'),
      phase: 'csr',
    });

  finalizeEntry(store, entry, status, errorMessage);
};

const ingestSsrPreloads = (store: MutablePreloadStore, detail: Record<string, any>) => {
  const rawEntries = Array.isArray(detail.entries)
    ? detail.entries
    : Array.isArray(detail)
      ? detail
      : [];

  for (const raw of rawEntries) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const href = typeof raw.href === 'string' ? raw.href : '';
    const normalizedHref =
      typeof raw.normalizedHref === 'string' ? raw.normalizedHref : normalizeHref(href);
    if (!normalizedHref) {
      continue;
    }

    const entry = upsertEntry(
      store,
      {
        href: href || normalizedHref,
        normalizedHref,
        rel: typeof raw.rel === 'string' ? raw.rel : 'dynamic-import',
        as: typeof raw.as === 'string' ? raw.as : 'script',
        resourceType: typeof raw.resourceType === 'string' ? raw.resourceType : 'script',
        source: typeof raw.source === 'string' ? raw.source : 'qrl-correlation',
        status: typeof raw.status === 'string' ? raw.status : 'loaded',
        discoveredAt: typeof raw.discoveredAt === 'number' ? raw.discoveredAt : now(),
        requestedAt: typeof raw.requestedAt === 'number' ? raw.requestedAt : undefined,
        completedAt: typeof raw.completedAt === 'number' ? raw.completedAt : undefined,
        importDuration:
          typeof raw.importDuration === 'number'
            ? raw.importDuration
            : typeof raw.duration === 'number'
              ? raw.duration
              : undefined,
        loadDuration:
          typeof raw.loadDuration === 'number'
            ? raw.loadDuration
            : typeof raw.qrlToLoadDuration === 'number'
              ? raw.qrlToLoadDuration
              : undefined,
        duration: typeof raw.duration === 'number' ? raw.duration : undefined,
        transferSize: typeof raw.transferSize === 'number' ? raw.transferSize : undefined,
        decodedBodySize: typeof raw.decodedBodySize === 'number' ? raw.decodedBodySize : undefined,
        initiatorType: typeof raw.initiatorType === 'string' ? raw.initiatorType : undefined,
        qrlSymbol: typeof raw.qrlSymbol === 'string' ? raw.qrlSymbol : undefined,
        qrlRequestedAt: typeof raw.qrlRequestedAt === 'number' ? raw.qrlRequestedAt : undefined,
        qrlToLoadDuration:
          typeof raw.qrlToLoadDuration === 'number' ? raw.qrlToLoadDuration : undefined,
        loadMatchQuality: raw.loadMatchQuality === 'best-effort' ? 'best-effort' : 'none',
        originKind:
          typeof raw.originKind === 'string'
            ? (raw.originKind as QwikPreloadOriginKind)
            : inferOriginKind(href || normalizedHref, 'qrl-correlation'),
        phase: 'ssr',
        matchedBy: typeof raw.matchedBy === 'string' ? raw.matchedBy : 'none',
        error: typeof raw.error === 'string' ? raw.error : undefined,
      },
      false
    );

    if (entry) {
      mergeEntry(entry, {
        ...raw,
        href: href || normalizedHref,
        normalizedHref,
        phase: 'ssr',
        originKind:
          typeof raw.originKind === 'string'
            ? (raw.originKind as QwikPreloadOriginKind)
            : inferOriginKind(href || normalizedHref, 'qrl-correlation'),
      });
      tryMatchPendingRequestsForEntry(store, entry);
    }
  }

  emitUpdate(store);
};

export function ensurePreloadRuntime() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const store = createStore();
  if (store._initialized) {
    return;
  }
  store._initialized = true;

  const observedLinks = new WeakSet<HTMLLinkElement>();

  document
    .querySelectorAll<HTMLLinkElement>(
      'link[rel="preload"], link[rel="modulepreload"], link[rel="prefetch"]'
    )
    .forEach((link) => recordLink(store, observedLinks, link, 'initial-dom'));

  const ssrSnapshot = Array.isArray(window.__QWIK_SSR_PRELOADS__)
    ? (window.__QWIK_SSR_PRELOADS__ as QwikSsrPreloadSnapshotRemembered[])
    : [];
  if (ssrSnapshot.length > 0) {
    ingestSsrPreloads(store, { entries: ssrSnapshot });
  }

  const mutationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.target instanceof HTMLLinkElement) {
        recordLink(store, observedLinks, mutation.target, 'mutation');
      }

      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) {
          return;
        }
        if (node instanceof HTMLLinkElement) {
          recordLink(store, observedLinks, node, 'mutation');
          return;
        }
        node
          .querySelectorAll?.(
            'link[rel="preload"], link[rel="modulepreload"], link[rel="prefetch"]'
          )
          .forEach((link) => recordLink(store, observedLinks, link as HTMLLinkElement, 'mutation'));
      });
    }
  });

  mutationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['rel', 'href', 'as'],
  });

  if (typeof performance !== 'undefined' && performance.getEntriesByType) {
    performance.getEntriesByType('resource').forEach((entry) => applyResourceTiming(store, entry));
  }

  if (typeof PerformanceObserver !== 'undefined') {
    const perfObserver = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => applyResourceTiming(store, entry));
    });

    try {
      perfObserver.observe({ type: 'resource', buffered: true });
    } catch {
      try {
        perfObserver.observe({ entryTypes: ['resource'] });
      } catch {
        // ignore unsupported observer config
      }
    }
  }

  document.addEventListener('qsymbol', (event) => {
    const detail = event instanceof CustomEvent ? (event.detail as Record<string, any>) : {};
    const href = detail.href ? toAbsoluteHref(detail.href) : undefined;
    const normalizedHref = href ? normalizeHref(href) : undefined;
    const originKind = inferOriginKind(href, 'qrl-correlation');
    const phase = inferPhase(detail, 'csr');
    const request: MutableQrlRequest = {
      symbol: detail.symbol || 'unknown',
      href,
      normalizedHref,
      requestedAt: typeof detail.reqTime === 'number' ? detail.reqTime : now(),
      originKind,
      phase,
    };
    store.qrlRequests.push(request);

    const eventCompletedAt =
      typeof event.timeStamp === 'number' && Number.isFinite(event.timeStamp)
        ? event.timeStamp
        : undefined;
    const existing = tryMatchRequest(store, request, eventCompletedAt);
    if (existing) {
      emitUpdate(store);
      return;
    }

    if (href) {
      recordQrlEvent(store, { ...detail, href }, eventCompletedAt, 'loaded');
    }
    emitUpdate(store);
  });

  document.addEventListener('qerror', (event) => {
    const detail = event instanceof CustomEvent ? (event.detail as Record<string, any>) : {};
    const href = detail.href || extractHrefFromUnknownError(detail.error);
    const normalizedHref = href ? normalizeHref(href) : undefined;
    const errorMessage =
      typeof detail?.error?.message === 'string'
        ? detail.error.message
        : detail?.error
          ? String(detail.error)
          : 'Failed to load QRL';
    const phase = inferPhase(detail, 'csr');
    const request: MutableQrlRequest = {
      symbol: detail.symbol || 'unknown',
      href,
      normalizedHref,
      requestedAt: typeof detail.reqTime === 'number' ? detail.reqTime : now(),
      originKind: inferOriginKind(href, 'qrl-correlation'),
      phase,
    };
    store.qrlRequests.push(request);

    const eventCompletedAt =
      typeof event.timeStamp === 'number' && Number.isFinite(event.timeStamp)
        ? event.timeStamp
        : undefined;
    const existing = tryMatchRequest(store, request, eventCompletedAt);
    if (existing) {
      existing.status = 'error';
      existing.error = errorMessage;
      if (typeof eventCompletedAt === 'number') {
        existing.completedAt = Math.max(existing.completedAt ?? eventCompletedAt, eventCompletedAt);
        updateLoadDurationFromRequest(existing, request, eventCompletedAt);
      }
      emitUpdate(store);
      return;
    }

    recordQrlEvent(store, { ...detail, href }, eventCompletedAt, 'error', errorMessage);
    emitUpdate(store);
  });

  window.addEventListener('qwik:ssr-preloads', (event) => {
    const detail = event instanceof CustomEvent ? (event.detail as Record<string, any>) : {};
    if (Array.isArray(detail.entries)) {
      window.__QWIK_SSR_PRELOADS__ = detail.entries as QwikSsrPreloadSnapshotRemembered[];
    }
    ingestSsrPreloads(store, detail);
  });

  window.addEventListener('error', (event) => {
    const href =
      extractHrefFromUnknownError(event.error) || extractHrefFromUnknownError(event.message);
    if (!href) {
      return;
    }
    recordWindowError(
      store,
      href,
      'error',
      typeof event.message === 'string'
        ? event.message
        : 'Failed to fetch dynamically imported module'
    );
  });

  window.addEventListener('unhandledrejection', (event) => {
    const href = extractHrefFromUnknownError(event.reason);
    if (!href) {
      return;
    }
    recordWindowError(store, href, 'error', String(event.reason));
  });
}
