import { execSync } from 'child_process';
import { join } from 'path';
import { cpSync, mkdirSync, rmSync } from 'fs';

const ROOT = process.cwd();
const UI_PATH = join(ROOT, 'ui');
const PLUGIN_PATH = join(ROOT, 'plugin');
const DIST_PATH = join(ROOT, 'dist');
import createDebug from 'debug';
const log = createDebug('qwik:devtools:build-devtools');

function exec(command: string) {
  execSync(command, {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

// Clean previous builds
log('Cleaning previous builds...');
rmSync(DIST_PATH, { recursive: true, force: true });

// Ensure dist directory exists
mkdirSync(DIST_PATH, { recursive: true });

// Build shared devtools kit
log('Building devtools kit...');
exec(
  'pnpm exec tsdown kit/src/index.ts --out-dir dist/kit --format esm --target esnext --dts --clean --tsconfig tsconfig.json --external @qwik.dev/core'
);

// Build plugin
log('Building plugin...');
exec('pnpm exec tsdown --config plugin/tsdown.config.ts');

// Build devtools ui
log('Building devtools types...');
rmSync(join(UI_PATH, 'lib-types'), { recursive: true, force: true });
exec('pnpm exec tsc --project ui/tsconfig.json --emitDeclarationOnly --pretty false');

log('Building devtools library...');
rmSync(join(UI_PATH, 'lib'), { recursive: true, force: true });
exec('pnpm exec vite build --config ui/vite.config.mts --mode lib');

log('Linting devtools UI...');
exec('pnpm exec eslint "ui/src/**/*.ts*"');

// Copy lib and lib-types to dist
log('Copying files to dist...');
cpSync(join(UI_PATH, 'lib'), join(DIST_PATH, 'ui'), {
  recursive: true,
});
cpSync(join(UI_PATH, 'lib-types'), join(DIST_PATH, 'ui', 'lib-types'), {
  recursive: true,
});

log('Copying plugin files to dist...');
cpSync(join(PLUGIN_PATH, 'dist'), join(DIST_PATH, 'plugin'), {
  recursive: true,
});

log('Devtools build complete!');
