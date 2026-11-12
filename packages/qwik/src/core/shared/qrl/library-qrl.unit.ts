import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const coreDir = join(__dirname, '../..');
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '');
const sources = (readdirSync(coreDir, { recursive: true }) as string[])
  .filter(
    (file) =>
      /\.tsx?$/.test(file) &&
      !/\.(unit|spec)\.tsx?$|(^|[/\\])(tests|bench)[/\\]|^examples\.tsx$/.test(file)
  )
  .map((file) => ({ file, source: withoutComments(readFileSync(join(coreDir, file), 'utf8')) }));
const allSource = sources.map(({ source }) => source).join('\n');
// `$(name)` roots; the other sites pass the function inline.
const importsDollar = /import \{[^}]*(?<![\w$])\$[\s,}]/;
const namedRoots = sources
  .filter(({ source }) => importsDollar.test(source))
  .flatMap(({ file, source }) =>
    [...source.matchAll(/(?<![\w$.])\$\((\w+)\)/g)].map(([, fn]) => ({ file, fn }))
  );

describe("core's own QRLs", () => {
  it('are written with $() for the library build to compile', () => {
    const handBuilt = sources.filter(
      ({ file, source }) => !/^shared[/\\]qrl[/\\]/.test(file) && /\binlinedQrl\(/.test(source)
    );
    expect(handBuilt.map(({ file }) => file)).toEqual([]);
  });

  it.each(namedRoots)('$(fn) in $file passes a function declaration', ({ fn }) => {
    // The Rust optimizer's SSR output calls `.s(fn)` at the top of the module.
    expect(allSource).toMatch(new RegExp(`function ${fn}\\b`));
  });
});
