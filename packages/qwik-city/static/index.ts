/* eslint-disable no-console */
import type {
  PlatformStaticGenerateOptions,
  StaticGenerateRenderOptions,
  StaticGenerateOptions,
  StaticGenerateResult,
} from './types';

// @builder.io/qwik-city/static

/**
 * Use this function when SSG should be generated from another module, such as a Vite plugin.
 * This function's should be passed the paths of the entry module and Qwik City Plan.
 * @alpha
 */
export async function generate(opts: StaticGenerateOptions) {
  const ssgPlatform = await getEntryModule();
  const generateOpts: PlatformStaticGenerateOptions = {
    currentFile: getCurrentPath(),
    ...opts,
  };

  const result: StaticGenerateResult = await ssgPlatform.generate(generateOpts);
  return result;
}

export { StaticGenerateOptions, StaticGenerateRenderOptions };

function getEntryModulePath() {
  if (isDeno()) {
    return './deno.mjs';
  }
  if (isNode()) {
    if (typeof require === 'function') {
      return './node.cjs';
    }
    return './node.mjs';
  }
  throw new Error(`Unsupported platform`);
}

function getEntryModule() {
  const entryModule = getEntryModulePath();
  if (typeof require === 'function') {
    return require(entryModule);
  }
  return import(entryModule);
}

function getCurrentPath() {
  if (typeof __filename === 'string') {
    return __filename;
  }
  return import.meta.url;
}

function isDeno() {
  return typeof Deno !== 'undefined';
}

function isNode() {
  return !isDeno() && typeof process !== 'undefined' && !!process.versions?.node;
}

declare const Deno: any;
