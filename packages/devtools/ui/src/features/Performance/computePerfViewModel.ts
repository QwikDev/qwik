import type { QwikPerfStoreRemembered } from '@devtools/kit';
import {
  groupCsrBySsr,
  parseComponentAndEventName,
  type PerfCsrItem,
  type PerfGroupedCsrItem,
  type PerfSsrItem,
} from './transformPerformanceData';

export type PerfPayload = QwikPerfStoreRemembered;

export interface PerfOverviewVm {
  totalRenderTime: number;
  totalCalls: number;
  avgTime: number;
  slowestComponent?: {
    componentName: string;
    avgTime: number;
    totalTime: number;
    calls: number;
  };
}

export interface PerfComponentVm {
  componentName: string;
  totalTime: number;
  calls: number;
  avgTime: number;
  ssr?: PerfSsrItem;
  csrItems: PerfGroupedCsrItem[];
}

export interface PerfEventVm {
  eventName: string;
  time: number;
  calls: number;
}

export interface PerfViewModel {
  overview: PerfOverviewVm;
  components: PerfComponentVm[];
}

function getCallsFromCsr(item: PerfGroupedCsrItem): number {
  return typeof item.renderCount === 'number' ? item.renderCount : 1;
}

export function computeEventRows(
  csrItems: PerfGroupedCsrItem[],
): PerfEventVm[] {
  const byEvent = new Map<string, { time: number; calls: number }>();
  for (const item of csrItems) {
    const eventName = item.eventName || 'render';
    const prev = byEvent.get(eventName) || { time: 0, calls: 0 };
    prev.time += item.duration || 0;
    prev.calls += getCallsFromCsr(item);
    byEvent.set(eventName, prev);
  }
  return [...byEvent.entries()]
    .map(([eventName, v]) => ({ eventName, time: v.time, calls: v.calls }))
    .sort((a, b) => b.time - a.time);
}

function computeComponentVmFromCsr(
  componentName: string,
  csrItems: PerfGroupedCsrItem[],
  ssr?: PerfSsrItem,
): PerfComponentVm {
  let totalTime = 0;
  let calls = 0;
  for (const item of csrItems) {
    totalTime += item.duration || 0;
    calls += getCallsFromCsr(item);
  }
  const avgTime = calls > 0 ? totalTime / calls : 0;
  return { componentName, totalTime, calls, avgTime, ssr, csrItems };
}

// ---------------------------------------------------------------------------
// Component grouping helpers
// ---------------------------------------------------------------------------

/** Build component view-models when SSR entries are available. */
function groupComponentsBySsr(safe: PerfPayload): PerfComponentVm[] {
  const grouped = groupCsrBySsr(safe);
  const result: PerfComponentVm[] = [];
  for (const raw of safe.ssr) {
    const ssrItem: PerfSsrItem = { ...raw, phase: 'ssr' as const };
    const componentName = parseComponentAndEventName(
      ssrItem.component,
    ).componentName;
    const csrItems = grouped.get(raw as PerfSsrItem) || [];
    result.push(computeComponentVmFromCsr(componentName, csrItems, ssrItem));
  }
  return result;
}

/** Build component view-models from CSR-only data, grouped by component name. */
function groupComponentsByName(csrRaw: PerfPayload['csr']): PerfComponentVm[] {
  const byName = new Map<string, PerfGroupedCsrItem[]>();
  for (const entry of csrRaw) {
    const csrItem: PerfCsrItem = { ...entry, phase: 'csr' as const };
    const parsed = parseComponentAndEventName(csrItem.component);
    const list = byName.get(parsed.componentName) || [];
    list.push({ ...csrItem, ...parsed });
    byName.set(parsed.componentName, list);
  }
  const result: PerfComponentVm[] = [];
  for (const [componentName, csrItems] of byName.entries()) {
    result.push(computeComponentVmFromCsr(componentName, csrItems));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Overview helpers
// ---------------------------------------------------------------------------

function computeOverview(components: PerfComponentVm[]): PerfOverviewVm {
  let totalRenderTime = 0;
  let totalCalls = 0;
  for (const c of components) {
    totalRenderTime += c.totalTime;
    totalCalls += c.calls;
  }
  const avgTime = totalCalls > 0 ? totalRenderTime / totalCalls : 0;

  const slowest = components
    .filter((c) => c.calls > 0)
    .reduce<PerfComponentVm | undefined>((acc, cur) => {
      if (!acc) {
        return cur;
      }
      return cur.avgTime > acc.avgTime ? cur : acc;
    }, undefined);

  return {
    totalRenderTime,
    totalCalls,
    avgTime,
    slowestComponent: slowest
      ? {
          componentName: slowest.componentName,
          avgTime: slowest.avgTime,
          totalTime: slowest.totalTime,
          calls: slowest.calls,
        }
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function computePerfViewModel(
  perf: PerfPayload | undefined | null,
): PerfViewModel {
  const safe: PerfPayload = perf || { ssr: [], csr: [] };

  const components = safe.ssr?.length
    ? groupComponentsBySsr(safe)
    : safe.csr?.length
      ? groupComponentsByName(safe.csr)
      : [];

  // Sort components by total time (desc) to make the list useful.
  components.sort((a, b) => b.totalTime - a.totalTime);

  return { overview: computeOverview(components), components };
}
