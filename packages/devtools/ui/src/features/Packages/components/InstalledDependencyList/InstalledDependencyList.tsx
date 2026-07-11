import { component$, type QRL } from '@qwik.dev/core';
import type { DependencyInfo } from '../../types';
import { DependencyCard } from '../DependencyCard';

interface InstalledDependencyListProps {
  dependencies: DependencyInfo[];
  filteredDependencies: DependencyInfo[];
  isLoading: boolean;
  searchKeyword: string;
  activeOperationKey: string;
  onUpdate$: QRL<(packageName: string) => void>;
}

export const InstalledDependencyList = component$((props: InstalledDependencyListProps) => {
  if (props.isLoading) {
    return (
      <div class="flex items-center justify-center py-8">
        <div class="flex flex-col items-center gap-3">
          <div class="flex items-center gap-2">
            <div class="border-t-foreground/40 border-border h-5 w-5 animate-spin rounded-full border-2" />
            <span class="text-muted-foreground text-sm">Loading dependencies...</span>
          </div>
          <div class="text-muted-foreground text-center text-xs">
            Dependencies are being preloaded in the background...
            <br />
            This should only take a moment
          </div>
        </div>
      </div>
    );
  }

  if (props.dependencies.length === 0) {
    return (
      <div class="py-8 text-center">
        <div class="text-muted-foreground text-sm">No dependencies found in package.json</div>
      </div>
    );
  }

  if (props.filteredDependencies.length === 0) {
    return (
      <div class="py-8 text-center">
        <div class="text-muted-foreground text-sm">
          No installed dependencies match "{props.searchKeyword}"
        </div>
      </div>
    );
  }

  return (
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {props.filteredDependencies.map((pkg) => (
        <DependencyCard
          key={pkg.name}
          pkg={pkg}
          activeOperationKey={props.activeOperationKey}
          onUpdate$={props.onUpdate$}
        />
      ))}
    </div>
  );
});
