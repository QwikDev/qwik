import type { RoutingContext } from '../types';

export function createEntries(ctx: RoutingContext, c: string[]) {
  const isClient = ctx.target === 'client';

  const entries = [...ctx.entries, ...ctx.serviceWorkers];

  if (isClient && entries.length > 0) {
    // this is mainly created as a way to dynamically generate
    // more build entry files. The "e" export would never
    // actually be used at runtime.
    c.push(`\n/** Qwik Router Entries Entry */`);
    c.push(`export const e = () => import("@qwik-router-entries");\n`);
  }
}

export function generateQwikRouterEntries(ctx: RoutingContext) {
  // generate @qwik-router-entries
  const c: string[] = [];

  const entries = [...ctx.entries, ...ctx.serviceWorkers];

  c.push(`\n/** Qwik Router Entries (${entries.length}) */`);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    c.push(`export const ${entry.id} = () => import(${JSON.stringify(entry.filePath)});`);
  }

  return c.join('\n') + '\n';
}
