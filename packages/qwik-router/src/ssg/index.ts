import type { SsgOptions, SsgRenderOptions, SsgResult } from './types';

// @qwik.dev/router/ssg

/**
 * Use this function when SSG should be generated from another module, such as a Vite plugin. This
 * function's should be passed the paths of the entry module and Qwik Router Plan.
 *
 * @public
 */
export async function generate(opts: SsgOptions) {
  const ssgPlatform = await getEntryModule();
  const result: SsgResult = await ssgPlatform.generate(opts);
  return result;
}

export type {
  SsgOptions as StaticGenerateOptions,
  SsgRenderOptions,
  SsgResult as StaticGenerateResult,
};

async function getEntryModule() {
  try {
    return await import('./node');
  } catch (e) {
    console.error(e);
    throw new Error(`Could not load SSG platform`, { cause: e });
  }
}
