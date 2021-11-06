import type { TransformResult, TransformModule } from '.';
import { transformModules, transformModulesSync, transformFs, transformFsSync } from './transform';
import type { TransformModulesOptions, TransformFsOptions } from './types';

const TransformedOutputs = Symbol('TransformedOutputs');
const LastDirectoryResult = Symbol('LastDirectoryResult');

/**
 * @alpha
 */
export class Optimizer {
  private [LastDirectoryResult]: TransformResult | undefined;
  private [TransformedOutputs] = new Map<string, TransformModule>();

  /**
   * Transforms the input code string, does not access the file system.
   */
  async transformModules(opts: TransformModulesOptions) {
    const result = await transformModules(opts);
    return result;
  }

  /**
   * Transforms the input code string, does not access the file system.
   */
  transformModulesSync(opts: TransformModulesOptions) {
    const result = transformModulesSync(opts);
    return result;
  }

  /**
   * Transforms the directory from the file system.
   */
  async transformFs(opts: TransformFsOptions) {
    if (!this.isDirty) {
      return this[LastDirectoryResult]!;
    }

    const result = await transformFs(opts);
    this[LastDirectoryResult] = result;

    result.modules.forEach((output) => {
      const key = result.rootDir + "/" + output.path;
      this[TransformedOutputs].set(key, output);
    });

    return result;
  }

  /**
   * Transforms the directory from the file system.
   */
  transformFsSync(opts: TransformFsOptions) {
    if (!this.isDirty) {
      return this[LastDirectoryResult]!;
    }

    const result = transformFsSync(opts);
    this[LastDirectoryResult] = result;

    result.modules.forEach((output) => {
      const key = result.rootDir + "/" + output.path;
      this[TransformedOutputs].set(key, output);
    });

    return result;
  }

  getTransformedModule(path: string) {
    return this[TransformedOutputs].get(path);
  }


  set isDirty(isDirty: boolean) {
    if (isDirty) {
      this[LastDirectoryResult] = undefined;
    }
  }
  get isDirty(): boolean {
    return this[LastDirectoryResult] === undefined;
  }

  watchChange(id: string, event: 'create' | 'update' | 'delete') {
    this.isDirty = true;
    console.debug('watch change', id, event);
  }
}
