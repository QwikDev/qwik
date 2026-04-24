import type {
  QwikPreloadEntryRemembered,
  QwikPreloadOriginKind,
  QwikPreloadPhase,
  QwikPreloadStoreRemembered,
} from '@qwik.dev/devtools/kit';

export type PreloadFilter = 'all' | 'loaded' | 'pending' | 'error' | 'qrl-correlated' | 'unmatched';

export interface PreloadSourceFilters {
  vitePluginInjected: boolean;
  nodeModules: boolean;
  virtualModule: boolean;
  generated: boolean;
  external: boolean;
  unknown: boolean;
}

export interface PreloadViewFilters {
  sourceFilters: PreloadSourceFilters;
  phaseFilters: Record<Exclude<QwikPreloadPhase, 'unknown'>, boolean>;
}

export interface PreloadOverviewVm {
  total: number;
  loaded: number;
  pending: number;
  error: number;
  correlated: number;
  ssr: number;
  csr: number;
  avgImportDuration: number;
  maxImportDuration: number;
  avgLoadDuration: number;
  maxLoadDuration: number;
}

export interface PreloadRowVm {
  id: number;
  href: string;
  shortHref: string;
  rel: string;
  as: string;
  resourceType: string;
  status: string;
  source: string;
  originKind: QwikPreloadOriginKind;
  phase: QwikPreloadPhase;
  importDuration?: number;
  loadDuration?: number;
  qrlRequestedAt?: number;
  loadMatchQuality?: QwikPreloadEntryRemembered['loadMatchQuality'];
  matchedBy: string;
  qrlSymbol?: string;
  latestAt: number;
}

export interface PreloadViewModel {
  overview: PreloadOverviewVm;
  rows: PreloadRowVm[];
  sourceCounts: Record<QwikPreloadOriginKind, number>;
  phaseCounts: Record<QwikPreloadPhase, number>;
}

const DEFAULT_SOURCE_FILTERS: PreloadSourceFilters = {
  vitePluginInjected: false,
  nodeModules: false,
  virtualModule: false,
  generated: false,
  external: false,
  unknown: false,
};

const DEFAULT_PHASE_FILTERS: Record<Exclude<QwikPreloadPhase, 'unknown'>, boolean> = {
  csr: true,
  ssr: true,
};

export function createDefaultPreloadFilters(): PreloadViewFilters {
  return {
    sourceFilters: { ...DEFAULT_SOURCE_FILTERS },
    phaseFilters: { ...DEFAULT_PHASE_FILTERS },
  };
}

export function summarizeHref(href: string): string {
  try {
    const url = new URL(href);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

function latestTimestamp(entry: QwikPreloadEntryRemembered): number {
  return entry.completedAt ?? entry.requestedAt ?? entry.discoveredAt;
}

function averageBy(
  entries: QwikPreloadEntryRemembered[],
  field: 'importDuration' | 'loadDuration'
): number {
  const timed = entries.filter((entry) => typeof entry[field] === 'number');
  if (timed.length === 0) {
    return 0;
  }
  const total = timed.reduce((sum, entry) => sum + (entry[field] || 0), 0);
  return total / timed.length;
}

function buildRow(entry: QwikPreloadEntryRemembered): PreloadRowVm {
  return {
    id: entry.id,
    href: entry.href,
    shortHref: summarizeHref(entry.href),
    rel: entry.rel,
    as: entry.as,
    resourceType: entry.resourceType,
    status: entry.status,
    source: entry.source,
    originKind: entry.originKind,
    phase: entry.phase,
    importDuration: entry.importDuration ?? entry.duration,
    loadDuration: entry.loadDuration ?? entry.qrlToLoadDuration,
    qrlRequestedAt: entry.qrlRequestedAt,
    loadMatchQuality: entry.loadMatchQuality || 'none',
    matchedBy: entry.matchedBy,
    qrlSymbol: entry.qrlSymbol,
    latestAt: latestTimestamp(entry),
  };
}

function matchesOrigin(row: PreloadRowVm, filters: PreloadSourceFilters): boolean {
  if (row.originKind === 'current-project') {
    return true;
  }
  switch (row.originKind) {
    case 'vite-plugin-injected':
      return filters.vitePluginInjected;
    case 'node_modules':
      return filters.nodeModules;
    case 'virtual-module':
      return filters.virtualModule;
    case 'generated':
      return filters.generated;
    case 'external':
      return filters.external;
    case 'unknown':
      return filters.unknown;
    default:
      return false;
  }
}

function matchesPhase(row: PreloadRowVm, filters: PreloadViewFilters['phaseFilters']): boolean {
  if (row.phase === 'unknown') {
    return false;
  }
  return filters[row.phase];
}

export function filterPreloadRows(rows: PreloadRowVm[], filter: PreloadFilter): PreloadRowVm[] {
  switch (filter) {
    case 'loaded':
    case 'pending':
    case 'error':
      return rows.filter((row) => row.status === filter);
    case 'qrl-correlated':
      return rows.filter((row) => typeof row.qrlRequestedAt === 'number');
    case 'unmatched':
      return rows.filter((row) => typeof row.qrlRequestedAt !== 'number');
    default:
      return rows;
  }
}

export function computePreloadViewModel(
  store: QwikPreloadStoreRemembered | null | undefined,
  filters: PreloadViewFilters = createDefaultPreloadFilters()
): PreloadViewModel {
  const entries = store?.entries ?? [];
  const rows = entries.map(buildRow);
  const sourceCounts = {
    'current-project': 0,
    'vite-plugin-injected': 0,
    node_modules: 0,
    'virtual-module': 0,
    generated: 0,
    external: 0,
    unknown: 0,
  } satisfies Record<QwikPreloadOriginKind, number>;
  const phaseCounts = {
    csr: 0,
    ssr: 0,
    unknown: 0,
  } satisfies Record<QwikPreloadPhase, number>;

  for (const row of rows) {
    sourceCounts[row.originKind] += 1;
    phaseCounts[row.phase] += 1;
  }

  const visibleRows = rows
    .filter((row) => matchesOrigin(row, filters.sourceFilters))
    .filter((row) => matchesPhase(row, filters.phaseFilters))
    .sort((a, b) => b.latestAt - a.latestAt);

  const visibleEntries = entries
    .filter((entry) => {
      const origin = entry.originKind;
      if (origin === 'current-project') {
        return true;
      }
      const sourceFilters = filters.sourceFilters;
      switch (origin) {
        case 'vite-plugin-injected':
          return sourceFilters.vitePluginInjected;
        case 'node_modules':
          return sourceFilters.nodeModules;
        case 'virtual-module':
          return sourceFilters.virtualModule;
        case 'generated':
          return sourceFilters.generated;
        case 'external':
          return sourceFilters.external;
        case 'unknown':
          return sourceFilters.unknown;
        default:
          return false;
      }
    })
    .filter((entry) => {
      if (entry.phase === 'unknown') {
        return false;
      }
      return filters.phaseFilters[entry.phase];
    });

  return {
    overview: {
      total: visibleEntries.length,
      loaded: visibleEntries.filter((entry) => entry.status === 'loaded').length,
      pending: visibleEntries.filter((entry) => entry.status === 'pending').length,
      error: visibleEntries.filter((entry) => entry.status === 'error').length,
      correlated: visibleEntries.filter((entry) => typeof entry.qrlRequestedAt === 'number').length,
      ssr: visibleEntries.filter((entry) => entry.phase === 'ssr').length,
      csr: visibleEntries.filter((entry) => entry.phase === 'csr').length,
      avgImportDuration: averageBy(visibleEntries, 'importDuration'),
      maxImportDuration: visibleEntries.reduce(
        (max, entry) => Math.max(max, entry.importDuration ?? entry.duration ?? 0),
        0
      ),
      avgLoadDuration: averageBy(visibleEntries, 'loadDuration'),
      maxLoadDuration: visibleEntries.reduce(
        (max, entry) => Math.max(max, entry.loadDuration ?? entry.qrlToLoadDuration ?? 0),
        0
      ),
    },
    rows: visibleRows,
    sourceCounts,
    phaseCounts,
  };
}
