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
  const result: SsgResult = (await ssgPlatform.generate(opts)) as any;
  return result;
}

export type {
  SsgOptions as StaticGenerateOptions,
  SsgRenderOptions,
  SsgResult as StaticGenerateResult,
};

function getEntryModule() {
  if (isDeno()) {
    return import('./deno');
  }
  if (isBun() || isNode()) {
    return import('./node');
  }
  throw new Error(`Unsupported platform`);
}

function isDeno() {
  return typeof Deno !== 'undefined';
}

function isBun() {
  return typeof Bun !== 'undefined';
}

function isNode() {
  return !isBun() && !isDeno() && typeof process !== 'undefined' && !!process.versions?.node;
}

declare const Deno: any;
declare const Bun: any;
