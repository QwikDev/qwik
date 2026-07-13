import { component$ } from '@qwik.dev/core';
import { Tab } from '../components/Tab/Tab';
import { QwikThemeToggle } from '../components/ThemeToggle/QwikThemeToggle';
import { IconAdjustmentsHorizontal } from '../components/Icons/Icons';
import type { DevtoolsState } from './state';
import { getVisibleTabs } from './sidebar-tabs';

interface DevtoolsSidebarProps {
  state: DevtoolsState;
}

export const DevtoolsSidebar = component$<DevtoolsSidebarProps>(({ state }) => {
  return (
    <div class="glass-bg border-glass-border shadow-r flex h-full w-16 flex-col items-center justify-start gap-3 border-r p-3 md:w-20">
      {getVisibleTabs(state.visibleTabIds, state.isExtension).map((tab) => (
        <Tab key={tab.id} state={state} id={tab.id} title={tab.title}>
          {tab.renderIcon()}
        </Tab>
      ))}

      <div class="mt-auto flex flex-col items-center gap-2">
        {!state.isExtension && (
          <button
            class="text-muted-foreground hover:bg-foreground/5 hover:text-foreground flex h-11 w-11 items-center justify-center rounded-xl transition-all"
            title="Customize Tabs"
            aria-label="Customize Tabs"
            onClick$={() => (state.isCustomizeOpen = true)}
          >
            <IconAdjustmentsHorizontal class="h-6 w-6" />
          </button>
        )}
        <div class="mb-2 opacity-80 transition-opacity hover:opacity-100">
          <QwikThemeToggle />
        </div>
      </div>
    </div>
  );
});
