import { component$ } from '@qwik.dev/core';
import type { PerfComponentVm } from '../computePerfViewModel';
import { formatMs } from '../utils/formatMs';

interface ComponentCardProps {
  component: PerfComponentVm;
  selected: boolean;
  onClick$: () => void;
}

export const ComponentCard = component$<ComponentCardProps>(
  ({ component, selected, onClick$ }) => {
    return (
      <button
        key={component.componentName}
        onClick$={onClick$}
        class={[
          'border-border bg-card-item-bg hover:bg-card-item-hover-bg w-full rounded-xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5',
          selected ? 'ring-primary-active ring-2' : '',
        ].join(' ')}
      >
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0 flex-1">
            <div class="truncate text-base font-semibold">
              {component.componentName}
            </div>
            <div class="text-muted-foreground mt-1 text-xs">
              Avg: {formatMs(component.avgTime)}
            </div>
          </div>
          <div class="shrink-0 text-right">
            <div class="text-primary text-lg font-semibold">
              {formatMs(component.totalTime)}
            </div>
            <div class="text-muted-foreground text-xs">
              SSR:{' '}
              {typeof component.ssr?.ssrCount === 'number'
                ? component.ssr.ssrCount
                : '-'}
            </div>
          </div>
        </div>
      </button>
    );
  },
);
