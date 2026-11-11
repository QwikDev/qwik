import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CORE_QRL_HASHES } from './qrl-utils';

const coreDir = join(__dirname, '../..');
const sourceFiles = (readdirSync(coreDir, { recursive: true }) as string[]).filter(
  (file) => /\.tsx?$/.test(file) && !/\.(unit|spec)\.tsx?$|[/\\](tests|bench)[/\\]/.test(file)
);
const sources = sourceFiles.map((file) => ({
  file,
  source: readFileSync(join(coreDir, file), 'utf8'),
}));
const allSource = sources.map(({ source }) => source).join('\n');
const sites = sources.flatMap(({ file, source }) =>
  [...source.matchAll(/_inlinedQrl\((\w+), '([^']+)'/g)].map(([, fn, name]) => ({ file, fn, name }))
);

describe("core's own QRL sites", () => {
  it('cover exactly CORE_QRL_HASHES', () => {
    const hashes = sites.map((site) => site.name.replace(/^q_/, '')).sort();
    expect(hashes).toEqual([...CORE_QRL_HASHES].sort());
  });

  it.each(sites)('$name in $file is named q_<hash> after a function declaration', (site) => {
    expect(site.name).toMatch(/^q_[a-zA-Z0-9]+$/);
    expect(site.name).not.toBe(site.fn);
    // The Rust optimizer's SSR output calls `.s(fn)` at the top of the module.
    expect(allSource).toMatch(new RegExp(`function ${site.fn}\\b`));
  });
});
