import { component$ } from '@qwik.dev/core';
import { Tab } from '../components/Tab/Tab';
import { QwikThemeToggle } from '../components/ThemeToggle/QwikThemeToggle';
import type { DevtoolsState } from './state';
import { devtoolsTabs } from './tabs';

interface DevtoolsSidebarProps {
  state: DevtoolsState;
}

export const DevtoolsSidebar = component$<DevtoolsSidebarProps>(({ state }) => {
  return (
    <div class="glass-bg border-glass-border shadow-r flex h-full w-16 flex-col items-center justify-start gap-3 border-r p-3 md:w-20">
      {devtoolsTabs
        .filter((tab) => !(state.isExtension && tab.viteOnly))
        .map((tab) => (
          <Tab key={tab.id} state={state} id={tab.id} title={tab.title}>
            {tab.renderIcon()}
          </Tab>
        ))}

      <div class="mt-auto mb-2 opacity-80 transition-opacity hover:opacity-100">
        <QwikThemeToggle />
      </div>
    </div>
  );
});
