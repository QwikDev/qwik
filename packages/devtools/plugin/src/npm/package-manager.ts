import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import type { DependencyType, InstallDependencyType } from '@qwik.dev/devtools/kit';

export type PackageManager = 'npm' | 'pnpm' | 'yarn';

export interface PackageProjectContext {
  packageJsonPath: string | null;
  projectRoot: string;
  workspaceRoot: string;
  packageManager: PackageManager;
  workspacePackageSelector: string | null;
}

export interface PackageCommand {
  command: PackageManager;
  args: string[];
  cwd: string;
}

export interface PackageCommandResult {
  commandLine: string;
  stdout: string;
  stderr: string;
  code: number;
}

export class PackageCommandError extends Error {
  constructor(public result: PackageCommandResult) {
    super(
      [
        `${result.commandLine} exited with code ${result.code}`,
        result.stderr.trim(),
        result.stdout.trim(),
      ]
        .filter(Boolean)
        .join('\n')
    );
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findNearestFileUp(startDir: string, fileName: string): Promise<string | null> {
  let currentDir = path.resolve(startDir);
  for (let i = 0; i < 100; i++) {
    const candidate = path.join(currentDir, fileName);
    if (await fileExists(candidate)) {
      return candidate;
    }
    const parent = path.dirname(currentDir);
    if (parent === currentDir) {
      break;
    }
    currentDir = parent;
  }
  return null;
}

function toPnpmSelectorPath(workspaceRoot: string, projectRoot: string): string | null {
  const relativePath = path.relative(workspaceRoot, projectRoot).split(path.sep).join('/');
  if (!relativePath || relativePath === '.') {
    return null;
  }
  return `./${relativePath}`;
}

export function isValidPackageName(packageName: string): boolean {
  if (!packageName || packageName.length > 214) {
    return false;
  }
  return /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(packageName);
}

export async function detectPackageManager(projectRoot: string): Promise<PackageManager> {
  if (await fileExists(path.join(projectRoot, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (await fileExists(path.join(projectRoot, 'yarn.lock'))) {
    return 'yarn';
  }
  if (await fileExists(path.join(projectRoot, 'package-lock.json'))) {
    return 'npm';
  }
  return 'pnpm';
}

export async function resolvePackageProjectContext(
  startDir: string
): Promise<PackageProjectContext> {
  const packageJsonPath = await findNearestFileUp(startDir, 'package.json');
  const projectRoot = packageJsonPath ? path.dirname(packageJsonPath) : path.resolve(startDir);
  const pnpmWorkspacePath = await findNearestFileUp(projectRoot, 'pnpm-workspace.yaml');
  const pnpmLockPath = await findNearestFileUp(projectRoot, 'pnpm-lock.yaml');
  const yarnLockPath = await findNearestFileUp(projectRoot, 'yarn.lock');
  const npmLockPath = await findNearestFileUp(projectRoot, 'package-lock.json');

  const packageManager: PackageManager =
    pnpmWorkspacePath || pnpmLockPath
      ? 'pnpm'
      : yarnLockPath
        ? 'yarn'
        : npmLockPath
          ? 'npm'
          : 'pnpm';

  const workspaceRoot =
    packageManager === 'pnpm' && pnpmWorkspacePath
      ? path.dirname(pnpmWorkspacePath)
      : packageManager === 'pnpm' && pnpmLockPath
        ? path.dirname(pnpmLockPath)
        : projectRoot;

  return {
    packageJsonPath,
    projectRoot,
    workspaceRoot,
    packageManager,
    workspacePackageSelector:
      packageManager === 'pnpm' ? toPnpmSelectorPath(workspaceRoot, projectRoot) : null,
  };
}

export function buildInstallCommand(
  context: PackageProjectContext,
  packageName: string,
  dependencyType: InstallDependencyType
): PackageCommand {
  if (context.packageManager === 'npm') {
    return {
      command: 'npm',
      args:
        dependencyType === 'devDependencies'
          ? ['install', '--ignore-scripts', '--save-dev', packageName]
          : ['install', '--ignore-scripts', packageName],
      cwd: context.projectRoot,
    };
  }
  if (context.packageManager === 'yarn') {
    return {
      command: 'yarn',
      args:
        dependencyType === 'devDependencies'
          ? ['add', '--ignore-scripts', '-D', packageName]
          : ['add', '--ignore-scripts', packageName],
      cwd: context.projectRoot,
    };
  }

  const saveArgs = dependencyType === 'devDependencies' ? ['-D'] : [];
  return {
    command: 'pnpm',
    args: context.workspacePackageSelector
      ? [
          '--filter',
          context.workspacePackageSelector,
          'add',
          '--ignore-scripts',
          ...saveArgs,
          packageName,
        ]
      : ['add', '--ignore-scripts', ...saveArgs, packageName],
    cwd: context.workspacePackageSelector ? context.workspaceRoot : context.projectRoot,
  };
}

export function buildUpdateCommand(
  context: PackageProjectContext,
  packageName: string,
  dependencyType: DependencyType
): PackageCommand {
  const packageAtLatest = `${packageName}@latest`;

  if (context.packageManager === 'npm') {
    if (dependencyType === 'devDependencies') {
      return {
        command: 'npm',
        args: ['install', '--ignore-scripts', '--save-dev', packageAtLatest],
        cwd: context.projectRoot,
      };
    }
    if (dependencyType === 'peerDependencies') {
      return {
        command: 'npm',
        args: ['install', '--ignore-scripts', '--save-peer', packageAtLatest],
        cwd: context.projectRoot,
      };
    }
    return {
      command: 'npm',
      args: ['install', '--ignore-scripts', packageAtLatest],
      cwd: context.projectRoot,
    };
  }

  if (context.packageManager === 'yarn') {
    if (dependencyType === 'devDependencies') {
      return {
        command: 'yarn',
        args: ['add', '--ignore-scripts', '-D', packageAtLatest],
        cwd: context.projectRoot,
      };
    }
    if (dependencyType === 'peerDependencies') {
      return {
        command: 'yarn',
        args: ['add', '--ignore-scripts', '--peer', packageAtLatest],
        cwd: context.projectRoot,
      };
    }
    return {
      command: 'yarn',
      args: ['add', '--ignore-scripts', packageAtLatest],
      cwd: context.projectRoot,
    };
  }

  const saveArgs =
    dependencyType === 'devDependencies'
      ? ['-D']
      : dependencyType === 'peerDependencies'
        ? ['--save-peer']
        : [];

  return {
    command: 'pnpm',
    args: context.workspacePackageSelector
      ? [
          '--filter',
          context.workspacePackageSelector,
          'add',
          '--ignore-scripts',
          ...saveArgs,
          packageAtLatest,
        ]
      : ['add', '--ignore-scripts', ...saveArgs, packageAtLatest],
    cwd: context.workspacePackageSelector ? context.workspaceRoot : context.projectRoot,
  };
}

function formatCommandLine(packageCommand: PackageCommand): string {
  return [packageCommand.command, ...packageCommand.args].join(' ');
}

export function runPackageCommand(packageCommand: PackageCommand): Promise<PackageCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(packageCommand.command, packageCommand.args, {
      cwd: packageCommand.cwd,
      shell: false,
      stdio: 'pipe',
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      const result: PackageCommandResult = {
        commandLine: formatCommandLine(packageCommand),
        stdout,
        stderr,
        code: code ?? 1,
      };

      if (code === 0) {
        resolve(result);
        return;
      }

      reject(new PackageCommandError(result));
    });
  });
}
