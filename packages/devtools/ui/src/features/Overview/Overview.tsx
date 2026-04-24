import { $, component$, sync$ } from '@qwik.dev/core';
import { IconCubeOutline, IconFolderTree, IconPhotoOutline } from '../../components/Icons/Icons';
import { InfoBanner } from '../../components/InfoBanner/InfoBanner';
import { State, TabName } from '../../types/state';

interface OverviewProps {
  state: State;
}

export const Overview = component$(({ state }: OverviewProps) => {
  const isExtension = state.isExtension;
  const pageJump = $((pageName: TabName) => {
    state.activeTab = pageName;
  });
  const stopPropagation = sync$((e: MouseEvent) => {
    e.preventDefault();
  });
  return (
    <>
      {isExtension && state.vitePluginDetected && (
        <InfoBanner class="mb-5">
          <span class="text-foreground font-medium">Vite plugin detected</span>
          <span class="text-muted-foreground">
            {' '}
            - the in-app overlay has additional features (routes, assets, packages, code inspection)
          </span>
        </InfoBanner>
      )}

      <div class="grid grid-cols-1 gap-5 md:grid-cols-3">
        {!isExtension && (
          <div
            onClick$={[$(() => pageJump('routes')), stopPropagation]}
            class="border-border bg-card-item-bg hover:bg-card-item-hover-bg flex cursor-pointer items-center gap-5 rounded-xl border p-5 transition-all duration-200 hover:-translate-y-0.5"
          >
            <div class="bg-foreground/5 border-border rounded-lg border p-3.5">
              <IconFolderTree class="text-accent h-6 w-6" />
            </div>
            <div>
              <div class="text-3xl font-semibold">{state.routes?.length}</div>
              <div class="text-muted-foreground text-sm">pages</div>
            </div>
          </div>
        )}

        <div
          onClick$={[$(() => pageJump('renderTree')), stopPropagation]}
          class="border-border bg-card-item-bg hover:bg-card-item-hover-bg flex cursor-pointer items-center gap-5 rounded-xl border p-5 transition-all duration-200 hover:-translate-y-0.5"
        >
          <div class="bg-foreground/5 border-border rounded-lg border p-3.5">
            <IconCubeOutline class="text-accent h-6 w-6" />
          </div>
          <div>
            <div class="text-3xl font-semibold">{state.components.length}</div>
            <div class="text-muted-foreground text-sm">components</div>
          </div>
        </div>

        {!isExtension && (
          <div
            onClick$={[$(() => pageJump('assets')), stopPropagation]}
            class="border-border bg-card-item-bg hover:bg-card-item-hover-bg flex cursor-pointer items-center gap-5 rounded-xl border p-5 transition-all duration-200 hover:-translate-y-0.5"
          >
            <div class="bg-foreground/5 border-border rounded-lg border p-3.5">
              <IconPhotoOutline class="text-accent h-6 w-6" />
            </div>
            <div>
              <div class="text-3xl font-semibold">{state.assets.length || 0}</div>
              <div class="text-muted-foreground text-sm">assets</div>
            </div>
          </div>
        )}
      </div>

      {state.npmPackages.length > 0 && (
        <div
          onClick$={isExtension ? undefined : [$(() => pageJump('packages')), stopPropagation]}
          class={[
            'border-border bg-card-item-bg mt-6 space-y-4 rounded-xl border p-5 md:mt-6',
            !isExtension && 'hover:bg-card-item-hover-bg cursor-pointer hover:-translate-y-0.5',
          ]}
        >
          <h3 class="text-lg font-semibold">Installed Packages</h3>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            {state.npmPackages.map(([name, version]) => (
              <div
                key={name}
                class="bg-foreground/5 flex items-center justify-between rounded-lg p-3"
              >
                <div class="text-sm">{name}</div>
                <div class="bg-foreground/5 border-border text-muted-foreground rounded-full border px-2 py-1 text-xs">
                  {version}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div class="border-border bg-card-item-bg mt-6 space-y-4 rounded-xl border p-5 md:mt-6">
        <h3 class="text-lg font-semibold">Performance</h3>
        <div class="space-y-3">
          <div class="border-border flex justify-between border-b py-2">
            <span class="text-muted-foreground">SSR to full load</span>
            <span class="font-medium">-</span>
          </div>
          <div class="border-border flex justify-between border-b py-2">
            <span class="text-muted-foreground">Page load</span>
            <span class="font-medium">-</span>
          </div>
          <div class="flex justify-between py-2">
            <span class="text-muted-foreground">Navigation</span>
            <span class="font-medium">-</span>
          </div>
        </div>
      </div>
    </>
  );
});
