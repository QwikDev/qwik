export class AppCommand {
  args: string[];
  task: string;
  cwd: string;
  private _rootDir: string | undefined;

  constructor(opts: { rootDir: string; cwd: string; args: string[] }) {
    this._rootDir = opts.rootDir;
    this.cwd = opts.cwd;
    this.args = opts.args.slice();
    this.task = this.args[0];
  }

  get rootDir() {
    if (!this._rootDir) {
      this._rootDir = '';
    }
    return this._rootDir;
  }

  set rootDir(rootDir) {
    this._rootDir = rootDir;
  }
}
