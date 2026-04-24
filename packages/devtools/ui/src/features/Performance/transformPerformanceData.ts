import type { QwikPerfEntryRemembered, QwikPerfStoreRemembered } from '@qwik.dev/devtools/kit';

export type PerfPayload = QwikPerfStoreRemembered;
// Note: runtime instrumentation attaches `ssrCount` to SSR entries (see plugin perf runtime).
export type PerfSsrItem = QwikPerfEntryRemembered & {
  phase: 'ssr';
  ssrCount?: number;
};
export type PerfCsrItem = QwikPerfEntryRemembered & { phase: 'csr' };

export interface PerfParsedNames {
  componentName: string;
  eventName?: string;
}

export function parseComponentAndEventName(component: string): PerfParsedNames {
  const componentName = (component?.split('_component_')[0] ?? component) || '';
  const rest = component.includes('_component_') ? (component.split('_component_')[1] ?? '') : '';
  const parts = rest.split('_').filter(Boolean);
  const eventName = parts.find((p) => /^use[A-Z_]/.test(p) || /^on[A-Z_]/.test(p));
  return { componentName, eventName };
}

/**
 * Groups CSR records by SSR component name (split by `_component_`).
 *
 * - Key: the SSR item object reference (WeakMap key)
 * - Value: CSR list belonging to that SSR component
 * - Unmatched CSR items: dropped
 */
export type PerfGroupedCsrItem = PerfCsrItem & PerfParsedNames;

export function groupCsrBySsr(data: PerfPayload): WeakMap<PerfSsrItem, PerfGroupedCsrItem[]> {
  const ssrByName = new Map<string, PerfSsrItem>();
  for (const ssrItem of data.ssr) {
    // Trust runtime shape: SSR entries should have phase 'ssr'
    ssrByName.set(
      parseComponentAndEventName(ssrItem.component).componentName,
      ssrItem as PerfSsrItem
    );
  }

  const result = new WeakMap<PerfSsrItem, PerfGroupedCsrItem[]>();
  for (const ssrItem of data.ssr) {
    result.set(ssrItem as PerfSsrItem, []);
  }

  for (const csrItem of data.csr) {
    const parsed = parseComponentAndEventName(csrItem.component);
    const ssrItem = ssrByName.get(parsed.componentName);
    if (!ssrItem) {
      continue;
    }
    result.get(ssrItem)!.push({ ...(csrItem as PerfCsrItem), ...parsed });
  }

  return result;
}
