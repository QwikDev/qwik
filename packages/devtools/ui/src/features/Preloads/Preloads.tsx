import { type QwikPreloadStoreRemembered } from '@devtools/kit';
import {
  $,
  component$,
  useComputed$,
  useSignal,
  useStore,
  useVisibleTask$,
} from '@qwik.dev/core';
import { StatCard } from '../Performance/components/StatCard';
import { formatMs } from '../Performance/utils/formatMs';
import {
  computePreloadViewModel,
  createDefaultPreloadFilters,
  filterPreloadRows,
  type PreloadFilter,
  type PreloadSourceFilters,
  type PreloadViewFilters,
} from './computePreloadViewModel';
import { getPageDataSource } from '../../devtools/page-data-source';

const DEFAULT_FILTERS = createDefaultPreloadFilters();
type SourceFilterKey = keyof PreloadSourceFilters;
type PhaseFilterKey = keyof PreloadViewFilters['phaseFilters'];

const FILTERS: { id: PreloadFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'loaded', label: 'Loaded' },
  { id: 'pending', label: 'Pending' },
  { id: 'error', label: 'Error' },
  { id: 'qrl-correlated', label: 'QRL Matched' },
  { id: 'unmatched', label: 'Unmatched' },
];

function formatRelativeMs(ms?: number): string {
  if (!Number.isFinite(ms)) {
    return '-';
  }
  return `${(ms || 0).toFixed(2)}ms`;
}

function makeLabelCount(label: string, count: number) {
  return `${label} (${count})`;
}

export const Preloads = component$(() => {
  const version = useSignal(0);
  const activeFilter = useSignal<PreloadFilter>('all');
  const sourceFilters = useStore<PreloadSourceFilters>({
    ...DEFAULT_FILTERS.sourceFilters,
  });
  const phaseFilters = useStore<PreloadViewFilters['phaseFilters']>({
    ...DEFAULT_FILTERS.phaseFilters,
  });
  const store = useSignal<QwikPreloadStoreRemembered | null>(null);

  useVisibleTask$(async () => {
    const source = getPageDataSource();
    store.value = await source.readPreloadStore();
    version.value++;

    const refresh = () => {
      // Re-read store on each update (handles both in-page and remote sources)
      source.readPreloadStore().then((s) => {
        store.value = s;
        version.value++;
      });
    };

    const unsub = source.subscribePreloadUpdates(refresh);
    return () => {
      unsub?.();
    };
  });

  const vm = useComputed$(() => {
    version.value;
    return computePreloadViewModel(store.value, {
      sourceFilters: { ...sourceFilters },
      phaseFilters: { ...phaseFilters },
    });
  });

  const rows = useComputed$(() =>
    filterPreloadRows(vm.value.rows, activeFilter.value),
  );
  const runtimeState = useComputed$(() => {
    version.value;
    return {
      initialized: !!store.value,
      qrlRequests: store.value?.qrlRequests.length ?? 0,
    };
  });

  const clear = $(async () => {
    const source = getPageDataSource();
    await source.clearPreloadStore();
    store.value = await source.readPreloadStore();
    version.value++;
  });

  const toggleSourceFilter = $((key: SourceFilterKey) => {
    sourceFilters[key] = !sourceFilters[key];
  });

  const togglePhaseFilter = $((key: PhaseFilterKey) => {
    phaseFilters[key] = !phaseFilters[key];
  });

  return (
    <div class="h-full w-full flex-1 overflow-hidden">
      <div class="flex h-full min-h-0 flex-col gap-4">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Visible QRLs"
            value={String(vm.value.overview.total)}
            subtitle={`${vm.value.overview.csr} CSR • ${vm.value.overview.ssr} SSR`}
          />
          <StatCard
            label="Average Import Duration"
            value={formatMs(vm.value.overview.avgImportDuration)}
            subtitle={`Max ${formatMs(vm.value.overview.maxImportDuration)}`}
          />
          <StatCard
            label="Average Load Duration"
            value={formatMs(vm.value.overview.avgLoadDuration)}
            subtitle={`Max ${formatMs(vm.value.overview.maxLoadDuration)}`}
          />
          <StatCard
            label="Preloaded Before Use"
            value={String(vm.value.overview.correlated)}
            subtitle="Matched before the QRL fired"
          />
          <StatCard
            label="Missed Preloads"
            value={String(
              Math.max(
                0,
                vm.value.overview.total - vm.value.overview.correlated,
              ),
            )}
            subtitle="QRLs that were used first"
          />
        </div>

        <div class="border-glass-border bg-card-item-bg flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border">
          <div class="border-glass-border flex flex-wrap items-start justify-between gap-4 border-b p-4">
            <div class="flex flex-col gap-3">
              <div class="text-muted-foreground text-[11px]">
                Runtime:{' '}
                {runtimeState.value.initialized ? 'active' : 'inactive'} • QRL
                requests: {runtimeState.value.qrlRequests}
              </div>
              <div class="flex flex-wrap gap-2">
                {FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    class={
                      activeFilter.value === filter.id
                        ? 'bg-primary text-primary-foreground rounded-full px-3 py-1.5 text-xs font-medium'
                        : 'border-border text-muted-foreground rounded-full border px-3 py-1.5 text-xs font-medium'
                    }
                    onClick$={() => {
                      activeFilter.value = filter.id;
                    }}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              <div class="flex flex-wrap gap-2">
                <div class="text-muted-foreground mr-1 text-xs font-medium tracking-wide uppercase">
                  Sources
                </div>
                <label class="border-border text-muted-foreground flex cursor-default items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium opacity-90">
                  <input
                    type="checkbox"
                    checked
                    disabled
                    class="h-3.5 w-3.5 rounded"
                  />
                  Current Project ({vm.value.sourceCounts['current-project']})
                </label>
                <label class="border-border flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={sourceFilters.vitePluginInjected}
                    class="h-3.5 w-3.5 rounded focus:ring-0"
                    style={{ accentColor: 'var(--color-primary-active)' }}
                    onChange$={() => toggleSourceFilter('vitePluginInjected')}
                  />
                  {makeLabelCount(
                    'Vite Plugin Injected',
                    vm.value.sourceCounts['vite-plugin-injected'],
                  )}
                </label>
                <label class="border-border flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={sourceFilters.nodeModules}
                    class="h-3.5 w-3.5 rounded focus:ring-0"
                    style={{ accentColor: 'var(--color-primary-active)' }}
                    onChange$={() => toggleSourceFilter('nodeModules')}
                  />
                  {makeLabelCount(
                    'Node Modules',
                    vm.value.sourceCounts.node_modules,
                  )}
                </label>
                <label class="border-border flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={sourceFilters.virtualModule}
                    class="h-3.5 w-3.5 rounded focus:ring-0"
                    style={{ accentColor: 'var(--color-primary-active)' }}
                    onChange$={() => toggleSourceFilter('virtualModule')}
                  />
                  {makeLabelCount(
                    'Virtual Module',
                    vm.value.sourceCounts['virtual-module'],
                  )}
                </label>
                <label class="border-border flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={sourceFilters.generated}
                    class="h-3.5 w-3.5 rounded focus:ring-0"
                    style={{ accentColor: 'var(--color-primary-active)' }}
                    onChange$={() => toggleSourceFilter('generated')}
                  />
                  {makeLabelCount('Generated', vm.value.sourceCounts.generated)}
                </label>
                <label class="border-border flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={sourceFilters.external}
                    class="h-3.5 w-3.5 rounded focus:ring-0"
                    style={{ accentColor: 'var(--color-primary-active)' }}
                    onChange$={() => toggleSourceFilter('external')}
                  />
                  {makeLabelCount('External', vm.value.sourceCounts.external)}
                </label>
                <label class="border-border flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={sourceFilters.unknown}
                    class="h-3.5 w-3.5 rounded focus:ring-0"
                    style={{ accentColor: 'var(--color-primary-active)' }}
                    onChange$={() => toggleSourceFilter('unknown')}
                  />
                  {makeLabelCount('Unknown', vm.value.sourceCounts.unknown)}
                </label>
              </div>

              <div class="flex flex-wrap gap-2">
                <div class="text-muted-foreground mr-1 text-xs font-medium tracking-wide uppercase">
                  Phase
                </div>
                <label class="border-border flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={phaseFilters.csr}
                    class="h-3.5 w-3.5 rounded focus:ring-0"
                    style={{ accentColor: 'var(--color-primary-active)' }}
                    onChange$={() => togglePhaseFilter('csr')}
                  />
                  {makeLabelCount('CSR', vm.value.phaseCounts.csr)}
                </label>
                <label class="border-border flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={phaseFilters.ssr}
                    class="h-3.5 w-3.5 rounded focus:ring-0"
                    style={{ accentColor: 'var(--color-primary-active)' }}
                    onChange$={() => togglePhaseFilter('ssr')}
                  />
                  {makeLabelCount('SSR', vm.value.phaseCounts.ssr)}
                </label>
              </div>
            </div>

            <button
              type="button"
              class="border-border text-muted-foreground rounded-full border px-3 py-1.5 text-xs font-medium"
              onClick$={clear}
            >
              Clear
            </button>
          </div>

          <div class="min-h-0 flex-1 overflow-auto">
            <table class="w-full min-w-[1080px] text-left text-sm">
              <thead class="bg-background/60 text-muted-foreground sticky top-0 z-10 text-xs tracking-wide uppercase">
                <tr>
                  <th class="px-4 py-3 font-medium">Content</th>
                  <th class="px-4 py-3 font-medium">Type</th>
                  <th class="px-4 py-3 font-medium">Environment</th>
                  <th class="px-4 py-3 font-medium">Status</th>
                  <th class="px-4 py-3 font-medium">Import Duration</th>
                  <th class="px-4 py-3 font-medium">Load Duration</th>
                  <th class="px-4 py-3 font-medium">QRL Requested</th>
                </tr>
              </thead>
              <tbody>
                {rows.value.length ? (
                  rows.value.map((row) => (
                    <tr
                      key={row.id}
                      class="border-glass-border border-t align-top"
                    >
                      <td class="px-4 py-3">
                        <div class="font-medium break-all">{row.shortHref}</div>
                        <div class="text-muted-foreground mt-1 text-xs break-all">
                          {row.href}
                        </div>
                        {row.qrlSymbol ? (
                          <div class="text-muted-foreground mt-1 text-xs">
                            Symbol: {row.qrlSymbol}
                          </div>
                        ) : null}
                      </td>
                      <td class="px-4 py-3">
                        <div>{row.rel || '-'}</div>
                        <div class="text-muted-foreground mt-1 text-xs">
                          {row.as || row.resourceType || '-'}
                        </div>
                        <div class="text-muted-foreground mt-1 text-[11px] tracking-wide uppercase">
                          {row.originKind}
                        </div>
                      </td>
                      <td class="px-4 py-3">
                        <div class="font-medium tracking-wide uppercase">
                          {row.phase}
                        </div>
                      </td>
                      <td class="px-4 py-3">
                        <div class="font-medium">{row.status}</div>
                        <div class="text-muted-foreground mt-1 text-xs">
                          {row.source}
                        </div>
                      </td>
                      <td class="px-4 py-3">
                        {formatMs(row.importDuration ?? NaN)}
                      </td>
                      <td class="px-4 py-3">
                        {formatMs(row.loadDuration ?? NaN)}
                      </td>
                      <td class="px-4 py-3">
                        {formatRelativeMs(row.qrlRequestedAt)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr class="border-glass-border border-t">
                    <td
                      class="text-muted-foreground px-4 py-8 text-center text-sm"
                      colSpan={7}
                    >
                      No rows match the current filters. Uncheck a filter or
                      re-enable CSR to view data.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
});
