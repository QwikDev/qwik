import type { PlatformStaticGenerateOptions } from '../types';

export async function generate(_opts: PlatformStaticGenerateOptions) {
  console.error(`Deno not implemented`);
  Deno.exit(1);
}

declare const Deno: any;
