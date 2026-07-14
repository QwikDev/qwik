import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type BuildVariant = {
  name: string;
  slug: string;
  clientConfig: string;
  serverConfig: string;
  port: number;
  base?: string;
  assetsDir?: string;
  buildOutputDir?: string;
  assetOutputDir?: string;
  buildPublicDir?: string;
  assetPublicDir?: string;
};

export const variants: BuildVariant[] = [
  {
    name: 'vite without base/build.assetsDir',
    slug: 'vite-without-base-build-assets-dir',
    clientConfig: 'default.vite.config.ts',
    serverConfig: 'default.vite.config.ts',
    port: 4600,
  },
  {
    name: 'vite with base',
    slug: 'vite-with-base',
    clientConfig: 'base.vite.config.ts',
    serverConfig: 'base.vite.config.ts',
    port: 4601,
    base: '/base/',
  },
  {
    name: 'vite with build.assetsDir',
    slug: 'vite-with-build-assets-dir',
    clientConfig: 'assets-dir.vite.config.ts',
    serverConfig: 'assets-dir.vite.config.ts',
    port: 4602,
    assetsDir: 'assets-dir',
  },
  {
    name: 'vite with base + build.assetsDir',
    slug: 'vite-with-base-build-assets-dir',
    clientConfig: 'base-assets-dir.vite.config.ts',
    serverConfig: 'base-assets-dir.vite.config.ts',
    port: 4603,
    base: '/base/',
    assetsDir: 'assets-dir',
  },
  {
    name: 'vite with custom rollup asset and build output directories',
    slug: 'vite-with-custom-rollup-output',
    clientConfig: 'custom-rollup-output.vite.config.ts',
    serverConfig: 'custom-rollup-output.vite.config.ts',
    port: 4604,
    buildOutputDir: 'q/build',
    assetOutputDir: 'q/assets',
    buildPublicDir: 'q/build',
    assetPublicDir: 'q/assets',
  },
];

const variantsDir = fileURLToPath(new URL('.', import.meta.url));
export const repoRootDir = join(variantsDir, '..', '..');
export const appTemplateDir = join(repoRootDir, 'e2e', 'adapters-e2e');
export const configDir = join(repoRootDir, 'e2e', 'vite-e2e', 'configs');
export const outputRootDir = join(repoRootDir, 'e2e', 'vite-e2e', 'output');
export const workspaceRootDir = join(repoRootDir, 'e2e', 'vite-e2e', '.work');

export const trimSlashes = (s: string) => s.replace(/^\/+|\/+$/g, '');

export const toPathPrefix = (variant: BuildVariant) => {
  const base = variant.base ?? '/';
  if (variant.assetsDir) {
    return `${base}${variant.assetsDir}/`;
  }
  return base;
};

export const toBuildOutputDir = (variantDir: string, variant: BuildVariant) => {
  const buildSegment =
    variant.buildOutputDir ?? (variant.assetsDir ? join(variant.assetsDir, 'build') : 'build');
  return join(variantDir, 'dist', buildSegment);
};

export const toAssetsOutputDir = (variantDir: string, variant: BuildVariant) => {
  const assetsSegment =
    variant.assetOutputDir ?? (variant.assetsDir ? join(variant.assetsDir, 'assets') : 'assets');
  return join(variantDir, 'dist', assetsSegment);
};

const toPublicDirPrefix = (basePath: string, dir: string) => {
  const basePrefix = basePath === '/' ? '/' : basePath;
  const normalizedDir = trimSlashes(dir);
  return normalizedDir ? `${basePrefix}${normalizedDir}/` : basePrefix;
};

export const toBuildPublicPath = (variant: BuildVariant) =>
  toPublicDirPrefix(variant.base ?? '/', variant.buildPublicDir ?? 'build');

export const toAssetPublicPath = (variant: BuildVariant) =>
  toPublicDirPrefix(variant.base ?? '/', variant.assetPublicDir ?? 'assets');

export const toClientConfigPath = (variant: BuildVariant) =>
  join(configDir, 'client', variant.clientConfig);
export const toServerConfigPath = (variant: BuildVariant) =>
  join(configDir, 'server', variant.serverConfig);

export const findVariantBySlug = (slug: string) =>
  variants.find((variant) => variant.slug === slug);
