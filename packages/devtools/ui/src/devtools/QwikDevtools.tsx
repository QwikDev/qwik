import { component$, useStore, useVisibleTask$ } from '@qwik.dev/core';
import { DevtoolsButton } from '../components/DevtoolsButton/DevtoolsButton';
import { DevtoolsContainer } from '../components/DevtoolsContainer/DevtoolsContainer';
import { DevtoolsPanel } from '../components/DevtoolsPanel/DevtoolsPanel';
import { ThemeScript as QwikThemeScript } from '../components/ThemeToggle/theme-script';
import '../global.css';
import { DevtoolsContent } from './DevtoolsContent';
import { loadDevtoolsData } from './rpc';
import { createDevtoolsState, type DevtoolsState } from './state';
import { DevtoolsSidebar } from './DevtoolsSidebar';
import { ensurePreloadRuntime } from '../runtime/preloads';

export const QwikDevtools = component$(() => {
  const state = useStore<DevtoolsState>(createDevtoolsState());

  useVisibleTask$(async () => {
    if (!window.__QWIK_DEVTOOLS_DATA_PROVIDER__) {
      ensurePreloadRuntime();
    }
    await loadDevtoolsData(state);
  });

  return (
    <>
      <QwikThemeScript />
      <DevtoolsContainer>
        <DevtoolsButton state={state} />

        {state.isOpen && (
          <DevtoolsPanel state={state}>
            <DevtoolsSidebar state={state} />
            <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
              <DevtoolsContent state={state} />
            </div>
          </DevtoolsPanel>
        )}
      </DevtoolsContainer>
    </>
  );
});
