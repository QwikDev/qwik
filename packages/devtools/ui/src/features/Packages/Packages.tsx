import { component$ } from '@qwik.dev/core';
import { Package } from './types';
import { DependencyCard } from './components/DependencyCard';
import { State } from '../../types/state';

interface PackagesProps {
  state: State;
}

export const Packages = component$(({ state }: PackagesProps) => {
  const packages = state.allDependencies as Package[];
  const isLoading = state.isLoadingDependencies;

  if (isLoading) {
    return (
      <div class="flex items-center justify-center py-8">
        <div class="flex flex-col items-center gap-3">
          <div class="flex items-center gap-2">
            <div class="border-t-foreground/40 border-border h-5 w-5 animate-spin rounded-full border-2" />
            <span class="text-muted-foreground text-sm">
              Loading dependencies...
            </span>
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

  if (!packages || packages.length === 0) {
    return (
      <div class="py-8 text-center">
        <div class="text-muted-foreground text-sm">
          No dependencies found in package.json
        </div>
      </div>
    );
  }

  return (
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {packages.map((pkg) => (
        <DependencyCard key={pkg.name} pkg={pkg} />
      ))}
    </div>
  );
});
