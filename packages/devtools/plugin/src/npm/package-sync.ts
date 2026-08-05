import fsp from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { DependencyType } from '@qwik.dev/devtools/kit';
import type { PackageManager } from './package-manager';

export interface DependencySyncExpectation {
  projectRoot: string;
  workspaceRoot: string;
  workspacePackageSelector: string | null;
  packageName: string;
  dependencyType: DependencyType;
  expectedVersion?: string;
  packageManager: PackageManager;
}

export interface DependencySyncVerification {
  success: boolean;
  error?: string;
}

async function readJsonFile(filePath: string): Promise<any | null> {
  try {
    const content = await fsp.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function nodeModulesPackageJsonPath(projectRoot: string, name: string): string {
  return path.join(projectRoot, 'node_modules', ...name.split('/'), 'package.json');
}

function normalizeLockResolvedVersion(version: unknown): string | null {
  if (typeof version !== 'string' || !version) {
    return null;
  }
  if (version.startsWith('link:') || version.startsWith('workspace:')) {
    return version;
  }
  return version.split('(')[0] || version;
}

function importerKey(workspacePackageSelector: string | null): string {
  if (!workspacePackageSelector) {
    return '.';
  }
  return workspacePackageSelector.replace(/^\.\//, '');
}

async function readPnpmLockDependency(input: DependencySyncExpectation): Promise<{
  specifier: string | null;
  version: string | null;
}> {
  const lockfilePath = path.join(input.workspaceRoot, 'pnpm-lock.yaml');
  const lockfile = parseYaml(await fsp.readFile(lockfilePath, 'utf-8')) as any;
  const importer = lockfile?.importers?.[importerKey(input.workspacePackageSelector)];
  const dependencyGroup = importer?.[input.dependencyType];
  const entry = dependencyGroup?.[input.packageName];

  return {
    specifier: typeof entry?.specifier === 'string' ? entry.specifier : null,
    version: normalizeLockResolvedVersion(entry?.version),
  };
}

function formatSyncError(input: {
  packageName: string;
  manifestSpecifier: string | null;
  lockfileVersion: string | null;
  installedVersion: string | null;
  expectedVersion?: string;
}): string {
  const expected = input.expectedVersion || input.manifestSpecifier || 'the updated version';
  const details = [
    input.manifestSpecifier ? null : 'manifest entry missing',
    input.lockfileVersion ? `lockfile resolved ${input.lockfileVersion}` : 'lockfile entry missing',
    input.installedVersion ? `installed ${input.installedVersion}` : 'installed package missing',
    `expected ${expected}`,
  ].filter(Boolean);

  return `${input.packageName} update did not synchronize: ${details.join(', ')}`;
}

export async function verifyDependencySync(
  input: DependencySyncExpectation
): Promise<DependencySyncVerification> {
  const manifest = await readJsonFile(path.join(input.projectRoot, 'package.json'));
  const installedPackage = await readJsonFile(
    nodeModulesPackageJsonPath(input.projectRoot, input.packageName)
  );
  const manifestSpecifier =
    typeof manifest?.[input.dependencyType]?.[input.packageName] === 'string'
      ? manifest[input.dependencyType][input.packageName]
      : null;
  const installedVersion =
    typeof installedPackage?.version === 'string' ? installedPackage.version : null;

  const lockDependency =
    input.packageManager === 'pnpm'
      ? await readPnpmLockDependency(input)
      : { specifier: manifestSpecifier, version: installedVersion };

  const expectedVersion =
    input.expectedVersion || installedVersion || lockDependency.version || undefined;
  const manifestMatchesLock =
    input.packageManager !== 'pnpm' || manifestSpecifier === lockDependency.specifier;
  const lockMatchesExpected = !expectedVersion || lockDependency.version === expectedVersion;
  const installMatchesExpected = !expectedVersion || installedVersion === expectedVersion;

  if (manifestSpecifier && manifestMatchesLock && lockMatchesExpected && installMatchesExpected) {
    return { success: true };
  }

  return {
    success: false,
    error: formatSyncError({
      packageName: input.packageName,
      manifestSpecifier,
      lockfileVersion: lockDependency.version,
      installedVersion,
      expectedVersion,
    }),
  };
}
