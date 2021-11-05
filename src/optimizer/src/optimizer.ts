import type { TransformResult, TransformedOutput } from '.';
import { transform, transformSync, transformDirectory, transformDirectorySync } from './transform';
import type { TransformInMemoryOptions, TransformFsOptions } from './types';

const TransformedOutputs = Symbol('TransformedOutputs');
const LastDirectoryResult = Symbol('LastDirectoryResult');

/**
 * @alpha
 */
export class Optimizer {
  private [LastDirectoryResult]: TransformResult | undefined;
  private [TransformedOutputs]: Map<string, TransformedOutput>;

  /**
   * Transforms the input code string, does not access the file system.
   */
  async transform(opts: TransformInMemoryOptions) {
    const result = await transform(opts);
    return result;
  }

  /**
   * Transforms the input code string, does not access the file system.
   */
  transformSync(opts: TransformInMemoryOptions) {
    const result = transformSync(opts);
    return result;
  }

  /**
   * Transforms the directory from the file system.
   */
  async transformFs(opts: TransformFsOptions) {
    if (!this.isDirty) {
      return this[LastDirectoryResult]!;
    }

    const result = await transformDirectory(opts);
    this[LastDirectoryResult] = result;

    result.output.forEach((output) => {
      this[TransformedOutputs].set(output.outFile, output);
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

    const result = transformDirectorySync(opts);
    this[LastDirectoryResult] = result;

    result.output.forEach((output) => {
      this[TransformedOutputs].set(output.outFile, output);
    });

    return result;
  }

  getTransformedModule(path: string) {
    return this[TransformedOutputs].get(path);
  }

  hasTransformedModule(path: string) {
    return this[TransformedOutputs].has(path);
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
