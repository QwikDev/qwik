import { getImports, getImportsFromSource } from './prefetch';

describe('prefetch', () => {
  describe('getImportsFromSource', () => {
    it('should return a list of imports', () => {
      expect(getImportsFromSource(``)).toEqual([]);
      expect(
        getImportsFromSource(`
          import 'ignore_absolute_paths'
          import './foo';
          import {a, b} from "./bar"; 
          import * as foo from \`../baz\`
        `)
      ).toEqual(['./foo', './bar', '../baz']);
    });
  });

  describe('getImports', () => {
    const FILES: Record<string, string> = {
      './lib/base.js': `import '../root.js';`,
      './root.js': ``,
      './a.js': `import './lib/base.js'`,
    };
    async function readMockFile(path: string): Promise<string> {
      return FILES[path]!;
    }
    it('should return nothing', async () => {
      expect(await getImports('./a.js', readMockFile)).toEqual(['./lib/base.js', './root.js']);
    });
  });
});
