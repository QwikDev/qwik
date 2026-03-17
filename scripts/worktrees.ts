#!/usr/bin/env node
/**
 * Manage git worktrees with build artifacts and node_modules
 *
 * Usage: pnpm worktree add [branch] - Add a worktree for a branch pnpm worktree list - List all
 * worktrees pnpm worktree rm [branch] - Remove a worktree pnpm worktree - Interactive command
 * picker
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, cpSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { select, text, confirm, isCancel, intro, log, note } from '@clack/prompts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const parentDir = path.resolve(rootDir, '..');
const workTreesDir =
  path.basename(parentDir) === 'qwik.worktrees'
    ? parentDir
    : path.resolve(parentDir, 'qwik.worktrees');
const isWindows = process.platform === 'win32';

interface Worktree {
  path: string;
  branch: string;
  bare: boolean;
}

function getWorktrees(): Worktree[] {
  const output = execSync('git worktree list --porcelain', { cwd: rootDir, encoding: 'utf-8' });
  const worktrees: Worktree[] = [];
  let current: Partial<Worktree> = {};

  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      current.path = line.slice('worktree '.length);
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).replace('refs/heads/', '');
    } else if (line === 'bare') {
      current.bare = true;
    } else if (line === '') {
      if (current.path) {
        worktrees.push({
          path: current.path,
          branch: current.branch || '(detached)',
          bare: current.bare || false,
        });
      }
      current = {};
    }
  }
  return worktrees;
}

function getLocalBranches(): string[] {
  const output = execSync('git branch --sort=-committerdate --format="%(refname:short)"', {
    cwd: rootDir,
    encoding: 'utf-8',
  });
  return output
    .trim()
    .split('\n')
    .filter((b) => b.length > 0);
}

function validateBranchName(name: string): string | undefined {
  if (!name.trim()) {
    return 'Branch name cannot be empty';
  }
  try {
    execSync(`git check-ref-format --branch "${name}"`, { cwd: rootDir, stdio: 'pipe' });
  } catch {
    return 'Invalid branch name';
  }
}

function worktreePathForBranch(branch: string): string {
  // Replace slashes with dashes for directory name
  return path.resolve(workTreesDir, branch.replace(/\//g, '-'));
}

function findWorktreeForBranch(branch: string): Worktree | undefined {
  return getWorktrees().find((wt) => wt.branch === branch);
}

function getWorktreeStatus(worktreePath: string): string {
  try {
    const status = execSync('git status --porcelain', {
      cwd: worktreePath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (!status) {
      return 'clean';
    }
    const lines = status.split('\n');
    const hasUntracked = lines.some((l) => l.startsWith('??'));
    const hasDirty = lines.some((l) => !l.startsWith('??'));
    const parts: string[] = [];
    if (hasDirty) {
      parts.push('dirty');
    }
    if (hasUntracked) {
      parts.push('untracked');
    }
    return parts.join(', ');
  } catch {
    return 'unknown';
  }
}

function printWorktreeInfo(worktreePath: string) {
  note(
    [`cd ${worktreePath}`, `code ${worktreePath}`, `cursor ${worktreePath}`].join('\n'),
    'Open in editor'
  );
}

const dirsToSync = [
  'node_modules',
  'dist-dev',
  'packages/qwik/bindings',
  'packages/qwik/dist',
  'packages/qwik-router/lib',
  'packages/eslint-plugin-qwik/dist',
  'packages/eslint-plugin-qwik/lib',
  'packages/qwik-react/dist',
  'packages/qwik-react/lib',
  'packages/qwik-dom/lib',
  'packages/create-qwik/dist',
  'packages/create-qwik/lib',
];

function copyArtifacts(worktreePath: string) {
  log.info('Copying build artifacts and node_modules...');

  for (const dir of dirsToSync) {
    const srcPath = path.resolve(rootDir, dir);
    const destPath = path.resolve(worktreePath, dir);

    if (existsSync(srcPath)) {
      try {
        if (isWindows) {
          log.step(`  Copying ${dir}...`);
          cpSync(srcPath, destPath, {
            recursive: true,
            force: true,
            verbatimSymlinks: true,
          });
        } else {
          log.step(`  Hardlinking ${dir}...`);
          const destParent = path.dirname(destPath);
          if (!existsSync(destParent)) {
            mkdirSync(destParent, { recursive: true });
          }
          execSync(`cp -al "${srcPath}" "${destPath}"`, {
            cwd: rootDir,
            stdio: 'pipe',
          });
        }
      } catch (err) {
        log.warn(`  Failed to ${isWindows ? 'copy' : 'hardlink'} ${dir}: ${err}`);
      }
    }
  }
}

function runSetup(worktreePath: string) {
  log.info('Running pnpm i && pnpm build.core.dev ...');
  execSync('pnpm i', { cwd: worktreePath, stdio: 'inherit' });
  try {
    execSync('pnpm build.core.dev', { cwd: worktreePath, stdio: 'inherit' });
  } catch {
    log.warn('Build failed in worktree, ignoring');
  }
}

function bail(value: unknown): never | void {
  if (isCancel(value)) {
    log.warn('Cancelled');
    process.exit(0);
  }
}

// --- Commands ---

async function handleAdd(branchArg?: string) {
  let branch = branchArg;
  let isNewBranch = false;

  if (!branch) {
    const branches = getLocalBranches();
    const NEW_BRANCH = '__new__';

    const options = [
      { value: NEW_BRANCH, label: '+ Create new branch from current HEAD' },
      ...branches.map((b) => {
        const wt = findWorktreeForBranch(b);
        return {
          value: b,
          label: b,
          hint: wt ? `worktree: ${wt.path}` : undefined,
        };
      }),
    ];

    const chosen = await select({
      message: 'Select a branch for the worktree',
      options,
    });
    bail(chosen);
    branch = chosen as string;

    if (branch === NEW_BRANCH) {
      isNewBranch = true;
      const name = await text({
        message: 'New branch name:',
        validate: validateBranchName,
      });
      bail(name);
      branch = name as string;
    }
  }

  // Validate branch name even when passed as arg
  const err = validateBranchName(branch);
  if (err) {
    log.error(err);
    process.exit(1);
  }

  // If already a worktree, just show info
  const existing = findWorktreeForBranch(branch);
  if (existing) {
    log.success(`Worktree for '${branch}' already exists at:\n  ${existing.path}`);
    printWorktreeInfo(existing.path);
    return;
  }

  const worktreePath = worktreePathForBranch(branch);

  // Also check if the directory exists (e.g. leftover)
  if (existsSync(worktreePath)) {
    log.error(`Directory already exists at ${worktreePath}`);
    log.info('Run: git worktree prune');
    process.exit(1);
  }

  if (!existsSync(workTreesDir)) {
    mkdirSync(workTreesDir, { recursive: true });
  }

  try {
    log.info(`Creating worktree for '${branch}' at:\n  ${worktreePath}`);

    if (isNewBranch) {
      execSync(`git worktree add -b "${branch}" "${worktreePath}" HEAD`, {
        cwd: rootDir,
        stdio: 'inherit',
      });
    } else {
      execSync(`git worktree add "${worktreePath}" "${branch}"`, {
        cwd: rootDir,
        stdio: 'inherit',
      });
    }

    copyArtifacts(worktreePath);
    runSetup(worktreePath);

    log.success(`Worktree ready at:\n  ${worktreePath}`);
    printWorktreeInfo(worktreePath);
  } catch (err) {
    log.error(`Error creating worktree: ${err}`);
    if (existsSync(worktreePath)) {
      try {
        log.info('Cleaning up partially created worktree...');
        execSync(`git worktree remove --force "${worktreePath}"`, {
          cwd: rootDir,
          stdio: 'pipe',
        });
      } catch (cleanupErr) {
        log.warn(`Could not clean up worktree: ${cleanupErr}`);
      }
    }
    process.exit(1);
  }
}

async function handleList() {
  const worktrees = getWorktrees();
  if (worktrees.length === 0) {
    log.info('No worktrees found');
    return;
  }
  const lines = worktrees.map((wt) => {
    const marker = wt.path === rootDir ? ' (main)' : '';
    const status = getWorktreeStatus(wt.path);
    return `${wt.branch}${marker} [${status}]\n  ${wt.path}`;
  });
  note(lines.join('\n\n'), 'Worktrees');
}

async function handleRemove(branchArg?: string) {
  const worktrees = getWorktrees().filter((wt) => wt.path !== rootDir);

  if (worktrees.length === 0) {
    log.info('No removable worktrees found');
    return;
  }

  let target: Worktree | undefined;

  if (branchArg) {
    target = worktrees.find((wt) => wt.branch === branchArg);
    if (!target) {
      log.error(`No worktree found for branch '${branchArg}'`);
      process.exit(1);
    }
  } else {
    const chosen = await select({
      message: 'Select worktree to remove',
      options: worktrees.map((wt) => ({
        value: wt,
        label: wt.branch,
        hint: `[${getWorktreeStatus(wt.path)}] ${wt.path}`,
      })),
    });
    bail(chosen);
    target = chosen as Worktree;
  }

  const ok = await confirm({
    message: `Remove worktree '${target.branch}' at ${target.path}?`,
  });
  bail(ok);

  if (!ok) {
    log.info('Aborted');
    return;
  }

  try {
    execSync(`git worktree remove "${target.path}"`, { cwd: rootDir, stdio: 'inherit' });
    log.success(`Removed worktree '${target.branch}'`);
  } catch {
    log.error('Failed to remove worktree. You may need: git worktree remove --force ...');
    process.exit(1);
  }
}

// --- Main ---

async function main() {
  intro('Qwik Worktree Manager');

  const args = process.argv.slice(2);
  let command = args[0];

  if (!command) {
    const chosen = await select({
      message: 'What would you like to do?',
      options: [
        { value: 'add', label: 'Add a worktree' },
        { value: 'list', label: 'List worktrees' },
        { value: 'rm', label: 'Remove a worktree' },
      ],
    });
    bail(chosen);
    command = chosen as string;
  }

  switch (command) {
    case 'add':
      await handleAdd(args[1]);
      break;
    case 'list':
    case 'ls':
      await handleList();
      break;
    case 'rm':
    case 'remove':
      await handleRemove(args[1]);
      break;
    default:
      log.error(`Unknown command: ${command}`);
      log.info('Usage: pnpm worktree [add|list|rm]');
      process.exit(1);
  }
}

main();
