import type { SsgOptions } from '../types';

export async function generate(_opts: SsgOptions) {
  console.error(`Deno not implemented`);
  Deno.exit(1);
}

declare const Deno: any;
