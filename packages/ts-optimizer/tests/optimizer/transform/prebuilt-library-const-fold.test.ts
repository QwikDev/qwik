import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

// Shape of a published Qwik library: already optimizer output, so its QRLs are
// pre-baked `inlinedQrl` and its server-only work sits behind an isServer guard.
const PREBUILT_LIB = `import { globalActionQrl } from "@builder.io/qwik-city";
import { inlinedQrl, useLexicalScope } from "@builder.io/qwik";
import { Auth } from "@auth/core";
import { isServer } from "@builder.io/qwik/build";

async function authAction(req, opts) {
  const res = await Auth(req, opts);
  return res;
}

function LibQrl(opts) {
  const useSignIn = globalActionQrl(/* @__PURE__ */ inlinedQrl(async (x) => {
    const [o] = useLexicalScope();
    return authAction(x, o);
  }, "LibQrl_useSignIn_globalAction_abc", [opts]));
  const onRequest = async (req) => {
    if (!isServer) return;
    return authAction(req, opts);
  };
  return { useSignIn, onRequest };
}
export { LibQrl };
`;

function parentCode(source: string, isServer: boolean): string {
  const result = transformModule({
    input: [{ path: mkFilePath('lib.qwik.js'), code: mkSourceText(source) }],
    srcDir: mkFilePath('.'),
    entryStrategy: { type: 'segment' },
    transpileTs: false,
    transpileJsx: false,
    isServer,
  });
  const parent = result.modules.find((m) => m.kind === 'parent');
  if (!parent) {
    throw new Error('parent module not found');
  }
  return parent.code;
}

/**
 * Folding the guard away here would leave the statements it protected in place but unreachable, and
 * a bundler still counts their identifiers as live — which drags the whole server-only dependency
 * into the client graph. The bundler folds `isServer` itself, so leaving the guard alone is what
 * lets it drop the code and the import.
 */
describe('const folding leaves prebuilt library output alone', () => {
  it('keeps the isServer guard instead of collapsing it to a bare return', () => {
    const code = parentCode(PREBUILT_LIB, false);
    expect(code).toMatch(/if\s*\(!isServer\)\s*return;/);
    expect(code).not.toMatch(/^\s*return;\s*$\n\s*const res = await Auth/m);
  });

  it('does not fold the guard on the server build either', () => {
    expect(parentCode(PREBUILT_LIB, true)).toMatch(/if\s*\(!isServer\)\s*return;/);
  });

  it('still folds isServer in ordinary application code', () => {
    const result = transformModule({
      input: [
        {
          path: mkFilePath('app.tsx'),
          code: mkSourceText(`import { component$ } from '@qwik.dev/core';
import { isServer } from '@qwik.dev/core/build';
export const C = component$(() => {
  if (isServer) {
    serverOnly();
  }
  return null;
});
`),
        },
      ],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'segment' },
      transpileTs: true,
      transpileJsx: true,
      isServer: false,
    });
    const segment = result.modules.find((m) => m.kind === 'segment');
    if (!segment) {
      throw new Error('segment module not found');
    }
    expect(segment.code).not.toMatch(/\bisServer\b/);
    expect(segment.code).not.toMatch(/serverOnly/);
  });
});
