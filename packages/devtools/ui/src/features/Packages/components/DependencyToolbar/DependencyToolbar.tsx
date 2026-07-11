import { component$, type QRL } from '@qwik.dev/core';

interface DependencyToolbarProps {
  installedSearch: string;
  packageSearch: string;
  isRefreshing: boolean;
  isSearching: boolean;
  onInstalledSearch$: QRL<(value: string) => void>;
  onPackageSearch$: QRL<(value: string) => void>;
  onSearch$: QRL<() => void>;
  onRefresh$: QRL<() => void>;
}

export const DependencyToolbar = component$((props: DependencyToolbarProps) => {
  return (
    <div class="border-glass-border bg-card-item-bg rounded-xl border p-4">
      <div class="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
        <label class="flex min-w-0 flex-col gap-1.5">
          <span class="text-muted-foreground text-xs font-medium">Installed dependencies</span>
          <input
            value={props.installedSearch}
            onInput$={(_, target) => props.onInstalledSearch$(target.value)}
            class="border-border bg-background/60 text-foreground placeholder:text-muted-foreground rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
            placeholder="Search installed packages"
            type="search"
          />
        </label>

        <label class="flex min-w-0 flex-col gap-1.5">
          <span class="text-muted-foreground text-xs font-medium">Search npm</span>
          <div class="flex gap-2">
            <input
              value={props.packageSearch}
              onInput$={(_, target) => props.onPackageSearch$(target.value)}
              onKeyDown$={(event) => {
                if (event.key === 'Enter') {
                  props.onSearch$();
                }
              }}
              class="border-border bg-background/60 text-foreground placeholder:text-muted-foreground min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
              placeholder="Find new packages"
              type="search"
            />
            <button
              type="button"
              onClick$={props.onSearch$}
              disabled={props.isSearching}
              class="bg-primary/10 hover:bg-primary/20 text-primary rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {props.isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>
        </label>

        <div class="flex items-end">
          <button
            type="button"
            onClick$={props.onRefresh$}
            disabled={props.isRefreshing}
            class="border-border bg-foreground/5 hover:bg-foreground/10 rounded-lg border px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {props.isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>
    </div>
  );
});
