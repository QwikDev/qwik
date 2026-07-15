import {
  $,
  component$,
  sync$,
  useComputed$,
  useSignal,
  useVisibleTask$,
  type QRL,
} from '@qwik.dev/core';
import { IconMagnifyingGlass } from '../components/Icons/Icons';
import { getTheme, setTheme } from '../components/ThemeToggle/QwikThemeToggle';
import type { DevtoolsState } from './state';
import {
  addRecentId,
  buildPaletteSources,
  filterResults,
  getActionResults,
  groupResults,
  loadRecentIds,
  resolveRecents,
  saveRecentIds,
  type PaletteActionId,
  type PaletteCategory,
  type PaletteResult,
} from './command-palette';

interface DisplayGroup {
  /** A source category, or the synthetic "Recent" group shown in the empty state. */
  category: PaletteCategory | 'Recent';
  results: PaletteResult[];
}

const CATEGORY_HINT: Record<string, string> = {
  Tabs: 'Tab',
  Components: 'Component',
  Routes: 'Route',
  Packages: 'Package',
  Actions: 'Action',
  Recent: 'Recent',
};

function cycleTheme() {
  const current = getTheme();
  setTheme(current === 'dark' ? 'light' : current === 'light' ? 'auto' : 'dark');
}

interface CommandPaletteProps {
  state: DevtoolsState;
}

/**
 * Cmd/Ctrl+K overlay to jump across tabs, components, routes, and packages, plus common actions.
 * The empty state lists recent selections and actions; results are keyboard-navigable.
 */
export const CommandPalette = component$<CommandPaletteProps>(({ state }) => {
  const query = useSignal('');
  // -1 means nothing is highlighted, so pressing Enter on the empty state does nothing.
  const activeIndex = useSignal(-1);
  const recentIds = useSignal<string[]>([]);
  const inputRef = useSignal<HTMLInputElement>();

  useVisibleTask$(() => {
    recentIds.value = loadRecentIds();
    inputRef.value?.focus();
  });

  // The searchable set only changes with the underlying state, not on each keystroke.
  const searchable = useComputed$(() => [
    ...buildPaletteSources(state),
    ...getActionResults(state),
  ]);

  const groups = useComputed$<DisplayGroup[]>(() => {
    if (!query.value.trim()) {
      const recents = resolveRecents(recentIds.value, state);
      const emptyGroups: DisplayGroup[] = [];
      if (recents.length > 0) {
        emptyGroups.push({ category: 'Recent', results: recents });
      }
      emptyGroups.push({ category: 'Actions', results: getActionResults(state) });
      return emptyGroups;
    }
    return groupResults(filterResults(searchable.value, query.value));
  });

  const flatResults = useComputed$(() => groups.value.flatMap((group) => group.results));

  // Keep the highlighted option in view as the selection moves.
  useVisibleTask$(({ track }) => {
    const index = track(() => activeIndex.value);
    document.getElementById(`palette-option-${index}`)?.scrollIntoView({ block: 'nearest' });
  });

  const runAction: QRL<(action: PaletteActionId) => void> = $((action) => {
    switch (action) {
      case 'toggleTheme':
        cycleTheme();
        break;
      case 'clearPerformance':
        // Open the tab so the clear is observed (and visible), then request it.
        state.activeTab = 'performance';
        state.clearPerformanceRequested = true;
        break;
      case 'customizeTabs':
        state.isCustomizeOpen = true;
        break;
      case 'clearRecents':
        recentIds.value = [];
        saveRecentIds([]);
        break;
    }
  });

  const activate = $((result: PaletteResult) => {
    const target = result.target;

    // Clearing recents keeps the palette open so the empty state is visible.
    if (target.kind === 'action' && target.action === 'clearRecents') {
      runAction('clearRecents');
      return;
    }

    // Navigating anywhere dismisses a lingering Customize overlay, unless we are opening it.
    if (!(target.kind === 'action' && target.action === 'customizeTabs')) {
      state.isCustomizeOpen = false;
    }

    const nextRecents = addRecentId(recentIds.value, result.id);
    recentIds.value = nextRecents;
    saveRecentIds(nextRecents);

    switch (target.kind) {
      case 'tab':
        state.activeTab = target.tabId;
        break;
      case 'route':
        state.activeTab = 'routes';
        break;
      case 'package':
        state.activeTab = 'packages';
        break;
      case 'component':
        state.activeTab = 'renderTree';
        state.componentReveal = target.name;
        break;
      case 'action':
        runAction(target.action);
        break;
    }
    state.isPaletteOpen = false;
  });

  // Running index across all groups, aligned with flatResults, for keyboard highlight.
  let optionIndex = 0;

  return (
    <div class="fixed inset-0 z-[9992] flex items-start justify-center p-4 pt-16">
      <div
        class="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick$={() => (state.isPaletteOpen = false)}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        class="glass-panel relative z-10 flex max-h-full w-[32rem] max-w-full flex-col overflow-hidden rounded-2xl"
        onKeyDown$={[
          // Stop the browser acting on navigation keys before the async handler runs.
          sync$((event: KeyboardEvent) => {
            if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(event.key)) {
              event.preventDefault();
            }
          }),
          $((event: KeyboardEvent) => {
            const count = flatResults.value.length;
            if (event.key === 'ArrowDown') {
              activeIndex.value =
                count === 0 ? -1 : activeIndex.value < 0 ? 0 : (activeIndex.value + 1) % count;
            } else if (event.key === 'ArrowUp') {
              activeIndex.value =
                count === 0
                  ? -1
                  : activeIndex.value < 0
                    ? count - 1
                    : (activeIndex.value - 1 + count) % count;
            } else if (event.key === 'Enter') {
              const result = activeIndex.value >= 0 ? flatResults.value[activeIndex.value] : null;
              if (result) {
                activate(result);
              }
            } else if (event.key === 'Escape') {
              state.isPaletteOpen = false;
            } else if (event.key === 'Tab') {
              // Focus trap: the input is the only focusable element, so keep focus on it.
              inputRef.value?.focus();
            }
          }),
        ]}
      >
        <div class="border-glass-border flex items-center gap-3 border-b px-4 py-3">
          <span class="text-muted-foreground">
            <IconMagnifyingGlass class="h-5 w-5" />
          </span>
          <input
            ref={inputRef}
            type="text"
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-listbox"
            aria-activedescendant={
              activeIndex.value >= 0 ? `palette-option-${activeIndex.value}` : undefined
            }
            placeholder="Search tabs, components, routes, packages..."
            class="text-foreground placeholder:text-muted-foreground/70 w-full bg-transparent text-sm outline-none"
            value={query.value}
            onInput$={(_, el) => {
              query.value = el.value;
              // Highlight the top match while typing, but nothing on an empty query.
              activeIndex.value = el.value.trim() ? 0 : -1;
            }}
          />
        </div>

        <ul
          id="palette-listbox"
          role="listbox"
          aria-label="Results"
          class="custom-scrollbar max-h-80 overflow-y-auto p-2"
        >
          {flatResults.value.length === 0 ? (
            <li class="text-muted-foreground px-2 py-6 text-center text-sm">No results</li>
          ) : (
            groups.value.map((group) => (
              <li key={group.category} role="presentation">
                <div class="text-muted-foreground px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide">
                  {group.category}
                </div>
                <ul role="presentation">
                  {group.results.map((result) => {
                    const index = optionIndex++;
                    const isActive = index === activeIndex.value;
                    return (
                      <li
                        key={result.id}
                        id={`palette-option-${index}`}
                        role="option"
                        aria-selected={isActive ? 'true' : 'false'}
                        class={[
                          'flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5',
                          isActive ? 'bg-primary/15 text-primary' : 'hover:bg-card-item-hover-bg',
                        ]}
                        onMouseEnter$={() => (activeIndex.value = index)}
                        onClick$={() => activate(result)}
                      >
                        <span class="text-foreground truncate text-sm">{result.label}</span>
                        <span class="text-muted-foreground shrink-0 truncate text-xs">
                          {result.hint ?? CATEGORY_HINT[group.category]}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))
          )}
        </ul>

        <div class="border-glass-border text-muted-foreground flex gap-4 border-t px-4 py-2 text-xs">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
});
