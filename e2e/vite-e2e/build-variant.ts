import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  appTemplateDir,
  findVariantBySlug,
  outputRootDir,
  toClientConfigPath,
  toServerConfigPath,
  workspaceRootDir,
} from './variants.ts';

const execFileAsync = promisify(execFile);

async function runBuildWithConfig(configPath: string, appDir: string) {
  await execFileAsync('pnpm', ['vite', 'build', '-c', configPath], {
    cwd: appDir,
    env: process.env,
  });
}

async function persistBuildOutput(appDir: string, variantDir: string) {
  await rm(variantDir, { recursive: true, force: true });
  await mkdir(variantDir, { recursive: true });
  await cp(join(appDir, 'dist'), join(variantDir, 'dist'), { recursive: true });
  await cp(join(appDir, 'server'), join(variantDir, 'server'), { recursive: true });
}

async function buildVariantBySlug(slug: string) {
  const variant = findVariantBySlug(slug);
  if (!variant) {
    throw new Error(`Unknown variant slug: ${slug}`);
  }

  await mkdir(outputRootDir, { recursive: true });
  await mkdir(workspaceRootDir, { recursive: true });

  const variantDir = join(outputRootDir, variant.slug);
  const workspaceDir = await mkdtemp(join(workspaceRootDir, `${variant.slug}-`));
  const appDir = join(workspaceDir, 'app');

  try {
    await cp(appTemplateDir, appDir, {
      recursive: true,
      filter: (src) => {
        const ignored = ['node_modules', 'dist', 'server', '.vite-e2e'];
        return !ignored.some((name) => src.includes(`/${name}`));
      },
    });

    // Keep each workspace scoped uniquely so Qwik's tmp manifest path doesn't conflict in parallel.
    const packageJsonPath = join(appDir, 'package.json');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
    packageJson.name = `qwik-vite-e2e-${variant.slug}`;
    await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

    await runBuildWithConfig(toClientConfigPath(variant), appDir);
    await runBuildWithConfig(toServerConfigPath(variant), appDir);
    await persistBuildOutput(appDir, variantDir);
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
    await rm(workspaceRootDir, { recursive: true, force: true });
  }
}

const slug = process.argv[2];
if (!slug) {
  throw new Error('Missing variant slug argument');
}

await buildVariantBySlug(slug);
