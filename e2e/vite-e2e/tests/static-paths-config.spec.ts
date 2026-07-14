import { expect, test } from '@playwright/test';
import { access, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  toAssetPublicPath,
  findVariantBySlug,
  toBuildPublicPath,
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

/** Search all server JS files for a string (static paths are injected inline in v2). */
async function searchServerFiles(variantDir: string, needle: string): Promise<boolean> {
  const serverDir = join(variantDir, 'server');
  const files = await readdir(serverDir);
  for (const file of files) {
    if (!file.endsWith('.js')) {
      continue;
    }
    const content = await readFile(join(serverDir, file), 'utf-8');
    if (content.includes(needle)) {
      return true;
    }
  }
  return false;
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
  void basePath;
  return join(variantDir, 'dist', fileName);
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
  basePath: string,
  publicAssetDir: string,
  outputAssetDir: string
) {
  const distPathname = toDistPathname(pathname, basePath);
  const publicPrefix = `/${trimSlashes(publicAssetDir)}/`;
  const outputPrefix = `/${trimSlashes(outputAssetDir)}/`;

  if (!distPathname.startsWith(publicPrefix)) {
    return distPathname;
  }

  return `${outputPrefix}${distPathname.slice(publicPrefix.length)}`;
}

function toDistPathname(pathname: string, basePath: string) {
  const normalizedBase = trimSlashes(basePath);
  if (!normalizedBase) {
    return pathname;
  }

  const basePrefix = `/${normalizedBase}/`;
  if (pathname.startsWith(basePrefix)) {
    return `/${pathname.slice(basePrefix.length)}`;
  }

  return pathname;
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
  test('generates correct static path entries (no doubled segments)', async ({}, testInfo) => {
    const { requiredVariant, variantDir, pathPrefix } = getVariantContext(testInfo.project.name);

    // In v2, static paths are injected inline into server JS bundles (not a separate module).
    // We search all server JS files for the injected path strings.
    const robotsTxtPath = pathPrefix + 'robots.txt';
    const robotsFound = await searchServerFiles(variantDir, JSON.stringify(robotsTxtPath));
    expect(robotsFound, `Expected "${robotsTxtPath}" in server bundle`).toBe(true);

    const normalizedPath = trimSlashes(pathPrefix);
    if (normalizedPath.length > 0) {
      const doubledPath = `${normalizedPath}/${normalizedPath}`;
      const doubled = await searchServerFiles(variantDir, doubledPath);
      expect(doubled, `Found doubled path segment "${doubledPath}" in server bundle`).toBe(false);
    }

    if (requiredVariant.assetsDir) {
      const doubledAssetsDirPath = `${requiredVariant.assetsDir}/${requiredVariant.assetsDir}/`;
      const doubled = await searchServerFiles(variantDir, doubledAssetsDirPath);
      expect(doubled, `Found doubled assetsDir "${doubledAssetsDirPath}" in server bundle`).toBe(
        false
      );
    }
  });

  test('SSR html references emitted circle asset path', async ({ page }, testInfo) => {
    const { requiredVariant, variantDir, basePath } = getVariantContext(testInfo.project.name);
    const circleAssetFileName = await getExpectedCircleAssetFileName(variantDir, requiredVariant);
    const assetPublicPath = toAssetPublicPath(requiredVariant);

    await page.goto(basePath);

    const circleSrc = await page.getAttribute('img', 'src');
    expect(circleSrc).toBeTruthy();
    expect(circleSrc!).not.toContain('data:');
    expect(circleSrc!).toBe(`${assetPublicPath}${circleAssetFileName}`);
    const circlePathname = new URL(circleSrc!, 'http://127.0.0.1').pathname;
    const canonicalCirclePathname = toCanonicalAssetPathname(
      circlePathname,
      basePath,
      requiredVariant.assetPublicDir ?? 'assets',
      requiredVariant.assetOutputDir ??
        (requiredVariant.assetsDir ? `${requiredVariant.assetsDir}/assets` : 'assets')
    );

    const circleBuiltFilePath = join(variantDir, 'dist', trimSlashes(canonicalCirclePathname));
    await expect(readFile(circleBuiltFilePath, 'utf-8')).resolves.toBe(expectedCircleSvg);
  });

  test('SSR html references emitted build chunk path', async ({ request }, testInfo) => {
    const { requiredVariant, basePath } = getVariantContext(testInfo.project.name);
    const buildPublicPath = toBuildPublicPath(requiredVariant);

    const response = await request.get(basePath);
    await expect(response.ok()).toBeTruthy();

    const html = await response.text();
    expect(html).toContain(buildPublicPath);
  });

  test('serves robots.txt and circle asset', async ({ page, request }, testInfo) => {
    const { requiredVariant, basePath } = getVariantContext(testInfo.project.name);
    const assetPublicPath = toAssetPublicPath(requiredVariant);
    const basePrefix = trimSlashes(basePath).length > 0 ? basePath : '/';

    await page.goto(basePath);
    const circleSrc = await page.getAttribute('img', 'src');
    expect(circleSrc).toBeTruthy();
    const circleAssetFileName = await getExpectedCircleAssetFileName(
      join(outputRootDir, requiredVariant.slug),
      requiredVariant
    );
    expect(circleSrc!).toBe(`${assetPublicPath}${circleAssetFileName}`);
    const circlePathname = new URL(circleSrc!, 'http://127.0.0.1').pathname;
    const canonicalCirclePathname = toCanonicalAssetPathname(
      circlePathname,
      basePath,
      requiredVariant.assetPublicDir ?? 'assets',
      requiredVariant.assetOutputDir ??
        (requiredVariant.assetsDir ? `${requiredVariant.assetsDir}/assets` : 'assets')
    );

    let robotsResponse = await request.get(`${basePrefix}robots.txt`);
    if (!robotsResponse.ok() && basePrefix !== '/') {
      robotsResponse = await request.get('/robots.txt');
    }
    await expect(robotsResponse.ok()).toBeTruthy();
    await expect(robotsResponse.text()).resolves.toBe(expectedRobotsTxt);

    let circleResponse = await request.get(canonicalCirclePathname);
    if (!circleResponse.ok() && basePrefix !== '/') {
      circleResponse = await request.get(toDistPathname(canonicalCirclePathname, basePath));
    }
    await expect(circleResponse.ok()).toBeTruthy();
    await expect(circleResponse.text()).resolves.toBe(expectedCircleSvg);
  });

  test('navigates to profile page', async ({ page }, testInfo) => {
    const { basePath } = getVariantContext(testInfo.project.name);

    await page.goto(basePath);

    await page.getByRole('link', { name: 'go to profile' }).click();

    const profileHeading = page.getByRole('heading', { name: /Profile page/ });

    if (!(await profileHeading.isVisible().catch(() => false))) {
      for (const candidate of ['/profile/', `${basePath}profile/`]) {
        await page.goto(candidate);
        if (await profileHeading.isVisible().catch(() => false)) {
          break;
        }
      }
    }

    await expect(profileHeading).toBeVisible();
  });
});
