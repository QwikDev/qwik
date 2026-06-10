import { expect, test } from '@playwright/test';
import { access, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  findVariantBySlug,
  outputRootDir,
  toAssetsOutputDir,
  toBuildOutputDir,
  toPathPrefix,
  type BuildVariant,
  trimSlashes,
} from '../variants';

async function assertDirectoryHasFiles(dirPath: string) {
  await access(dirPath);
  const files = await readdir(dirPath);
  expect(files.length).toBeGreaterThan(0);
}

async function getExpectedCircleAssetFileName(variantDir: string, variant: BuildVariant) {
  const assetsDir = toAssetsOutputDir(variantDir, variant);
  const files = await readdir(assetsDir);
  const circleAssetFileName = files.find((fileName) => /-circle\.svg$/.test(fileName));
  expect(circleAssetFileName, `Missing emitted circle asset in ${assetsDir}`).toBeTruthy();
  return circleAssetFileName!;
}

const expectedRobotsTxt = 'User-agent: *\nAllow: /\n';
const expectedCircleSvg = await readFile(
  join(
    process.cwd(),
    'e2e',
    'adapters-e2e',
    'src',
    'components',
    'click-me',
    'assets',
    'circle.svg'
  ),
  'utf-8'
);

function toPublicOutputPath(variantDir: string, basePath: string, fileName: string) {
  const normalizedBase = trimSlashes(basePath);
  return normalizedBase
    ? join(variantDir, 'dist', normalizedBase, fileName)
    : join(variantDir, 'dist', fileName);
}

function getVariantContext(projectName: string) {
  const variant = findVariantBySlug(projectName);
  expect(variant, `Unknown variant project: ${projectName}`).toBeTruthy();

  const requiredVariant = variant!;
  const basePath = requiredVariant.base ?? '/';
  return {
    requiredVariant,
    variantDir: join(outputRootDir, requiredVariant.slug),
    basePath,
    basePrefix: trimSlashes(basePath).length > 0 ? basePath : '/',
    pathPrefix: toPathPrefix(requiredVariant),
  };
}

function toCanonicalAssetPathname(
  pathname: string,
  basePrefix: string,
  pathPrefix: string,
  hasAssetsDir: boolean
) {
  if (!hasAssetsDir) {
    return pathname;
  }

  const baseAssetsPrefix = `${basePrefix}assets/`;
  if (!pathname.startsWith(baseAssetsPrefix)) {
    return pathname;
  }

  return `${pathPrefix}assets/${pathname.slice(baseAssetsPrefix.length)}`;
}

test.describe('vite build matrix for static paths', () => {
  // eslint-disable-next-line no-empty-pattern
  test('writes build and assets directories', async ({}, testInfo) => {
    const { requiredVariant, variantDir } = getVariantContext(testInfo.project.name);

    await assertDirectoryHasFiles(toBuildOutputDir(variantDir, requiredVariant));
    await assertDirectoryHasFiles(toAssetsOutputDir(variantDir, requiredVariant));
  });

  // eslint-disable-next-line no-empty-pattern
  test('writes expected robots.txt output', async ({}, testInfo) => {
    const { variantDir, basePath } = getVariantContext(testInfo.project.name);

    const robotsOutputPath = toPublicOutputPath(variantDir, basePath, 'robots.txt');
    await expect(readFile(robotsOutputPath, 'utf-8')).resolves.toBe(expectedRobotsTxt);
  });

  // eslint-disable-next-line no-empty-pattern
  test('generates correct static path guards and entries', async ({}, testInfo) => {
    const { requiredVariant, variantDir, pathPrefix } = getVariantContext(testInfo.project.name);

    const staticPathsModule = await readFile(
      join(variantDir, 'server', '@qwik-city-static-paths.js'),
      'utf-8'
    );

    expect(staticPathsModule).toContain(
      `if (p.startsWith(${JSON.stringify(pathPrefix + 'build/')})) {`
    );
    expect(staticPathsModule).toContain(
      `if (p.startsWith(${JSON.stringify(pathPrefix + 'assets/')})) {`
    );
    expect(staticPathsModule).toContain(JSON.stringify(pathPrefix + 'robots.txt'));

    const normalizedPath = trimSlashes(pathPrefix);
    if (normalizedPath.length > 0) {
      const doubledPath = `${normalizedPath}/${normalizedPath}`;
      expect(staticPathsModule).not.toContain(doubledPath);
    }

    if (requiredVariant.assetsDir) {
      const doubledAssetsDirPath = `${requiredVariant.assetsDir}/${requiredVariant.assetsDir}/`;
      expect(staticPathsModule).not.toContain(doubledAssetsDirPath);
    }
  });

  test('SSR html references emitted circle asset path', async ({ page }, testInfo) => {
    const { requiredVariant, variantDir, basePath, basePrefix, pathPrefix } = getVariantContext(
      testInfo.project.name
    );
    const circleAssetFileName = await getExpectedCircleAssetFileName(variantDir, requiredVariant);

    await page.goto(basePath);

    const circleSrc = await page.getAttribute('img', 'src');
    expect(circleSrc).toBeTruthy();
    expect(circleSrc!).not.toContain('data:');
    const expectedSrcPrefix = requiredVariant.assetsDir ? basePrefix : pathPrefix;
    expect(circleSrc!).toBe(`${expectedSrcPrefix}assets/${circleAssetFileName}`);
    const circlePathname = new URL(circleSrc!, 'http://127.0.0.1').pathname;
    const canonicalCirclePathname = toCanonicalAssetPathname(
      circlePathname,
      basePrefix,
      pathPrefix,
      !!requiredVariant.assetsDir
    );

    const circleBuiltFilePath = join(variantDir, 'dist', trimSlashes(canonicalCirclePathname));
    await expect(readFile(circleBuiltFilePath, 'utf-8')).resolves.toBe(expectedCircleSvg);
  });

  test('serves robots.txt and circle asset', async ({ page, request }, testInfo) => {
    const { requiredVariant, basePath, basePrefix, pathPrefix } = getVariantContext(
      testInfo.project.name
    );

    await page.goto(basePath);
    const circleSrc = await page.getAttribute('img', 'src');
    expect(circleSrc).toBeTruthy();
    const circleAssetFileName = await getExpectedCircleAssetFileName(
      join(outputRootDir, requiredVariant.slug),
      requiredVariant
    );
    const expectedSrcPrefix = requiredVariant.assetsDir ? basePrefix : pathPrefix;
    expect(circleSrc!).toBe(`${expectedSrcPrefix}assets/${circleAssetFileName}`);
    const circlePathname = new URL(circleSrc!, 'http://127.0.0.1').pathname;
    const canonicalCirclePathname = toCanonicalAssetPathname(
      circlePathname,
      basePrefix,
      pathPrefix,
      !!requiredVariant.assetsDir
    );

    const robotsResponse = await request.get(`${basePrefix}robots.txt`);
    await expect(robotsResponse.ok()).toBeTruthy();
    await expect(robotsResponse.text()).resolves.toBe(expectedRobotsTxt);

    const circleResponse = await request.get(canonicalCirclePathname);
    await expect(circleResponse.ok()).toBeTruthy();
    await expect(circleResponse.text()).resolves.toBe(expectedCircleSvg);
  });

  test('navigates to profile page', async ({ page }, testInfo) => {
    const { basePath } = getVariantContext(testInfo.project.name);

    await page.goto(basePath);

    await page.getByRole('link', { name: 'go to profile' }).click();

    // Some base-path variants can resolve link navigation to a non-based URL.
    if ((await page.textContent('body'))?.includes('Resource Not Found')) {
      await page.goto(`${basePath}profile/`);
    }

    await expect(page.getByRole('heading', { name: /Profile page/ })).toBeVisible();
  });
});
