import { component$, useSignal, useStore, useVisibleTask$ } from '@qwik.dev/core';
import { getQwikDevtoolsGlobal, QWIK_DEVTOOLS_GLOBAL } from '@qwik.dev/devtools/kit';
import { DevtoolsButton } from '../components/DevtoolsButton/DevtoolsButton';
import { DevtoolsContainer } from '../components/DevtoolsContainer/DevtoolsContainer';
import { DevtoolsPanel } from '../components/DevtoolsPanel/DevtoolsPanel';
import { ThemeScript as QwikThemeScript } from '../components/ThemeToggle/theme-script';
import '../global.css';
import { DevtoolsContent } from './DevtoolsContent';
import { loadDevtoolsData } from './rpc';
import { createDevtoolsState, type DevtoolsState } from './state';
import { DevtoolsSidebar } from './DevtoolsSidebar';
import { CustomizeTabsPanel } from './CustomizeTabsPanel';
import { CommandPalette } from './CommandPalette';
import { loadVisibleTabIds } from './sidebar-tabs';
import { ensurePreloadRuntime } from '../runtime/preloads';
import { isExcludedPathname, normalizeExcludePathnames } from '../../../kit/src/overlay-paths';

interface QwikDevtoolsProps {
  excludePathnames?: string[];
}

export const QwikDevtools = component$<QwikDevtoolsProps>((props) => {
  const state = useStore<DevtoolsState>(createDevtoolsState());
  const excludePathnames = normalizeExcludePathnames(props.excludePathnames);
  const shouldRender = useSignal(excludePathnames.length === 0);

  useVisibleTask$(
    async () => {
      if (isExcludedPathname(location.pathname, excludePathnames)) {
        shouldRender.value = false;
        return;
      }

      shouldRender.value = true;

      // Restore the customized sidebar order/visibility (Vite overlay only).
      if (!state.isExtension) {
        const storedVisibleTabIds = loadVisibleTabIds();
        if (storedVisibleTabIds) {
          state.visibleTabIds = storedVisibleTabIds;
        }
      }

      if (!getQwikDevtoolsGlobal(window)?.[QWIK_DEVTOOLS_GLOBAL.props.dataProvider]) {
        ensurePreloadRuntime();
      }
      await loadDevtoolsData(state);
    },
    { strategy: 'document-ready' }
  );

  // Cmd/Ctrl+K toggles the palette, but only while the devtools panel is open. Uses document-ready
  // (not the default intersection strategy) because the root has no layout size to observe.
  useVisibleTask$(
    ({ cleanup }) => {
      const handleShortcut = (event: KeyboardEvent) => {
        if ((event.metaKey || event.ctrlKey) && (event.key === 'k' || event.key === 'K')) {
          if (!state.isOpen) {
            return;
          }
          event.preventDefault();
          state.isPaletteOpen = !state.isPaletteOpen;
        }
      };
      window.addEventListener('keydown', handleShortcut);
      cleanup(() => window.removeEventListener('keydown', handleShortcut));
    },
    { strategy: 'document-ready' }
  );

  if (!shouldRender.value) {
    return <span style={{ display: 'contents' }} />;
  }

  return (
    <div class="qwik-devtools">
      <QwikThemeScript />
      <DevtoolsContainer>
        <DevtoolsButton state={state} />

        {state.isOpen && (
          <DevtoolsPanel state={state}>
            <DevtoolsSidebar state={state} />
            <div class="relative min-h-0 flex-1">
              <div class="custom-scrollbar h-full overflow-y-auto p-4">
                <DevtoolsContent state={state} />
              </div>
              {!state.isExtension && state.isCustomizeOpen && <CustomizeTabsPanel state={state} />}
              {state.isPaletteOpen && <CommandPalette state={state} />}
            </div>
          </DevtoolsPanel>
        )}
      </DevtoolsContainer>
    </div>
  );
});
