import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { PackageSearchResult } from '@qwik.dev/devtools/kit';

export const DEFAULT_NPM_REGISTRY = 'https://registry.npmjs.org';

export interface RegistryMetadata {
  name: string;
  version?: string;
  description?: string;
  author?: string | { name?: string; email?: string; url?: string };
  homepage?: string;
  repository?: unknown;
  distTags?: {
    latest?: string;
  };
  'dist-tags'?: {
    latest?: string;
  };
}

export function normalizeRegistryUrl(registryUrl?: string | null): string {
  const value = registryUrl?.trim() || DEFAULT_NPM_REGISTRY;
  return value.replace(/\/+$/, '');
}

export function buildPackageMetadataUrl(registryUrl: string, packageName: string): string {
  return `${normalizeRegistryUrl(registryUrl)}/${encodeURIComponent(packageName)}`;
}

export function buildPackageVersionUrl(
  registryUrl: string,
  packageName: string,
  version: string
): string {
  return `${buildPackageMetadataUrl(registryUrl, packageName)}/${encodeURIComponent(version)}`;
}

export function buildPackageSearchUrl(registryUrl: string, query: string, size = 20): string {
  const url = new URL(`${normalizeRegistryUrl(registryUrl)}/-/v1/search`);
  url.searchParams.set('text', query);
  url.searchParams.set('size', String(size));
  return url.href;
}

export async function resolveRegistryUrl(projectRoot: string): Promise<string> {
  const envRegistry = process.env.npm_config_registry || process.env.NPM_CONFIG_REGISTRY;
  if (envRegistry) {
    return normalizeRegistryUrl(envRegistry);
  }

  try {
    const npmrc = await readFile(path.join(projectRoot, '.npmrc'), 'utf8');
    const registryLine = npmrc
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#') && line.startsWith('registry='));
    if (registryLine) {
      return normalizeRegistryUrl(registryLine.slice('registry='.length));
    }
  } catch {
    return DEFAULT_NPM_REGISTRY;
  }

  return DEFAULT_NPM_REGISTRY;
}

async function fetchJson<T>(url: string, timeoutMs = 2500): Promise<T | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchPackageMetadata(
  registryUrl: string,
  packageName: string
): Promise<RegistryMetadata | null> {
  return fetchJson<RegistryMetadata>(buildPackageMetadataUrl(registryUrl, packageName));
}

export async function fetchPackageVersionMetadata(
  registryUrl: string,
  packageName: string,
  version: string
): Promise<RegistryMetadata | null> {
  return fetchJson<RegistryMetadata>(buildPackageVersionUrl(registryUrl, packageName, version));
}

export function normalizeSearchResponse(
  response: any,
  installedVersions: Map<string, string>
): PackageSearchResult[] {
  const objects = Array.isArray(response?.objects) ? response.objects : [];
  return objects
    .map((item: any): PackageSearchResult | null => {
      const pkg = item?.package;
      if (!pkg?.name || !pkg?.version) {
        return null;
      }
      const installedVersion = installedVersions.get(pkg.name);
      return {
        name: pkg.name,
        latestVersion: pkg.version,
        description: pkg.description || 'No description available',
        author: pkg.publisher?.username || pkg.author?.name || pkg.author,
        npmUrl: `https://www.npmjs.com/package/${pkg.name}`,
        isInstalled: installedVersion !== undefined,
        installedVersion,
      };
    })
    .filter((result: PackageSearchResult | null): result is PackageSearchResult => result !== null);
}

export async function searchRegistryPackages(
  registryUrl: string,
  query: string,
  installedVersions: Map<string, string>
): Promise<PackageSearchResult[]> {
  const response = await fetchJson<any>(buildPackageSearchUrl(registryUrl, query, 20));
  return normalizeSearchResponse(response, installedVersions);
}
