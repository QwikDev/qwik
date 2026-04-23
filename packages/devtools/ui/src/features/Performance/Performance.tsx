import {
  $,
  component$,
  useComputed$,
  useSignal,
  useTask$,
  useVisibleTask$,
} from '@qwik.dev/core';
import type { QwikPerfStoreRemembered } from '@devtools/kit';
import { computePerfViewModel } from './computePerfViewModel';
import { ComponentCard } from './components/ComponentCard';
import { HookDetailsPanel } from './components/HookDetailsPanel';
import { PerformanceOverview } from './components/PerformanceOverview';
import {
  getPageDataSource,
  type RenderEvent,
} from '../../devtools/page-data-source';

const MAX_RENDER_EVENTS = 200;

export const Performance = component$(() => {
  const perf = useSignal<QwikPerfStoreRemembered | null>(null);
  const selectedComponent = useSignal<string | null>(null);
  const renderEvents = useSignal<RenderEvent[]>([]);

  useTask$(async () => {
    const source = getPageDataSource();
    perf.value = (await source.readPerfData()) ?? { ssr: [], csr: [] };
  });

  // Seed render events from perf snapshot + subscribe to live updates
  useVisibleTask$(async ({ cleanup }) => {
    const source = getPageDataSource();

    // Pre-populate from existing CSR data
    const data = await source.readPerfData();
    const all = [...(data?.ssr || []), ...(data?.csr || [])];
    if (all.length) {
      renderEvents.value = all
        .map((e: any) => ({
          component: e.component || 'unknown',
          phase: e.phase || 'csr',
          duration: e.duration || 0,
          timestamp: e.end || e.start || Date.now(),
        }))
        .slice(-MAX_RENDER_EVENTS);
    }

    const unsub = source.subscribeRenderEvents((event) => {
      renderEvents.value = [...renderEvents.value, event].slice(
        -MAX_RENDER_EVENTS,
      );
    });
    if (unsub) {
      cleanup(unsub);
    }
  });

  const vm = useComputed$(() => computePerfViewModel(perf.value));

  const selectedVm = useComputed$(() => {
    const name = selectedComponent.value;
    if (!name) {
      return null;
    }
    return vm.value.components.find((c) => c.componentName === name) ?? null;
  });

  const onSelect = $((name: string) => {
    selectedComponent.value = name;
  });

  const clearSelect = $(() => {
    selectedComponent.value = null;
  });

  const clearRenderEvents = $(() => {
    renderEvents.value = [];
  });

  const hasData =
    (perf.value?.ssr?.length ?? 0) > 0 || (perf.value?.csr?.length ?? 0) > 0;
  const hasRenderEvents = renderEvents.value.length > 0;

  if (!hasData && !hasRenderEvents) {
    return (
      <div class="h-full w-full flex-1 overflow-hidden">
        <div class="border-border bg-card-item-bg flex h-full items-center justify-center rounded-xl border p-8">
          <div class="text-muted-foreground text-center text-sm">
            No performance data found.
            <div class="mt-1 text-xs">
              Ensure instrumentation is enabled and interact with the app, then
              reopen this tab.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main layout ──
  return (
    <div class="h-full w-full flex-1 overflow-y-auto">
      <div class="flex min-h-0 flex-col gap-4">
        {hasData && <PerformanceOverview overview={vm.value.overview} />}

        {hasData && (
          <div class="border-glass-border bg-card-item-bg flex min-h-0 overflow-hidden rounded-2xl border">
            <div class="min-h-0 flex-1 overflow-y-auto p-4">
              <div class="mb-3 flex items-center justify-between">
                <div>
                  <div class="text-lg font-semibold">Components</div>
                  <div class="text-muted-foreground text-xs">
                    CSR only • {vm.value.components.length} total
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                {vm.value.components.map((c) => (
                  <ComponentCard
                    key={c.componentName}
                    component={c}
                    selected={selectedComponent.value === c.componentName}
                    onClick$={() => onSelect(c.componentName)}
                  />
                ))}
              </div>
            </div>

            <div class="border-glass-border border-l" />

            <div class="flex w-[420px] min-w-[320px] flex-col overflow-hidden">
              {selectedVm.value ? (
                <HookDetailsPanel
                  component={selectedVm.value}
                  onClose$={clearSelect}
                />
              ) : (
                <div class="flex h-full items-center justify-center p-8">
                  <div class="text-muted-foreground text-center text-sm">
                    Select a component to view hook details.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Live Render Events */}
        <div class="border-glass-border bg-card-item-bg rounded-2xl border p-4">
          <div class="mb-3 flex items-center justify-between">
            <div>
              <div class="text-lg font-semibold">Live Renders</div>
              <div class="text-muted-foreground text-xs">
                {renderEvents.value.length} events captured
              </div>
            </div>
            {hasRenderEvents && (
              <button
                class="text-muted-foreground hover:text-foreground rounded px-2 py-1 text-xs transition-colors"
                onClick$={clearRenderEvents}
              >
                Clear
              </button>
            )}
          </div>

          {!hasRenderEvents ? (
            <div class="text-muted-foreground py-6 text-center text-sm">
              No renders captured yet. Interact with the app to trigger
              component renders.
            </div>
          ) : (
            <div class="max-h-[400px] overflow-y-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-muted-foreground border-glass-border border-b text-left text-xs">
                    <th class="py-1.5 pr-3 font-medium">Time</th>
                    <th class="py-1.5 pr-3 font-medium">Component</th>
                    <th class="py-1.5 pr-3 text-right font-medium">Duration</th>
                    <th class="py-1.5 font-medium">Phase</th>
                  </tr>
                </thead>
                <tbody>
                  {renderEvents.value
                    .slice()
                    .reverse()
                    .map((evt, i) => (
                      <tr
                        key={i}
                        class="border-glass-border/50 border-b last:border-0"
                      >
                        <td class="text-muted-foreground py-1.5 pr-3 font-mono text-xs">
                          {new Date(evt.timestamp).toLocaleTimeString()}
                        </td>
                        <td class="text-primary/80 py-1.5 pr-3 font-mono">
                          {evt.component}
                        </td>
                        <td class="py-1.5 pr-3 text-right font-mono">
                          {evt.duration > 0
                            ? `${evt.duration.toFixed(1)}ms`
                            : '-'}
                        </td>
                        <td class="py-1.5">
                          <span
                            class={[
                              'rounded-full px-2 py-0.5 text-xs font-medium',
                              evt.phase === 'ssr'
                                ? 'bg-blue-500/10 text-blue-400'
                                : 'bg-green-500/10 text-green-400',
                            ].join(' ')}
                          >
                            {evt.phase}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
