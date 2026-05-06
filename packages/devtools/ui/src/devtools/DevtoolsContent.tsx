import { component$ } from '@qwik.dev/core';
import type { AssetInfo } from '@qwik.dev/devtools/kit';
import { IconMonitor } from '../components/Icons/Icons';
import { TabContent } from '../components/TabContent/TabContent';
import { TabTitle } from '../components/TabTitle/TabTitle';
import { Assets } from '../features/Assets/Assets';
import { BuildAnalysis } from '../features/BuildAnalysis/BuildAnalysis';
import { CodeBreak } from '../features/CodeBreak/CodeBreak';
import { HookTree } from '../features/HookTree/HookTree';
import { Inspect } from '../features/Inspect/Inspect';
import { Overview } from '../features/Overview/Overview';
import { Packages } from '../features/Packages/Packages';
import { Performance } from '../features/Performance/Performance';
import { Preloads } from '../features/Preloads/Preloads';
import { RenderTree } from '../features/RenderTree/RenderTree';
import { Routes } from '../features/Routes/Routes';
import type { DevtoolsState } from './state';

interface DevtoolsContentProps {
  state: DevtoolsState;
}

function formatAssetSummary(assets: AssetInfo[]) {
  const totalSizeInKb = assets.reduce((totalSize, asset) => totalSize + asset.size, 0) / 1024;

  return {
    count: assets.length,
    totalSizeInKb: totalSizeInKb.toFixed(2),
  };
}

const ViteOnlyPlaceholder = component$<{ feature: string }>(({ feature }) => {
  return (
    <div class="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
      <div class="text-muted-foreground/40 text-4xl">
        <IconMonitor class="h-12 w-12" />
      </div>
      <div class="text-muted-foreground text-sm">
        <span class="font-semibold">{feature}</span> is only available in the in-app overlay.
      </div>
      <div class="text-muted-foreground/50 max-w-xs text-xs leading-relaxed">
        This feature requires direct access to the Vite dev server. Add{' '}
        <code class="bg-card-item-bg text-foreground/70 rounded px-1.5 py-0.5">qwikDevtools()</code>{' '}
        to your Vite config to use it in the overlay during development.
      </div>
    </div>
  );
});

export const DevtoolsContent = component$<DevtoolsContentProps>(({ state }) => {
  const isExtensionMode = state.isExtension;
  const assetSummary = formatAssetSummary(state.assets);

  switch (state.activeTab) {
    case 'overview':
      return (
        <TabContent>
          <div class="flex items-center gap-3" q:slot="title">
            <img
              width={32}
              height={32}
              src="https://qwik.dev/logos/qwik-logo.svg"
              alt="Qwik Logo"
              class="h-8 w-8"
            />
            <h1 class="text-2xl font-semibold">Qwik DevTools</h1>
          </div>
          <Overview state={state} q:slot="content" />
        </TabContent>
      );
    case 'assets':
      return (
        <TabContent>
          <TabTitle title="Public Assets" q:slot="title" />
          {isExtensionMode ? (
            <ViteOnlyPlaceholder feature="Assets" q:slot="content" />
          ) : (
            <>
              <div class="text-muted-foreground flex gap-4 text-sm">
                <span>Total Size: {assetSummary.totalSizeInKb} KB</span>
                <span>Count: {assetSummary.count}</span>
              </div>
              <Assets state={state} q:slot="content" />
            </>
          )}
        </TabContent>
      );
    case 'packages':
      return (
        <TabContent>
          <TabTitle title="Project Dependencies" q:slot="title" />
          {isExtensionMode ? (
            <ViteOnlyPlaceholder feature="Packages" q:slot="content" />
          ) : (
            <Packages state={state} q:slot="content" />
          )}
        </TabContent>
      );
    case 'routes':
      return (
        <TabContent>
          <TabTitle title="Application Routes" q:slot="title" />
          {isExtensionMode ? (
            <ViteOnlyPlaceholder feature="Routes" q:slot="content" />
          ) : (
            <Routes state={state} q:slot="content" />
          )}
        </TabContent>
      );
    case 'inspect':
      return (
        <TabContent>
          {isExtensionMode ? (
            <ViteOnlyPlaceholder feature="Inspect" q:slot="content" />
          ) : (
            <Inspect q:slot="content" />
          )}
        </TabContent>
      );
    case 'renderTree':
      return (
        <TabContent>
          <TabTitle title={isExtensionMode ? 'Component Tree' : 'Render Tree'} q:slot="title" />
          {isExtensionMode ? <HookTree q:slot="content" /> : <RenderTree q:slot="content" />}
        </TabContent>
      );
    case 'codeBreak':
      return (
        <TabContent>
          <TabTitle title="Code Break" q:slot="title" />
          <CodeBreak q:slot="content" />
        </TabContent>
      );
    case 'performance':
      return (
        <TabContent>
          <TabTitle title="Performance" q:slot="title" />
          <Performance q:slot="content" />
        </TabContent>
      );
    case 'preloads':
      return (
        <TabContent>
          <TabTitle title="Preloads" q:slot="title" />
          <Preloads q:slot="content" />
        </TabContent>
      );
    case 'buildAnalysis':
      return (
        <TabContent>
          <TabTitle title="Build Analysis" q:slot="title" />
          {isExtensionMode ? (
            <ViteOnlyPlaceholder feature="Build Analysis" q:slot="content" />
          ) : (
            <BuildAnalysis q:slot="content" />
          )}
        </TabContent>
      );
    default:
      return null;
  }
});
