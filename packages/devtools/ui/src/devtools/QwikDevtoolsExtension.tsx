import { component$, useStore, useVisibleTask$ } from '@qwik.dev/core';
import '../global.css';
import { DevtoolsContent } from './DevtoolsContent';
import { loadDevtoolsData } from './rpc';
import { createDevtoolsState, type DevtoolsState } from './state';
import { DevtoolsSidebar } from './DevtoolsSidebar';

/**
 * Extension-only devtools layout.
 *
 * Renders the sidebar and content directly without the overlay chrome
 * (floating button, draggable panel, backdrop). Mounted inside the
 * browser extension DevTools panel via {@link entry.extension.tsx}.
 *
 * The outer `.qwik-devtools` wrapper is required because the Tailwind
 * utilities are scoped under `.qwik-devtools .{class}` in the CSS build.
 * It must be a separate element so descendant selectors match.
 */
export const QwikDevtoolsExtension = component$(() => {
  const state = useStore<DevtoolsState>(
    createDevtoolsState({ isExtension: true }),
  );

  useVisibleTask$(async () => {
    await loadDevtoolsData(state);
  });

  return (
    <div class="qwik-devtools" style="position: absolute; inset: 0;">
      <div class="flex overflow-hidden" style="height: 100%; width: 100%;">
        <DevtoolsSidebar state={state} />
        <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
          <DevtoolsContent state={state} />
        </div>
      </div>
    </div>
  );
});
