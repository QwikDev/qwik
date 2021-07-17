import type { BuildConfig } from './util';
import { access, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

export async function generatePackageJson(config: BuildConfig) {
  const pkgJsonRoot = join(config.rootDir, 'package.json');
  const pkgJsonDist = join(config.pkgDir, 'package.json');

  const pkg = JSON.parse(await readFile(pkgJsonRoot, 'utf-8'));

  const distPkg = {
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    license: pkg.license,
    main: './core.cjs',
    module: './core.mjs',
    types: './core.d.ts',
    type: 'module',
    exports: {
      '.': {
        import: './core.mjs',
        require: './core.cjs',
      },
      './core': {
        import: './core.mjs',
        require: './core.cjs',
      },
      './jsx-runtime': {
        import: './jsx-runtime.mjs',
        require: './jsx-runtime.cjs',
      },
      './optimizer': {
        import: './optimizer.mjs',
        require: './optimizer.cjs',
      },
      './server': {
        import: './testing/index.mjs',
        require: './testing/index.cjs',
      },
      './testing': {
        import: './testing/index.mjs',
        require: './testing/index.cjs',
      },
      './package.json': './package.json',
    },
    contributors: pkg.contributors,
    homepage: pkg.homepage,
    repository: pkg.repository,
    bugs: pkg.bugs,
    keywords: pkg.keywords,
    engines: pkg.engines,
  };

  const pkgContent = JSON.stringify(distPkg, null, 2);

  await writeFile(pkgJsonDist, pkgContent);

  console.log('👻', 'generate package.json');
}

export async function validatePackageJson(config: BuildConfig) {
  const pkgPath = join(config.pkgDir, 'package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));

  await Promise.all([
    validatePath(config, pkg.main),
    validatePath(config, pkg.module),
    validatePath(config, pkg.types),
  ]);

  const exportKeys = Object.keys(pkg.exports);

  await Promise.all(
    exportKeys.map(async (exportKey) => {
      const val = pkg.exports[exportKey];
      if (typeof val === 'string') {
        await validatePath(config, val);
      } else {
        await validatePath(config, val.import);
        await validatePath(config, val.require);
      }
    })
  );
}

async function validatePath(config: BuildConfig, path: string) {
  try {
    await access(join(config.pkgDir, path));
  } catch (e) {
    console.error(
      `Error validating path "${path}" inside of "${join(config.pkgDir, 'package.json')}"`
    );
    console.error(e);
    process.exit(1);
  }
}
