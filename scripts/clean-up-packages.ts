import { readFileSync, symlinkSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const node_modules = ['.', 'packages/docs', 'packages/insights'];
const __dirname = new URL(import.meta.url).pathname;

node_modules.forEach((dir) => {
  const node_modules = join(__dirname, '..', '..', dir, 'node_modules');
  console.log('Fixing:', node_modules);
  try {
    unlinkSync(join(node_modules, '@builder.io', 'qwik'));
  } catch (e) {}
  symlinkSync(join('..', '..', '..', 'qwik', 'dist'), join(node_modules, '@builder.io', 'qwik'));

  try {
    unlinkSync(join(node_modules, '@builder.io', 'qwik-city'));
  } catch (e) {}
  symlinkSync(
    join('..', '..', '..', 'qwik-city', 'lib'),
    join(node_modules, '@builder.io', 'qwik-city')
  );

  const qwikBin = join(node_modules, '.bin', 'qwik');
  const qwikBinContent = readFileSync(qwikBin).toString();
  writeFileSync(qwikBin, qwikBinContent.replaceAll(/qwik\/dist\/qwik/gim, 'qwik/qwik'));
});

