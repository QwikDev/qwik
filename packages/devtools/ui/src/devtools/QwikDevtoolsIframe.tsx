import { component$, useSignal, useStore, useVisibleTask$ } from '@qwik.dev/core';
import { getTheme, setTheme } from '../components/ThemeToggle/QwikThemeToggle';
import '../global.css';
import { CommandPalette } from './CommandPalette';
import { CustomizeTabsPanel } from './CustomizeTabsPanel';
import { DevtoolsContent } from './DevtoolsContent';
import { DevtoolsSidebar } from './DevtoolsSidebar';
import { findHostQwikWindow } from './page-data-source';
import { loadDevtoolsData } from './rpc';
import { loadVisibleTabIds } from './sidebar-tabs';
import { createDevtoolsState, type DevtoolsState } from './state';

export const QwikDevtoolsIframe = component$(() => {
  const state = useStore<DevtoolsState>(createDevtoolsState({ runtimeMode: 'vite-iframe' }));
  const connected = useSignal(false);
  const connectionVersion = useSignal(0);
  const rpcError = useSignal('');

  useVisibleTask$(({ cleanup }) => {
    const storedVisibleTabIds = loadVisibleTabIds();
    if (storedVisibleTabIds) {
      state.visibleTabIds = storedVisibleTabIds;
    }
    setTheme(getTheme());
    void loadDevtoolsData(state).catch((error: unknown) => {
      console.error('[Qwik DevTools] Failed to connect to the Vite server:', error);
      rpcError.value = 'Unable to connect to the Vite server.';
    });

    let previousDocument: Document | undefined;
    const updateConnection = () => {
      const target = findHostQwikWindow(window);
      const nextDocument = target?.document;
      if (nextDocument !== previousDocument) {
        previousDocument = nextDocument;
        connectionVersion.value++;
      }
      connected.value = !!target;
      state.pagePathname = target?.location.pathname ?? null;
    };
    updateConnection();
    const timer = window.setInterval(updateConnection, 500);
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        state.isPaletteOpen = !state.isPaletteOpen;
      }
    };
    window.addEventListener('keydown', handleShortcut);
    cleanup(() => {
      window.clearInterval(timer);
      window.removeEventListener('keydown', handleShortcut);
    });
  });

  return (
    <div class="qwik-devtools" style="position: absolute; inset: 0;">
      <div class="bg-background text-foreground flex h-full w-full overflow-hidden">
        <DevtoolsSidebar state={state} />
        <div class="relative min-h-0 min-w-0 flex-1">
          <div class="custom-scrollbar h-full overflow-y-auto p-4">
            {!connected.value && <div role="status">Not connected to an application page.</div>}
            {rpcError.value && <div role="alert">{rpcError.value}</div>}
            <DevtoolsContent key={connectionVersion.value} state={state} />
          </div>
          {state.isCustomizeOpen && <CustomizeTabsPanel state={state} />}
          {state.isPaletteOpen && <CommandPalette state={state} />}
        </div>
      </div>
    </div>
  );
});
