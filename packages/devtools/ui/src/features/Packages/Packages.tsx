import { $, component$, useComputed$, useSignal, useStore, useVisibleTask$ } from '@qwik.dev/core';
import type { InstallDependencyType, PackageSearchResult } from './types';
import type { State } from '../../types/state';
import { getDevtoolsRpc } from '../../devtools/rpc';
import {
  DependencyOperationFeedback,
  type OperationFeedback,
} from './components/DependencyOperationFeedback';
import { DependencyToolbar } from './components/DependencyToolbar';
import { InstalledDependencyList } from './components/InstalledDependencyList';
import { PackageSearchResults } from './components/PackageSearchResults';
import {
  filterInstalledDependencies,
  getOperationMessage,
  markInstalledSearchResults,
  mergeDependencyRefresh,
} from './package-utils';

interface PackagesProps {
  state: State;
}

export const Packages = component$(({ state }: PackagesProps) => {
  const installedSearch = useSignal('');
  const packageSearch = useSignal('');
  const isSearching = useSignal(false);
  const isRefreshing = useSignal(false);
  const searchError = useSignal('');
  const searchResults = useSignal<PackageSearchResult[]>([]);
  const activeOperationKey = useSignal('');
  const feedback = useSignal<OperationFeedback | null>(null);
  const selectedTypes = useStore<Record<string, InstallDependencyType>>({});
  const lastRetry = useSignal<{
    action: 'install' | 'update' | 'search';
    packageName?: string;
    dependencyType?: InstallDependencyType;
  } | null>(null);

  const packages = useComputed$(() => state.allDependencies);
  const filteredPackages = useComputed$(() =>
    filterInstalledDependencies(packages.value, installedSearch.value)
  );

  const applyDependencies = $((dependencies: typeof state.allDependencies) => {
    state.allDependencies = mergeDependencyRefresh(state.allDependencies, dependencies);
    searchResults.value = markInstalledSearchResults(searchResults.value, state.allDependencies);
  });

  const followDependencyEnrichment = $(async () => {
    const rpc = await getDevtoolsRpc();
    for (let i = 0; i < 20; i++) {
      const status = await rpc.getDependenciesStatus();
      if (status.phase === 'phase2' || status.phase === 'done') {
        await applyDependencies(await rpc.getAllDependencies());
      }
      if (status.phase === 'done' || status.phase === 'error') {
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }
  });

  const refreshDependencies = $(async () => {
    isRefreshing.value = true;
    try {
      const rpc = await getDevtoolsRpc();
      await applyDependencies(await rpc.refreshDependencies());
      void followDependencyEnrichment();
    } finally {
      isRefreshing.value = false;
    }
  });

  const runPackageSearch = $(async () => {
    const query = packageSearch.value.trim();
    searchError.value = '';
    lastRetry.value = { action: 'search' };

    if (!query) {
      searchResults.value = [];
      return;
    }

    isSearching.value = true;
    try {
      const rpc = await getDevtoolsRpc();
      const response = await rpc.searchPackages(query);
      searchResults.value = markInstalledSearchResults(response.results, state.allDependencies);
      searchError.value = response.error || '';
    } catch (error) {
      searchResults.value = [];
      searchError.value = error instanceof Error ? error.message : 'Package search failed';
    } finally {
      isSearching.value = false;
    }
  });

  const installPackage = $(async (packageName: string, dependencyType: InstallDependencyType) => {
    activeOperationKey.value = `install:${packageName}`;
    lastRetry.value = { action: 'install', packageName, dependencyType };
    feedback.value = null;

    try {
      const rpc = await getDevtoolsRpc();
      const result = await rpc.installPackage(packageName, dependencyType);
      if (!result.success) {
        feedback.value = {
          type: 'error',
          message: getOperationMessage('install', packageName, false, result.error),
          retryAction: 'install',
          packageName,
        };
        return;
      }

      await applyDependencies(await rpc.getAllDependencies());
      void followDependencyEnrichment();
      feedback.value = {
        type: 'success',
        message: getOperationMessage('install', packageName, true),
      };
    } catch (error) {
      feedback.value = {
        type: 'error',
        message: getOperationMessage(
          'install',
          packageName,
          false,
          error instanceof Error ? error.message : 'Unknown error'
        ),
        retryAction: 'install',
        packageName,
      };
    } finally {
      activeOperationKey.value = '';
    }
  });

  const updatePackage = $(async (packageName: string) => {
    activeOperationKey.value = `update:${packageName}`;
    lastRetry.value = { action: 'update', packageName };
    feedback.value = null;

    try {
      const rpc = await getDevtoolsRpc();
      const result = await rpc.updatePackage(packageName);
      if (!result.success) {
        feedback.value = {
          type: 'error',
          message: getOperationMessage('update', packageName, false, result.error),
          retryAction: 'update',
          packageName,
        };
        return;
      }

      await applyDependencies(await rpc.getAllDependencies());
      void followDependencyEnrichment();
      feedback.value = {
        type: 'success',
        message: getOperationMessage('update', packageName, true),
      };
    } catch (error) {
      feedback.value = {
        type: 'error',
        message: getOperationMessage(
          'update',
          packageName,
          false,
          error instanceof Error ? error.message : 'Unknown error'
        ),
        retryAction: 'update',
        packageName,
      };
    } finally {
      activeOperationKey.value = '';
    }
  });

  const retryLastOperation = $(async () => {
    const retry = lastRetry.value;
    if (!retry) {
      return;
    }
    if (retry.action === 'search') {
      await runPackageSearch();
      return;
    }
    if (retry.action === 'install' && retry.packageName && retry.dependencyType) {
      await installPackage(retry.packageName, retry.dependencyType);
      return;
    }
    if (retry.action === 'update' && retry.packageName) {
      await updatePackage(retry.packageName);
    }
  });

  useVisibleTask$(async ({ cleanup }) => {
    const rpc = await getDevtoolsRpc();
    const interval = window.setInterval(async () => {
      const status = await rpc.getDependenciesStatus();
      if (status.phase === 'phase2' || status.phase === 'done') {
        state.allDependencies = await rpc.getAllDependencies();
      }
      if (status.phase === 'done' || status.phase === 'error') {
        window.clearInterval(interval);
      }
    }, 1500);

    cleanup(() => window.clearInterval(interval));
  });

  return (
    <div class="flex h-full min-h-0 flex-col gap-4">
      <DependencyToolbar
        installedSearch={installedSearch.value}
        packageSearch={packageSearch.value}
        isRefreshing={isRefreshing.value}
        isSearching={isSearching.value}
        onInstalledSearch$={$((value: string) => {
          installedSearch.value = value;
        })}
        onPackageSearch$={$((value: string) => {
          packageSearch.value = value;
        })}
        onSearch$={runPackageSearch}
        onRefresh$={refreshDependencies}
      />

      <DependencyOperationFeedback
        feedback={feedback.value}
        onRetry$={retryLastOperation}
        onDismiss$={$(() => {
          feedback.value = null;
        })}
      />

      <PackageSearchResults
        query={packageSearch.value}
        results={searchResults.value}
        error={searchError.value}
        isSearching={isSearching.value}
        activeOperationKey={activeOperationKey.value}
        selectedTypes={selectedTypes}
        onRetrySearch$={runPackageSearch}
        onTypeChange$={$((packageName: string, dependencyType: InstallDependencyType) => {
          selectedTypes[packageName] = dependencyType;
        })}
        onInstall$={installPackage}
      />

      <InstalledDependencyList
        dependencies={packages.value}
        filteredDependencies={filteredPackages.value}
        isLoading={state.isLoadingDependencies}
        searchKeyword={installedSearch.value}
        activeOperationKey={activeOperationKey.value}
        onUpdate$={updatePackage}
      />
    </div>
  );
});
