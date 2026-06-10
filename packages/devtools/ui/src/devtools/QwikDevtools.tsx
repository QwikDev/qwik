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

      if (!getQwikDevtoolsGlobal(window)?.[QWIK_DEVTOOLS_GLOBAL.props.dataProvider]) {
        ensurePreloadRuntime();
      }
      await loadDevtoolsData(state);
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
            <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
              <DevtoolsContent state={state} />
            </div>
          </DevtoolsPanel>
        )}
      </DevtoolsContainer>
    </div>
  );
});
