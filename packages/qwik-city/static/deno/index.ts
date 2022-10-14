import type { StaticGeneratorOptions } from '../types';
import { generate as coreGenerate } from '../core';
import { createSystem } from './deno-system';

export async function generate(opts: StaticGeneratorOptions) {
  try {
    const sys = await createSystem(opts);
    await coreGenerate(sys as any);
  } catch (e) {
    console.error(e);
    Deno.exit(1);
  }
}

export { createSystem };

declare const Deno: any;
