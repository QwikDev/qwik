import type { DependencyInfo, DependencyVersionStatus, PackageSearchResult } from './types';

export function filterInstalledDependencies(
  dependencies: DependencyInfo[],
  keyword: string
): DependencyInfo[] {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) {
    return dependencies;
  }
  return dependencies.filter((dependency) =>
    dependency.name.toLowerCase().includes(normalizedKeyword)
  );
}

export function markInstalledSearchResults(
  results: PackageSearchResult[],
  dependencies: DependencyInfo[]
): PackageSearchResult[] {
  const installedVersions = new Map(
    dependencies.map((dependency) => [dependency.name, dependency.currentVersion])
  );

  return results.map((result) => {
    const installedVersion = installedVersions.get(result.name);
    return {
      ...result,
      isInstalled: installedVersion !== undefined,
      installedVersion,
    };
  });
}

function calculateDependencyStatus(
  currentVersion: string | undefined,
  latestVersion?: string
): DependencyVersionStatus {
  if (!currentVersion || !latestVersion) {
    return 'unknown';
  }
  if (/[*^~<>=|]/.test(currentVersion) || currentVersion.startsWith('workspace:')) {
    return 'unknown';
  }
  return currentVersion === latestVersion ? 'latest' : 'outdated';
}

export function mergeDependencyRefresh(
  previousDependencies: DependencyInfo[],
  refreshedDependencies: DependencyInfo[]
): DependencyInfo[] {
  const previousByName = new Map(
    previousDependencies.map((dependency) => [dependency.name, dependency])
  );

  return refreshedDependencies.map((dependency) => {
    if (dependency.latestVersion) {
      return dependency;
    }

    const previous = previousByName.get(dependency.name);
    if (!previous?.latestVersion) {
      return dependency;
    }

    return {
      ...dependency,
      latestVersion: previous.latestVersion,
      status: calculateDependencyStatus(dependency.currentVersion, previous.latestVersion),
    };
  });
}

export function getDependencyStatusLabel(status: DependencyVersionStatus): string {
  return {
    latest: 'Latest',
    outdated: 'Update available',
    unknown: 'Unknown',
    error: 'Error',
  }[status];
}

export function getDependencyStatusClass(status: DependencyVersionStatus): string {
  return {
    latest: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    outdated: 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300',
    unknown: 'border-border bg-foreground/5 text-muted-foreground',
    error: 'border-red-500/20 bg-red-500/10 text-red-300',
  }[status];
}

export function getOperationMessage(
  action: 'install' | 'update',
  packageName: string,
  success: boolean,
  error?: string
): string {
  if (success) {
    return action === 'install' ? `Installed ${packageName}` : `Updated ${packageName}`;
  }
  const verb = action === 'install' ? 'install' : 'update';
  return `Failed to ${verb} ${packageName}: ${error || 'Unknown error'}`;
}
