import { component$ } from '@qwik.dev/core';
import { IconChevronUpMini } from '../../../components/Icons/Icons';
import type { HookFilterItem } from '../types';

interface HookFiltersCardProps {
  filters: HookFilterItem[];
  isOpen: boolean;
  onSelectAll$: () => void;
  onClear$: () => void;
  onToggleOpen$: () => void;
  onFilterChange$: (index: number, checked: boolean) => void;
}

export const HookFiltersCard = component$<HookFiltersCardProps>(
  ({
    filters,
    isOpen,
    onSelectAll$,
    onClear$,
    onToggleOpen$,
    onFilterChange$,
  }) => {
    return (
      <div class="border-glass-border bg-card-item-bg rounded-xl border">
        <div class="border-glass-border flex items-center justify-between border-b px-2 py-2">
          <span class="text-muted-foreground text-xs font-medium">Hooks</span>
          <div class="flex items-center space-x-2">
            <button
              class="text-primary px-2 py-1 text-xs hover:underline"
              onClick$={onSelectAll$}
            >
              Select all
            </button>
            <button
              class="text-muted-foreground hover:text-foreground px-2 py-1 text-xs hover:underline"
              onClick$={onClear$}
            >
              Clear
            </button>
            <button
              aria-label="toggle hooks"
              onClick$={onToggleOpen$}
              class="text-muted-foreground hover:text-foreground rounded p-1"
            >
              <IconChevronUpMini
                class={`h-4 w-4 transition-transform duration-200 ${
                  isOpen ? 'rotate-180' : '-rotate-90'
                }`}
              />
            </button>
          </div>
        </div>

        <div
          class="grid grid-cols-2 gap-x-4 gap-y-3 overflow-hidden px-3 py-2 text-sm"
          style={{
            maxHeight: isOpen ? '800px' : '0px',
            opacity: isOpen ? '1' : '0',
            transition: 'max-height 200ms ease, opacity 200ms ease',
          }}
        >
          {filters.map((item, index) => (
            <label
              key={item.key}
              class="flex min-w-0 cursor-pointer items-center gap-2"
            >
              <input
                type="checkbox"
                checked={item.display}
                class="h-4 w-4 shrink-0 cursor-pointer rounded focus:ring-0"
                style={{ accentColor: 'var(--color-primary-active)' }}
                onChange$={(event: InputEvent) => {
                  const target = event.target as HTMLInputElement;
                  onFilterChange$(index, target.checked);
                }}
              />
              <span class="ml-2 truncate select-none" title={item.key}>
                {item.key}
              </span>
            </label>
          ))}
        </div>
      </div>
    );
  },
);
