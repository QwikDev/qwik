import type { StaticGenerateOptions } from '../types';

export async function generate(_opts: StaticGenerateOptions) {
  console.error(`Deno not implemented`);
  Deno.exit(1);
}

declare const Deno: any;
