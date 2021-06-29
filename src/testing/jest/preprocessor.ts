import { extname } from 'path';
import { Optimizer } from '@builder.io/qwik/optimizer';

const jestPreprocessor = {
  process(code: string, filePath: string, jestConfig: { rootDir: string }) {
    const ext = extname(filePath).toLowerCase();

    if (ext === '.d.ts') {
      return '';
    }

    if (this._shouldTransform(ext, code)) {
      const optimizer = this._getOptimizer(jestConfig.rootDir);

      const results = optimizer.transformModule({
        code,
        filePath,
        module: 'cjs',
        sourcemap: 'inline',
      });

      return results.code;
    }

    return code;
  },

  getCacheKey(
    code: string,
    filePath: string,
    transformOptions: { instrument: boolean; rootDir: string; configString: string }
  ): string {
    // https://github.com/facebook/jest/blob/v23.6.0/packages/jest-runtime/src/script_transformer.js#L61-L90
    if (!this._cacheKey) {
      const optimizer = this._getOptimizer(transformOptions.rootDir);
      this._cacheKey = JSON.stringify({
        n: process.version,
        t: optimizer.getTypeScriptVersion(),
        j: transformOptions.configString,
        i: transformOptions.instrument,
        cb: 9, // cache buster
        ...optimizer.getTsConfigCompilerOptions(),
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
