import { $, component$, Slot, useSignal, type QRL } from '@qwik.dev/core';
import { IconXMark } from '../components/Icons/Icons';
import { IconButton } from '../components/IconButton/IconButton';
import type { DevtoolsState, DevtoolsTabId } from './state';
import { getAvailableTabIds, resolveTabs, saveVisibleTabIds, setTabVisible } from './sidebar-tabs';

interface TabRowProps {
  id: DevtoolsTabId;
  title: string;
  checked: boolean;
  onToggle$: QRL<(id: DevtoolsTabId, checked: boolean) => void>;
}

/** One selectable tab. The icon is passed as children so no non-serializable config crosses props. */
const TabRow = component$<TabRowProps>(({ id, title, checked, onToggle$ }) => (
  <li>
    <label class="hover:bg-card-item-hover-bg flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5">
      <input
        type="checkbox"
        class="h-3.5 w-3.5 rounded"
        style={{ accentColor: 'var(--color-primary-active)' }}
        checked={checked}
        onChange$={(_, el) => onToggle$(id, el.checked)}
      />
      <span class="text-muted-foreground">
        <Slot />
      </span>
      <span class="text-foreground text-sm">{title}</span>
    </label>
  </li>
));

interface CustomizeTabsPanelProps {
  state: DevtoolsState;
}

/**
 * Overlay for choosing which tools appear in the sidebar. Edits stay pending until "Apply", so
 * closing or cancelling discards them. Relies on remounting when reopened to reset the pending
 * list.
 */
export const CustomizeTabsPanel = component$<CustomizeTabsPanelProps>(({ state }) => {
  const pendingVisibleIds = useSignal<DevtoolsTabId[]>([...state.visibleTabIds]);

  const visibleTabs = resolveTabs(pendingVisibleIds.value);
  const availableTabs = resolveTabs(getAvailableTabIds(pendingVisibleIds.value));

  const toggle$ = $((id: DevtoolsTabId, checked: boolean) => {
    pendingVisibleIds.value = setTabVisible(pendingVisibleIds.value, id, checked);
  });

  return (
    <div class="absolute inset-0 z-30 flex items-start justify-start p-4">
      <div
        class="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick$={() => (state.isCustomizeOpen = false)}
      />

      <div class="glass-bg border-glass-border relative z-10 flex max-h-full w-80 flex-col overflow-hidden rounded-2xl border shadow-xl">
        <div class="flex items-start justify-between p-4 pb-3">
          <div>
            <h2 class="text-foreground text-base font-semibold">Customize Tabs</h2>
            <p class="text-muted-foreground text-xs">Choose which tools appear in the sidebar.</p>
          </div>
          <IconButton title="Close" onClick$={() => (state.isCustomizeOpen = false)}>
            <IconXMark class="h-5 w-5" />
          </IconButton>
        </div>

        <div class="custom-scrollbar flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-3">
          <section>
            <h3 class="text-foreground text-sm font-medium">Visible in Sidebar</h3>
            <ul class="mt-2 flex flex-col gap-1">
              {visibleTabs.map((tab) => (
                <TabRow key={tab.id} id={tab.id} title={tab.title} checked onToggle$={toggle$}>
                  {tab.renderIcon()}
                </TabRow>
              ))}
            </ul>
          </section>

          <section>
            <h3 class="text-foreground text-sm font-medium">Available in More Panel</h3>
            <p class="text-muted-foreground text-xs">
              Add tools to access them from the More panel.
            </p>
            <ul class="mt-2 flex flex-col gap-1">
              {availableTabs.map((tab) => (
                <TabRow
                  key={tab.id}
                  id={tab.id}
                  title={tab.title}
                  checked={false}
                  onToggle$={toggle$}
                >
                  {tab.renderIcon()}
                </TabRow>
              ))}
            </ul>
          </section>
        </div>

        <div class="border-glass-border flex justify-end gap-2 border-t p-4">
          <button
            class="text-muted-foreground hover:text-foreground rounded-lg px-4 py-1.5 text-sm font-medium transition-colors"
            onClick$={() => (state.isCustomizeOpen = false)}
          >
            Cancel
          </button>
          <button
            class="bg-primary rounded-lg px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            onClick$={() => {
              state.visibleTabIds = [...pendingVisibleIds.value];
              saveVisibleTabIds(pendingVisibleIds.value);
              state.isCustomizeOpen = false;
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
});
