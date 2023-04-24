import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { PackageJSON } from '../../../../../scripts/util';

export class AppCommand {
  args: string[];
  task: string;
  cwd: string;
  private _rootDir: string | undefined;
  private _rootPkgJson: PackageJSON | undefined;

  constructor(opts: { rootDir: string; cwd: string; args: string[] }) {
    this._rootDir = opts.rootDir;
    this.cwd = opts.cwd;
    this.args = opts.args.slice();
    this.task = this.args[0];
  }

  get rootDir() {
    if (!this._rootDir) {
      const fsRoot = resolve('/');
      let testDir = process.cwd();
      for (let i = 0; i < 20; i++) {
        const pkgPath = join(testDir, 'package.json');
        if (existsSync(pkgPath)) {
          this._rootDir = testDir;
          break;
        }
        if (testDir === fsRoot) {
          break;
        }
        testDir = dirname(testDir);
      }
      if (!this._rootDir) {
        throw new Error(`Unable to find Qwik app package.json`);
      }
    }
    return this._rootDir;
  }

  set rootDir(rootDir) {
    this._rootDir = rootDir;
  }

  get packageJson(): PackageJSON {
    if (!this._rootPkgJson) {
      const pkgJsonPath = join(this.rootDir, 'package.json');
      this._rootPkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    }
    return this._rootPkgJson!;
  }

  getArg(name: string): string | undefined {
    const key = `--${name}`;
    const matcher = new RegExp(`^${key}($|=)`);
    const index = this.args.findIndex((arg) => matcher.test(arg));
    if (index === -1) {
      return;
    }

    if (this.args[index].includes('=')) {
      return this.args[index].split('=')[1];
    }
    return this.args[index + 1];
  }
}
