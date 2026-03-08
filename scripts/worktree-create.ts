#!/usr/bin/env node
/**
 * Create a new git worktree with all node_modules and build artifacts copied
 *
 * Usage: pnpm worktree:create [branch-name]
 *
 * If no branch name is provided, it will prompt for one.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, cpSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { text } from '@clack/prompts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const parentDir = path.resolve(rootDir, '..');
const workTreesDir = path.resolve(parentDir, 'qwik.worktrees');
const isWindows = process.platform === 'win32';

async function main() {
  const args = process.argv.slice(2);
  let branchName = args[0];

  if (!branchName) {
    branchName = (await text({
      message: 'Enter the branch name for the new worktree (has to exist locally or remotely):',
      validate: (value: string) => {
        if (!value.trim()) {
          return 'Branch name cannot be empty';
        }
      },
    })) as string;
  }

  const workTreePath = path.resolve(workTreesDir, branchName);

  console.log(`Creating git worktree for branch: ${branchName}`);
  console.log(`Location: ${workTreePath}`);

  // Create worktrees directory if it doesn't exist
  if (!existsSync(workTreesDir)) {
    mkdirSync(workTreesDir, { recursive: true });
    console.log(`Created worktrees directory: ${workTreesDir}`);
  }

  // Check if worktree already exists
  if (existsSync(workTreePath)) {
    console.error(`Error: Worktree already exists at ${workTreePath}`);
    process.exit(1);
  }

  try {
    // Create the git worktree
    console.log(`\nCreating git worktree...`);
    execSync(`git worktree add "${workTreePath}" "${branchName}"`, {
      cwd: rootDir,
      stdio: 'inherit',
    });

    console.log(`\nCopying build artifacts and node_modules...`);

    // Directories to copy (relative to root)
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

    for (const dir of dirsToSync) {
      const srcPath = path.resolve(rootDir, dir);
      const destPath = path.resolve(workTreePath, dir);

      if (existsSync(srcPath)) {
        try {
          if (isWindows) {
            console.log(`  Copying ${dir}...`);
            cpSync(srcPath, destPath, {
              recursive: true,
              force: true,
              verbatimSymlinks: true,
            });
          } else {
            console.log(`  Hardlinking ${dir}...`);
            // Create parent directory if needed
            const destParent = path.dirname(destPath);
            if (!existsSync(destParent)) {
              mkdirSync(destParent, { recursive: true });
            }
            // Use cp -al for recursive hardlink copy on Unix
            // This saves disk space and is much faster than copying
            execSync(`cp -al "${srcPath}" "${destPath}"`, {
              cwd: rootDir,
              stdio: 'pipe',
            });
          }
        } catch (err) {
          console.warn(`  Warning: Failed to ${isWindows ? 'copy' : 'hardlink'} ${dir}: ${err}`);
        }
      }
    }

    console.log(`\nRunning pnpm i && pnpm build.core.dev in worktree...`);
    execSync('pnpm i', {
      cwd: workTreePath,
      stdio: 'inherit',
    });
    try {
      execSync('pnpm build.core.dev', {
        cwd: workTreePath,
        stdio: 'inherit',
      });
    } catch (err) {
      console.warn(`  Warning: Build failed in worktree, ignoring: ${err}`);
    }

    console.log(`\n✅ Worktree successfully created at: ${workTreePath}`);
    console.log(`\nTo clean up the worktree later, run:`);
    console.log(`  git worktree remove "${workTreePath}"`);
  } catch (err) {
    console.error(`\n❌ Error creating worktree:`, err);
    // Try to clean up the worktree if it was created
    if (existsSync(workTreePath)) {
      try {
        console.log(`\nCleaning up partially created worktree...`);
        execSync(`git worktree remove --force "${workTreePath}"`, {
          cwd: rootDir,
          stdio: 'pipe',
        });
      } catch (cleanupErr) {
        console.warn(`Warning: Could not clean up worktree: ${cleanupErr}`);
      }
    }
    process.exit(1);
  }
}

main();
