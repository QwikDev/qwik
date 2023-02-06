import type { StaticGenerateOptions, Deno } from '../types';

export async function generate(_opts: StaticGenerateOptions) {
  console.error(`Deno not implemented`);
  Deno.exit(1);
}
