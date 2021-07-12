import { extname } from 'path';
import { Optimizer } from '@builder.io/qwik/optimizer';

const jestPreprocessor = {
  process(text: string, filePath: string, jestConfig: { rootDir: string }) {
    const ext = extname(filePath).toLowerCase();

    if (ext === '.d.ts') {
      return '';
    }

    if (this._shouldTransform(ext, text)) {
      const optimizer = this._getOptimizer(jestConfig.rootDir);

      const results = optimizer.transformModuleSync({
        text,
        filePath,
        module: 'cjs',
        sourcemap: 'inline',
      });

      return results.text;
    }

    return text;
  },

  getCacheKey(
    code: string,
    filePath: string,
    transformOptions: { instrument: boolean; rootDir: string; configString: string }
  ): string {
    if (!this._cacheKey) {
      const optimizer = this._getOptimizer(transformOptions.rootDir);
      const ts = optimizer.getTypeScriptSync();
      const tsconfig = optimizer.getTsconfigSync();

      this._cacheKey = JSON.stringify({
        n: process.version,
        t: ts.version,
        j: transformOptions.configString,
        i: transformOptions.instrument,
        cb: 2, // cache buster
        ...tsconfig,
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

  _getOptimizer(rootDir: string) {
    if (!this._optimizer) {
      this._optimizer = new Optimizer({
        rootDir,
        cache: false /* jest has its own cache */,
      });
    }
    return this._optimizer;
  },

  _optimizer: null as Optimizer | null,

  _cacheKey: null as string | null,
};

export default jestPreprocessor;
