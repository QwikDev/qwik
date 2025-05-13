import { Extractor, ExtractorConfig } from '@microsoft/api-extractor';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateQwikApiMarkdownDocs, generateQwikRouterApiMarkdownDocs } from './api-docs';
import { type BuildConfig, copyFile, ensureDir, panic } from './util';

/**
 * Create each submodule's bundled dts file, and ensure the public API has not changed for a
 * production build.
 */
export async function apiExtractorQwik(config: BuildConfig) {
  // core
  // Run the api extractor for each of the submodules
  createTypesApi(
    config,
    join(config.srcQwikDir, 'core'),
    join(config.distQwikPkgDir, 'core.d.ts'),
    '.'
  );
  // Special case for jsx-runtime:
  // It only re-exports JSX. Don't duplicate the types
  const jsxContent = readFileSync(join(config.srcQwikDir, 'jsx-runtime.ts'), 'utf-8');
  writeFileSync(
    join(config.distQwikPkgDir, 'jsx-runtime.d.ts'),
    `// re-export to make TS happy when not using nodenext import resolution\n${jsxContent}`
  );
  ensureDir(join(config.distQwikPkgDir, 'jsx-runtime'));
  writeFileSync(
    join(config.distQwikPkgDir, 'jsx-runtime', 'index.d.ts'),
    `// re-export to make TS happy when not using nodenext import resolution\nexport * from '../jsx-runtime';`
  );
  createTypesApi(
    config,
    join(config.srcQwikDir, 'optimizer'),
    join(config.distQwikPkgDir, 'optimizer.d.ts'),
    '.'
  );
  createTypesApi(
    config,
    join(config.srcQwikDir, 'server'),
    join(config.distQwikPkgDir, 'server.d.ts'),
    '.'
  );
  createTypesApi(
    config,
    join(config.srcQwikDir, 'testing'),
    join(config.distQwikPkgDir, 'testing', 'index.d.ts'),
    '..'
  );
  createTypesApi(
    config,
    join(config.srcQwikDir, 'build'),
    join(config.distQwikPkgDir, 'build', 'index.d.ts'),
    '..'
  );
  createTypesApi(
    config,
    join(config.srcQwikDir, 'insights'),
    join(config.distQwikPkgDir, 'insights', 'index.d.ts'),
    '..'
  );
  createTypesApi(
    config,
    join(config.srcQwikDir, 'insights', 'vite'),
    join(config.distQwikPkgDir, 'insights', 'vite', 'index.d.ts'),
    '..'
  );

  generateServerReferenceModules(config);

  const apiJsonInputDir = join(config.rootDir, 'dist-dev', 'api');
  await generateQwikApiMarkdownDocs(config, apiJsonInputDir);

  console.log('🥶', 'qwik d.ts API files generated');
}

export async function apiExtractorQwikRouter(config: BuildConfig) {
  // qwik-router
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-router', 'src', 'runtime', 'src'),
    join(config.packagesDir, 'qwik-router', 'lib', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-router', 'src', 'runtime', 'src', 'service-worker'),
    join(config.packagesDir, 'qwik-router', 'lib', 'service-worker.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-router', 'src', 'buildtime', 'vite'),
    join(config.packagesDir, 'qwik-router', 'lib', 'vite', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-router', 'src', 'adapters', 'azure-swa', 'vite'),
    join(config.packagesDir, 'qwik-router', 'lib', 'adapters', 'azure-swa', 'vite', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-router', 'src', 'adapters', 'cloudflare-pages', 'vite'),
    join(
      config.packagesDir,
      'qwik-router',
      'lib',
      'adapters',
      'cloudflare-pages',
      'vite',
      'index.d.ts'
    )
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-router', 'src', 'adapters', 'cloud-run', 'vite'),
    join(config.packagesDir, 'qwik-router', 'lib', 'adapters', 'cloud-run', 'vite', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-router', 'src', 'adapters', 'deno-server', 'vite'),
    join(config.packagesDir, 'qwik-router', 'lib', 'adapters', 'deno-server', 'vite', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-router', 'src', 'adapters', 'bun-server', 'vite'),
    join(config.packagesDir, 'qwik-router', 'lib', 'adapters', 'bun-server', 'vite', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-router', 'src', 'adapters', 'node-server', 'vite'),
    join(config.packagesDir, 'qwik-router', 'lib', 'adapters', 'node-server', 'vite', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-router', 'src', 'adapters', 'netlify-edge', 'vite'),
    join(config.packagesDir, 'qwik-router', 'lib', 'adapters', 'netlify-edge', 'vite', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-router', 'src', 'adapters', 'shared', 'vite'),
    join(config.packagesDir, 'qwik-router', 'lib', 'adapters', 'shared', 'vite', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-router', 'src', 'adapters', 'static', 'vite'),
    join(config.packagesDir, 'qwik-router', 'lib', 'adapters', 'static', 'vite', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-router', 'src', 'adapters', 'vercel-edge', 'vite'),
    join(config.packagesDir, 'qwik-router', 'lib', 'adapters', 'vercel-edge', 'vite', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-router', 'src', 'middleware', 'azure-swa'),
    join(config.packagesDir, 'qwik-router', 'lib', 'middleware', 'azure-swa', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-router', 'src', 'middleware', 'aws-lambda'),
    join(config.packagesDir, 'qwik-router', 'lib', 'middleware', 'aws-lambda', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-router', 'src', 'middleware', 'cloudflare-pages'),
    join(config.packagesDir, 'qwik-router', 'lib', 'middleware', 'cloudflare-pages', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-router', 'src', 'middleware', 'bun'),
    join(config.packagesDir, 'qwik-router', 'lib', 'middleware', 'bun', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-router', 'src', 'middleware', 'deno'),
    join(config.packagesDir, 'qwik-router', 'lib', 'middleware', 'deno', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-router', 'src', 'middleware', 'netlify-edge'),
    join(config.packagesDir, 'qwik-router', 'lib', 'middleware', 'netlify-edge', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-router', 'src', 'middleware', 'node'),
    join(config.packagesDir, 'qwik-router', 'lib', 'middleware', 'node', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-router', 'src', 'middleware', 'request-handler'),
    join(config.packagesDir, 'qwik-router', 'lib', 'middleware', 'request-handler', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-router', 'src', 'middleware', 'firebase'),
    join(config.packagesDir, 'qwik-router', 'lib', 'middleware', 'firebase', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-router', 'src', 'static'),
    join(config.packagesDir, 'qwik-router', 'lib', 'static', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-router', 'src', 'middleware', 'vercel-edge'),
    join(config.packagesDir, 'qwik-router', 'lib', 'middleware', 'vercel-edge', 'index.d.ts')
  );
  generateQwikRouterReferenceModules(config);

  const apiJsonInputDir = join(config.rootDir, 'dist-dev', 'api');
  await generateQwikRouterApiMarkdownDocs(config, apiJsonInputDir);

  console.log('🥶', 'qwik-router d.ts API files generated');
}

function createTypesApi(
  config: BuildConfig,
  inPath: string,
  outPath: string,
  relativePath?: string
) {
  const extractorConfigPath = join(inPath, 'api-extractor.json');
  const extractorConfig = ExtractorConfig.loadFileAndPrepare(extractorConfigPath);
  const result = Extractor.invoke(extractorConfig, {
    localBuild: !!config.dev,
    showVerboseMessages: true,
    showDiagnostics: true,
    messageCallback(msg) {
      msg.handled = true;
      if (msg.logLevel === 'verbose') {
        return;
      }
      if (msg.text.includes('Analysis will use')) {
        return;
      }
      if (msg.messageId === 'console-api-report-copied') {
        if (config.dev) {
          return;
        }
        console.error(
          `❌ API Extractor, submodule: "${inPath}"\n${extractorConfigPath} has API changes.\n`
        );
        return;
      }
      if (
        msg.messageId === 'console-compiler-version-notice' ||
        msg.messageId === 'ae-undocumented'
      ) {
        return;
      }
      console.error(`❌ API Extractor, submodule: "${inPath}"\n${extractorConfigPath}\n`, msg);
    },
  });
  if (!result.succeeded) {
    console.log(
      'API build results: API changed',
      result.apiReportChanged,
      'errors',
      result.errorCount,
      'warnings',
      result.warningCount
    );
    panic(
      `Use "pnpm api.update" to automatically update the .md files if the api changes were expected`
    );
  }
  for (const path of [
    result.extractorConfig.betaTrimmedFilePath,
    result.extractorConfig.untrimmedFilePath,
  ]) {
    if (path) {
      const fixed = fixDtsContent(config, path, relativePath);
      writeFileSync(path, fixed);
    }
  }
}

function generateQwikRouterReferenceModules(config: BuildConfig) {
  const srcModulesPath = join(config.packagesDir, 'qwik-router', 'lib');

  const destModulesPath = join(srcModulesPath, 'modules.d.ts');
  copyFile(join(config.packagesDir, 'qwik-router', 'modules.d.ts'), destModulesPath);

  // manually prepend the ts reference since api extractor removes it
  const prependReferenceDts = `/// <reference path="./modules.d.ts" />\n\n`;
  const distIndexPath = join(srcModulesPath, 'index.d.ts');
  let serverDts = readFileSync(distIndexPath, 'utf-8');
  serverDts = prependReferenceDts + serverDts;
  writeFileSync(distIndexPath, serverDts);
}

function generateServerReferenceModules(config: BuildConfig) {
  // server-modules.d.ts
  const referenceDts = `/// <reference types="./server" />
declare module '@qwik-client-manifest' {
  const manifest: import('./optimizer').QwikManifest;
  export { manifest };
}
// MD
declare module '*.md' {
  const node: import('./core').FunctionComponent;
  export const frontmatter: Record<string, any>;
  export default node;
}
// MDX
declare module '*.mdx' {
  const node: import('./core').FunctionComponent;
  export const frontmatter: Record<string, any>;
  export default node;
}
// SVG ?jsx
declare module '*.svg?jsx' {
  const Cmp: import('./core').FunctionComponent<import('./core').QwikIntrinsicElements['svg']>
  export default Cmp;
}
// Image ?jsx
declare module '*?jsx' {
  const Cmp: import('./core').FunctionComponent<Omit<import('./core').QwikIntrinsicElements['img'], 'src' | 'width' | 'height' | 'srcSet'>>
  export default Cmp;
  export const width: number;
  export const height: number;
  export const srcSet: string;
}
// Image &jsx
declare module '*&jsx' {
  const Cmp: import('./core').FunctionComponent<Omit<import('./core').QwikIntrinsicElements['img'], 'src' | 'width' | 'height' | 'srcSet'>>
  export default Cmp;
  export const width: number;
  export const height: number;
  export const srcSet: string;
}
`;

  const destServerModulesPath = join(config.distQwikPkgDir, 'server-modules.d.ts');
  writeFileSync(destServerModulesPath, referenceDts);

  // manually prepend the ts reference since api extractor removes it
  const prependReferenceDts = `/// <reference path="./server-modules.d.ts" />\n\n`;
  const distServerPath = join(config.distQwikPkgDir, 'server.d.ts');
  let serverDts = readFileSync(distServerPath, 'utf-8');
  serverDts = prependReferenceDts + serverDts;
  writeFileSync(distServerPath, serverDts);
}

/**
 * Fix up the generated dts content, and ensure it's using a relative path to find the core.d.ts
 * file, rather than node resolving it.
 */
function fixDtsContent(config: BuildConfig, srcPath: string, relativePath?: string) {
  let dts = readFileSync(srcPath, 'utf-8');

  // ensure we're just using a relative path
  if (relativePath) {
    dts = dts.replace(/'@qwik\.dev\/core(.*)'/g, `'${relativePath}$1'`);
  }

  // replace QWIK_VERSION with the actual version number, useful for debugging
  return dts.replace(/QWIK_VERSION/g, config.distVersion);
}
