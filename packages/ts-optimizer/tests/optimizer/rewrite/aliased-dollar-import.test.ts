import { describe, expect, test } from 'vitest';
import { transformModule } from '../../../src/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

// A bundled library chunk can export any symbol under the minified name `$`; only the Qwik
// marker import may be stripped as consumed.
const LIB_SOURCE = `
import { $ as basePathname, b as loadRoute } from "./chunks/head.qwik.mjs";
import { componentQrl, inlinedQrl, _jsxSorted } from "@qwik.dev/core";
export const prefetchBase = () => loadRoute(basePathname);
export const Cmp = /*#__PURE__*/ componentQrl(/*#__PURE__*/ inlinedQrl(() => _jsxSorted("div", null, null, null, 3, null), "Cmp_component_x"));
`;

function runTransform(source: string) {
  return transformModule({
    srcDir: mkFilePath('/workspace/app'),
    input: [
      {
        path: mkFilePath('/workspace/node_modules/@qwik.dev/router/lib/index.qwik.mjs'),
        code: mkSourceText(source),
      },
    ],
    transpileTs: true,
    transpileJsx: true,
    explicitExtensions: true,
    preserveFilenames: true,
    mode: 'prod',
    minify: 'simplify',
  });
}

describe('aliased `$` import from a non-Qwik source', () => {
  test('keeps `$ as basePathname` when the module also extracts markers', () => {
    const result = runTransform(LIB_SOURCE);
    const parent = result.modules.find((m) => m.kind === 'parent')!;
    expect(parent.code).toContain('$ as basePathname');
    expect(parent.code).toContain('loadRoute(basePathname)');
  });
});
