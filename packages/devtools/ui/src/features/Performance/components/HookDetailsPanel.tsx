import { component$ } from '@qwik.dev/core';
import { computeEventRows, type PerfComponentVm, type PerfEventVm } from '../computePerfViewModel';
import { formatMs } from '../utils/formatMs';

interface HookDetailsPanelProps {
  component: PerfComponentVm;
  onClose$: () => void;
}

const HookRow = component$<{ row: PerfEventVm }>(({ row }) => (
  <div class="grid grid-cols-3 px-3 py-2 text-sm">
    <div class="truncate">{row.eventName}</div>
    <div class="text-right">{formatMs(row.time)}</div>
    <div class="text-right">{row.calls}</div>
  </div>
));

export const HookDetailsPanel = component$<HookDetailsPanelProps>(({ component, onClose$ }) => {
  const rows = computeEventRows(component.csrItems);

  return (
    <>
      <div class="border-glass-border flex items-center justify-between border-b p-4">
        <div class="min-w-0">
          <div class="truncate text-base font-semibold">{component.componentName} Hook Details</div>
          <div class="text-muted-foreground mt-1 text-xs">
            Total: {formatMs(component.totalTime)} • {component.calls} calls
          </div>
        </div>
        <button
          aria-label="close"
          onClick$={onClose$}
          class="text-muted-foreground hover:text-foreground rounded p-2 transition-colors"
        >
          ✕
        </button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-4">
        <div class="border-border bg-card-item-bg rounded-lg border">
          <div class="border-border grid grid-cols-3 border-b px-3 py-2 text-xs font-medium">
            <div class="text-muted-foreground">HOOK NAME</div>
            <div class="text-muted-foreground text-right">TIME</div>
            <div class="text-muted-foreground text-right">CALLS</div>
          </div>
          <div class="divide-glass-border divide-y">
            {rows.map((row) => (
              <HookRow key={row.eventName} row={row} />
            ))}
            {rows.length === 0 && (
              <div class="text-muted-foreground px-3 py-4 text-center text-sm">
                No CSR records for this component.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
});
