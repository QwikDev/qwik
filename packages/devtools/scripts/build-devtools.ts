import { execSync } from 'child_process';
import { join } from 'path';
import { cpSync, mkdirSync, rmSync } from 'fs';

const ROOT = process.cwd();
const UI_PATH = join(ROOT, 'ui');
const PLUGIN_PATH = join(ROOT, 'plugin');
const DIST_PATH = join(ROOT, 'dist');
import createDebug from 'debug';
const log = createDebug('qwik:devtools:build-devtools');

// Clean previous builds
log('Cleaning previous builds...');
rmSync(DIST_PATH, { recursive: true, force: true });

// Ensure dist directory exists
mkdirSync(DIST_PATH, { recursive: true });

// Build plugin
log('Building plugin...');
execSync('pnpm build', {
  cwd: PLUGIN_PATH,
  stdio: 'inherit',
});

// Build devtools ui
log('Building devtools...');
execSync('pnpm build', {
  cwd: UI_PATH,
  stdio: 'inherit',
});

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
