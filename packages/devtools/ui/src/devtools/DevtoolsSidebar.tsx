import { $, component$, Slot, useSignal, type QRL } from '@qwik.dev/core';
import { Tab } from '../components/Tab/Tab';
import { QwikThemeToggle } from '../components/ThemeToggle/QwikThemeToggle';
import { IconAdjustmentsHorizontal, IconEllipsisHorizontal } from '../components/Icons/Icons';
import type { DevtoolsState } from './state';
import { getAvailableTabs, getVisibleTabs } from './sidebar-tabs';

/** A fixed bottom-action button matching the sidebar tab shell (Customize, More). */
const SidebarIconButton = component$<{
  title: string;
  active?: boolean;
  onClick$: QRL<() => void>;
}>(({ title, active, onClick$ }) => (
  <button
    class={[
      'flex h-11 w-11 items-center justify-center rounded-xl transition-all',
      active
        ? 'bg-primary/15 text-primary'
        : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
    ]}
    title={title}
    aria-label={title}
    onClick$={onClick$}
  >
    <Slot />
  </button>
));

interface DevtoolsSidebarProps {
  state: DevtoolsState;
}

export const DevtoolsSidebar = component$<DevtoolsSidebarProps>(({ state }) => {
  const isMoreOpen = useSignal(false);
  // Hidden tabs stay reachable here (registry order); empty when everything is visible.
  const moreTabs = getAvailableTabs(state.visibleTabIds);
  const isMoreActive = moreTabs.some((tab) => tab.id === state.activeTab);

  return (
    <div class="glass-bg border-glass-border shadow-r flex h-full w-16 flex-col items-center justify-start gap-3 border-r p-3 md:w-20">
      {getVisibleTabs(state.visibleTabIds, state.isExtension).map((tab) => (
        <Tab key={tab.id} state={state} id={tab.id} title={tab.title}>
          {tab.renderIcon()}
        </Tab>
      ))}

      <div class="mt-auto flex flex-col items-center gap-2">
        {moreTabs.length > 0 && (
          <div class="relative">
            <SidebarIconButton
              title="More tools"
              active={isMoreOpen.value || isMoreActive}
              onClick$={$(() => (isMoreOpen.value = !isMoreOpen.value))}
            >
              <IconEllipsisHorizontal class="h-6 w-6" />
            </SidebarIconButton>

            {isMoreOpen.value && (
              <>
                <div class="fixed inset-0 z-20" onClick$={() => (isMoreOpen.value = false)} />
                <div class="glass-panel absolute bottom-0 left-full z-30 ml-2 flex min-w-40 flex-col gap-1 rounded-xl p-2">
                  {moreTabs.map((tab) => {
                    const id = tab.id;
                    return (
                      <button
                        key={id}
                        class="text-muted-foreground hover:bg-card-item-hover-bg hover:text-foreground flex items-center gap-3 rounded-lg px-2 py-1.5 text-left"
                        onClick$={() => {
                          state.activeTab = id;
                          isMoreOpen.value = false;
                        }}
                      >
                        {tab.renderIcon()}
                        <span class="text-foreground text-sm">{tab.title}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {!state.isExtension && (
          <SidebarIconButton
            title="Customize Tabs"
            onClick$={$(() => (state.isCustomizeOpen = true))}
          >
            <IconAdjustmentsHorizontal class="h-6 w-6" />
          </SidebarIconButton>
        )}

        <div class="mb-2 opacity-80 transition-opacity hover:opacity-100">
          <QwikThemeToggle />
        </div>
      </div>
    </div>
  );
});
