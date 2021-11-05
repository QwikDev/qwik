import { extname } from 'path';
import { transformSync, version as esbuildVersion } from 'esbuild';

const jestPreprocessor = {
  process(text: string, filePath: string, jestConfig: { rootDir: string }) {
    const ext = extname(filePath).toLowerCase();

    if (ext === '.d.ts') {
      return '';
    }

    if (this._shouldTransform(ext, text)) {
      const result = transformSync(text, {
        loader: 'tsx',
        format: 'cjs',
        target: 'es2018',
        jsxFactory: 'h',
        jsxFragment: 'Fragment',
        sourcemap: true,
        sourcesContent: false,
        sourcefile: filePath,
        sourceRoot: jestConfig.rootDir,
      });

      let { map, code } = result;

      map = {
        ...JSON.parse(result.map),
        sourcesContent: null,
      };

      code =
        code +
        '\n//# sourceMappingURL=data:application/json;base64,' +
        Buffer.from(JSON.stringify(map)).toString('base64');

      return { code, map };
    }

    return text;
  },

  getCacheKey(
    code: string,
    filePath: string,
    transformOptions: { instrument: boolean; rootDir: string; configString: string }
  ): string {
    if (!this._cacheKey) {
      this._cacheKey = JSON.stringify({
        n: process.version,
        e: esbuildVersion,
        j: transformOptions.configString,
        i: transformOptions.instrument,
        cb: 0, // cache buster
      });
    }

    return `${code}:${filePath}:${this._cacheKey}`;
  },

  _shouldTransform(ext: string, code: string) {
    if (ext === '.ts' || ext === '.tsx' || ext === '.jsx') {
      return true;
    }
    if (ext === '.mjs') {
      // es module extensions
      return true;
    }
    if (ext === '.js') {
      // there may be false positives here
      // but worst case scenario a commonjs file is transpiled to commonjs
      if (code.includes('import ') || code.includes('import.') || code.includes('import(')) {
        return true;
      }
      if (code.includes('export ')) {
        return true;
      }
    }
    return false;
  },

  _cacheKey: null as string | null,
};

export default jestPreprocessor;
