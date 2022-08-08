import type { BuildContext } from '../types';

export function createEntries(ctx: BuildContext, c: string[]) {
  const isClient = ctx.target === 'client';

  if (isClient && ctx.entries.length > 0) {
    c.push(`\n/** Qwik City Entries Entry */`);
    c.push(`export const entries = () => import("@qwik-city-entries");\n`);
  }
}

export function generateQwikCityEntries(ctx: BuildContext) {
  // generate @qwik-city-entries
  const c: string[] = [];

  c.push(`\n/** Qwik City Entries (${ctx.entries.length}) */`);
  for (let i = 0; i < ctx.entries.length; i++) {
    const entry = ctx.entries[i];
    c.push(`export const _${i} = () => import(${JSON.stringify(entry.filePath)});`);
  }

  return c.join('\n') + '\n';
}
