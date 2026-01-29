import { link, mkdir, readdir, stat, rm } from 'fs/promises';
import { join, dirname, resolve } from 'path';

console.log('');
console.log('CREATING LOCALE PACKAGES');
const __dirname = dirname(new URL(import.meta.url).pathname);
const workspace = resolve(join(__dirname, '..'));
console.log('WORKSPACE', workspace);
const node_modules = join(workspace, 'node_modules');
const dstQwik = join(node_modules, '@builder.io', 'qwik');
const dstQwikCity = join(node_modules, '@builder.io', 'qwik-city');
const srcQwik = join(workspace, 'packages', 'qwik', 'dist');
const srcQwikCity = join(workspace, 'packages', 'qwik-city', 'lib');
main();

async function main() {
  await mkdir(join(node_modules, '@builder.io'), { recursive: true });
  linkDirFiles(srcQwik, dstQwik);
  linkDirFiles(srcQwikCity, dstQwikCity);
}

async function linkDirFiles(src: string, dst: string) {
  try {
    await rm(dst, { recursive: true });
  } catch (e) {}
  await mkdir(dst, { recursive: true });
  const files = await readdir(src);
  for (const file of files) {
    const fileStat = await stat(join(src, file));
    if (fileStat.isDirectory()) {
      linkDirFiles(join(src, file), join(dst, file));
    } else {
      console.log('LINKING', join(src, file), '=>', join(dst, file));
      await link(join(src, file), join(dst, file));
    }
  }
}
