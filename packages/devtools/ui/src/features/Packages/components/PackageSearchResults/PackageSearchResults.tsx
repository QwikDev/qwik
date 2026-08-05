import { component$, type QRL } from '@qwik.dev/core';
import type { InstallDependencyType, PackageSearchResult } from '../../types';
import { SearchResultCard } from '../SearchResultCard';

interface PackageSearchResultsProps {
  query: string;
  results: PackageSearchResult[];
  error: string;
  isSearching: boolean;
  activeOperationKey: string;
  selectedTypes: Record<string, InstallDependencyType>;
  onRetrySearch$: QRL<() => void>;
  onTypeChange$: QRL<(packageName: string, dependencyType: InstallDependencyType) => void>;
  onInstall$: QRL<(packageName: string, dependencyType: InstallDependencyType) => void>;
}

export const PackageSearchResults = component$((props: PackageSearchResultsProps) => {
  if (!props.query.trim()) {
    return null;
  }

  if (props.isSearching) {
    return (
      <div class="border-glass-border bg-card-item-bg text-muted-foreground rounded-xl border p-4 text-sm">
        Searching packages...
      </div>
    );
  }

  if (props.error) {
    return (
      <div class="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
        <div>{props.error}</div>
        <button
          type="button"
          onClick$={props.onRetrySearch$}
          class="mt-3 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium hover:bg-red-500/20"
        >
          Retry
        </button>
      </div>
    );
  }

  if (props.results.length === 0) {
    return (
      <div class="border-glass-border bg-card-item-bg text-muted-foreground rounded-xl border p-4 text-sm">
        No external packages found for "{props.query}".
      </div>
    );
  }

  return (
    <div class="flex flex-col gap-3">
      {props.results.map((result) => (
        <SearchResultCard
          key={result.name}
          result={result}
          selectedType={props.selectedTypes[result.name] || 'devDependencies'}
          activeOperationKey={props.activeOperationKey}
          onTypeChange$={props.onTypeChange$}
          onInstall$={props.onInstall$}
        />
      ))}
    </div>
  );
});
