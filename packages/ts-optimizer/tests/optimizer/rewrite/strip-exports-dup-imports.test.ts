import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function transform(source: string, stripExports: string[]) {
  return transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(source) }],
    srcDir: mkFilePath('.'),
    entryStrategy: { type: 'smart' },
    minify: 'simplify',
    transpileTs: true,
    transpileJsx: true,
    mode: 'prod',
    isServer: false,
    stripExports,
  });
}

function duplicateImportBindings(code: string): string[] {
  const seen = new Set<string>();
  const dups: string[] = [];
  for (const line of code.split('\n')) {
    if (!line.trim().startsWith('import')) continue;
    const braces = line.match(/\{([^}]*)\}/);
    if (!braces) continue;
    for (const raw of braces[1].split(',')) {
      const name = raw
        .replace(/\btype\b/, '')
        .trim()
        .split(/\s+as\s+/)[0]
        .trim();
      if (!name) continue;
      if (seen.has(name)) dups.push(name);
      else seen.add(name);
    }
  }
  return dups;
}

const SOURCE = `import { component$, Slot, useContextProvider, useSignal } from "@qwik.dev/core";
import { type RequestHandler, routeLoader$, useLocation } from "@qwik.dev/router";
import { ctxId } from "./context";
export const onGet: RequestHandler = ({ cacheControl }) => {
  cacheControl({ maxAge: 5 });
};
export const useData = routeLoader$(async () => ({ ok: true }));
export default component$(() => {
  const sig = useSignal(0);
  const loc = useLocation();
  useContextProvider(ctxId, { sig });
  return <div data-p={loc.url.pathname}>{sig.value}<Slot /></div>;
});`;

describe('stripExports does not duplicate surviving imports', () => {
  const result = transform(SOURCE, ['onGet']);
  const parent = result.modules[0];

  it('emits no duplicate import bindings in the parent', () => {
    expect(duplicateImportBindings(parent.code), parent.code).toHaveLength(0);
  });

  it('emits a valid parent module', () => {
    const parsed = parseSync('parent.jsx', parent.code, { lang: 'jsx' });
    expect(parsed.errors, parent.code).toHaveLength(0);
  });

  it('still replaces the stripped export body with a throw', () => {
    expect(parent.code).toContain('Symbol removed by Qwik Optimizer');
  });
});
