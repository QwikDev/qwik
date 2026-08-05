import type {
  DependencyInfo,
  DependencyType,
  DependencyVersionStatus,
} from '@qwik.dev/devtools/kit';
import type { RegistryMetadata } from './registry';

export type DependencyEntry = [name: string, requestedVersion: string, type: DependencyType];

export function createDependencyEntries(pkg: any): DependencyEntry[] {
  return [
    ...Object.entries<string>(pkg?.dependencies || {}).map(
      ([name, version]) => [name, version, 'dependencies'] as DependencyEntry
    ),
    ...Object.entries<string>(pkg?.devDependencies || {}).map(
      ([name, version]) => [name, version, 'devDependencies'] as DependencyEntry
    ),
    ...Object.entries<string>(pkg?.peerDependencies || {}).map(
      ([name, version]) => [name, version, 'peerDependencies'] as DependencyEntry
    ),
  ];
}

export function getDependencyType(pkg: any, packageName: string): DependencyType | null {
  if (pkg?.dependencies?.[packageName]) {
    return 'dependencies';
  }
  if (pkg?.devDependencies?.[packageName]) {
    return 'devDependencies';
  }
  if (pkg?.peerDependencies?.[packageName]) {
    return 'peerDependencies';
  }
  return null;
}

export function normalizeRepositoryUrl(repository: any): string | undefined {
  const url = typeof repository === 'string' ? repository : repository?.url;
  if (!url || typeof url !== 'string') {
    return undefined;
  }
  return url
    .replace(/^git\+/, '')
    .replace(/^ssh:\/\/git@/, 'https://')
    .replace(/\.git$/, '');
}

export function guessIconUrl(name: string, repositoryUrl?: string): string | null {
  if (name.startsWith('@')) {
    const scope = name.split('/')[0].substring(1);
    return `https://avatars.githubusercontent.com/${scope}?size=64`;
  }
  if (repositoryUrl?.includes('github.com')) {
    const match = repositoryUrl.match(/github\.com\/([^/]+)/);
    if (match) {
      return `https://avatars.githubusercontent.com/${match[1]}?size=64`;
    }
  }
  return null;
}

export function calculateVersionStatus(
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

export function createDependencyInfo(input: {
  name: string;
  requestedVersion: string;
  type: DependencyType;
  installedPackage?: any;
  registryMetadata?: RegistryMetadata | null;
}): DependencyInfo {
  const repository =
    normalizeRepositoryUrl(input.installedPackage?.repository) ||
    normalizeRepositoryUrl(input.registryMetadata?.repository);
  const latestVersion =
    input.registryMetadata?.distTags?.latest ||
    input.registryMetadata?.['dist-tags']?.latest ||
    input.registryMetadata?.version;
  const currentVersion = input.installedPackage?.version || input.requestedVersion;

  return {
    name: input.name,
    requestedVersion: input.requestedVersion,
    currentVersion,
    latestVersion,
    type: input.type,
    status: calculateVersionStatus(input.installedPackage?.version, latestVersion),
    description:
      input.installedPackage?.description ||
      input.registryMetadata?.description ||
      'No description available',
    author: input.installedPackage?.author || input.registryMetadata?.author,
    homepage: input.installedPackage?.homepage || input.registryMetadata?.homepage,
    repository,
    npmUrl: `https://www.npmjs.com/package/${input.name}`,
    iconUrl: guessIconUrl(input.name, repository),
  };
}
