import { component$, type QRL } from '@qwik.dev/core';
import type { InstallDependencyType, PackageSearchResult } from '../../types';

interface SearchResultCardProps {
  result: PackageSearchResult;
  selectedType: InstallDependencyType;
  activeOperationKey: string;
  onTypeChange$: QRL<(packageName: string, dependencyType: InstallDependencyType) => void>;
  onInstall$: QRL<(packageName: string, dependencyType: InstallDependencyType) => void>;
}

export const SearchResultCard = component$((props: SearchResultCardProps) => {
  const isInstalling = props.activeOperationKey === `install:${props.result.name}`;

  return (
    <div class="border-glass-border bg-card-item-bg rounded-xl border p-4">
      <div class="flex flex-col gap-3">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <a
                href={props.result.npmUrl}
                target="_blank"
                class="text-foreground hover:text-primary truncate text-sm font-semibold"
              >
                {props.result.name}
              </a>
              <span class="bg-primary/10 text-primary rounded-md px-2 py-0.5 text-xs">
                v{props.result.latestVersion}
              </span>
              {props.result.isInstalled ? (
                <span class="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">
                  Installed {props.result.installedVersion}
                </span>
              ) : null}
            </div>
            <p class="text-muted-foreground mt-2 line-clamp-2 text-sm">
              {props.result.description || 'No description available'}
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3">
          <select
            value={props.selectedType}
            onChange$={(_, target) =>
              props.onTypeChange$(props.result.name, target.value as InstallDependencyType)
            }
            disabled={props.result.isInstalled || isInstalling}
            class="border-border bg-background/60 rounded-lg border px-2 py-1.5 text-xs"
          >
            <option value="devDependencies">devDependencies</option>
            <option value="dependencies">dependencies</option>
          </select>

          <button
            type="button"
            onClick$={() => props.onInstall$(props.result.name, props.selectedType)}
            disabled={props.result.isInstalled || isInstalling}
            class="bg-primary/10 hover:bg-primary/20 text-primary rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {props.result.isInstalled ? 'Installed' : isInstalling ? 'Installing...' : 'Install'}
          </button>
        </div>
      </div>
    </div>
  );
});
