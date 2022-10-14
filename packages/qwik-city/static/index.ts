/* eslint-disable no-console */
import type { StaticGeneratorOptions } from './types';

// @builder.io/qwik-city/static

/**
 * @alpha
 */
export async function generate(opts: StaticGeneratorOptions) {
  const isDeno = typeof Deno !== 'undefined';
  const isNode = !isDeno && typeof process !== 'undefined' && !!process.versions?.node;
  const entryModule = isDeno ? './deno.mjs' : isNode ? './node.mjs' : null;

  if (entryModule) {
    const ssgPlatform = await import(entryModule);
    await ssgPlatform.generate(opts);
  } else {
    throw new Error(`Unsupported platform`);
  }
}

declare const Deno: any;
