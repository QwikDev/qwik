import { readFileSync, symlinkSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const node_modules = ['.', 'packages/insights'];
const __dirname = new URL(import.meta.url).pathname;

node_modules.forEach((dir) => {
  const node_modules = join(__dirname, '..', '..', dir, 'node_modules');
  const packages = dir == '.' ? join('..', '..', 'packages') : join('..', '..', '..');
  console.log('Fixing:', node_modules);
  try {
    unlinkSync(join(node_modules, '@builder.io', 'qwik'));
  } catch (e) {}
  symlinkSync(join(packages, 'qwik', 'dist'), join(node_modules, '@builder.io', 'qwik'));

  try {
    unlinkSync(join(node_modules, '@builder.io', 'qwik-city'));
  } catch (e) {}
  symlinkSync(join(packages, 'qwik-city', 'lib'), join(node_modules, '@builder.io', 'qwik-city'));

  const qwikBin = join(node_modules, '.bin', 'qwik');
  try {
    const qwikBinContent = readFileSync(qwikBin).toString();
    writeFileSync(qwikBin, qwikBinContent.replaceAll(/qwik\/dist\/qwik/gim, 'qwik/qwik'));
  } catch (e) {
    console.log('Not found:', qwikBin);
  }
});
