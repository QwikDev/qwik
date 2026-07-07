/**
 * Tests for const-replacement module.
 *
 * Verifies that replaceConstants() replaces isServer/isBrowser/isDev identifiers
 * imported from qwik packages with boolean literals.
 */

import { describe, it, expect } from 'vitest';
import MagicString from 'magic-string';
import { parseSync } from 'oxc-parser';
import { replaceConstants, foldConstantsInBodyText } from '../../../src/optimizer/rewrite/const-replacement.js';
import { collectImports } from '../../../src/optimizer/extraction/marker-detection.js';
import { transformModule } from '../../../src/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function runReplace(source: string, isServer?: boolean, isDev?: boolean) {
  const { program } = parseSync('test.tsx', source);
  const s = new MagicString(source);
  const importMap = collectImports(program);
  const result = replaceConstants(s, program, importMap, isServer, isDev);
  return { code: s.toString(), ...result };
}

function importMapOf(source: string) {
  const { program } = parseSync('test.tsx', source);
  return collectImports(program);
}

function parentCode(input: string, isServer?: boolean) {
  const result = transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
    srcDir: mkFilePath('.'),
    entryStrategy: { type: 'hoist' },
    minify: 'simplify',
    transpileTs: true,
    isServer,
  });
  return (result.modules.find((m) => m.kind === 'parent') ?? result.modules[0]!).code;
}

describe('replaceConstants', () => {
  it('replaces isServer with true and isBrowser with false when isServer=true', () => {
    const source = `import { isServer, isBrowser } from '@qwik.dev/core/build';
console.log(isServer, isBrowser);
`;
    const result = runReplace(source, true);
    expect(result.code).toContain('console.log(true, false)');
    expect(result.replacedCount).toBe(2);
  });

  it('replaces isServer with false and isBrowser with true when isServer=false', () => {
    const source = `import { isServer, isBrowser } from '@qwik.dev/core/build';
console.log(isServer, isBrowser);
`;
    const result = runReplace(source, false);
    expect(result.code).toContain('console.log(false, true)');
    expect(result.replacedCount).toBe(2);
  });

  it('does nothing when isServer is undefined', () => {
    const source = `import { isServer, isBrowser } from '@qwik.dev/core/build';
console.log(isServer, isBrowser);
`;
    const result = runReplace(source, undefined, undefined);
    expect(result.code).toContain('console.log(isServer, isBrowser)');
    expect(result.replacedCount).toBe(0);
  });

  it('replaces isDev with true when isDev=true', () => {
    const source = `import { isDev } from '@qwik.dev/core/build';
if (isDev) { console.log('dev'); }
`;
    const result = runReplace(source, undefined, true);
    expect(result.code).toContain('if (true)');
    expect(result.replacedCount).toBe(1);
  });

  it('replaces isDev with false when isDev=false', () => {
    const source = `import { isDev } from '@qwik.dev/core/build';
if (isDev) { console.log('dev'); }
`;
    const result = runReplace(source, undefined, false);
    expect(result.code).toContain('if (false)');
    expect(result.replacedCount).toBe(1);
  });

  it('does NOT replace user-defined isServer variable', () => {
    const source = `const isServer = true;
console.log(isServer);
`;
    const result = runReplace(source, true);
    // isServer here is not imported from qwik, so it should NOT be replaced
    expect(result.code).toBe(source);
    expect(result.replacedCount).toBe(0);
  });

  it('handles aliased imports (isServer as isServer2)', () => {
    const source = `import { isServer as isServer2 } from '@qwik.dev/core';
console.log(isServer2);
`;
    const result = runReplace(source, true);
    expect(result.code).toContain('console.log(true)');
    expect(result.replacedCount).toBe(1);
  });

  it('handles aliased isBrowser imports', () => {
    const source = `import { isBrowser as isb } from '@qwik.dev/core/build';
console.log(isb);
`;
    const result = runReplace(source, true);
    expect(result.code).toContain('console.log(false)');
    expect(result.replacedCount).toBe(1);
  });

  // `replaceConstants` substitutes usages but no longer removes the import
  // itself — import cleanup is owned by the parent rewrite (processImports +
  // the surviving-imports usage filter), which is what actually drops the
  // now-unreferenced binding. So this contract is asserted end-to-end through
  // `transformModule` rather than against `replaceConstants` in isolation.
  it('removes import statement for replaced identifiers', () => {
    const source = `import { isServer, isBrowser } from '@qwik.dev/core/build';
export const x = isServer ? 1 : 2;
export const y = isBrowser ? 3 : 4;
`;
    const result = transformModule({
      input: [{ path: mkFilePath('/src/test.tsx'), code: mkSourceText(source) }],
      srcDir: mkFilePath('/src'),
      mode: 'prod',
      isServer: true,
      transpileTs: true,
      minify: 'simplify',
    });
    const parent = result.modules.find((m) => m.kind === 'parent') ?? result.modules[0]!;
    expect(parent.code).not.toContain('import { isServer, isBrowser }');
    // Fully gone — usages substituted with literals, binding dropped.
    expect(/\bisServer\b/.test(parent.code)).toBe(false);
  });

  it('keeps non-replaced specifiers in a mixed import', () => {
    // At the replaceConstants level the import is left intact (the pipeline's
    // usage filter handles removal); isDev is neither replaced nor dropped here.
    const source = `import { isServer, isBrowser, isDev } from '@qwik.dev/core/build';
console.log(isServer, isBrowser, isDev);
`;
    // Only replacing isServer/isBrowser (isServer=true), not isDev (isDev undefined)
    const result = runReplace(source, true, undefined);
    expect(result.code).toContain('console.log(true, false, isDev)');
    // isDev still present (in the untouched import + the usage).
    expect(result.code).toContain('isDev');
  });

  it('handles @builder.io/qwik/build source', () => {
    const source = `import { isServer } from '@builder.io/qwik/build';
console.log(isServer);
`;
    const result = runReplace(source, true);
    expect(result.code).toContain('console.log(true)');
    expect(result.replacedCount).toBe(1);
  });

  it('handles isServer from @qwik.dev/core (not just /build)', () => {
    const source = `import { isServer } from '@qwik.dev/core';
console.log(isServer);
`;
    const result = runReplace(source, false);
    expect(result.code).toContain('console.log(false)');
    expect(result.replacedCount).toBe(1);
  });

  it('replaces multiple references of the same identifier', () => {
    const source = `import { isServer } from '@qwik.dev/core/build';
if (isServer) { foo(); }
if (isServer) { bar(); }
`;
    const result = runReplace(source, true);
    expect(result.code).toContain('if (true) { foo(); }');
    expect(result.code).toContain('if (true) { bar(); }');
    expect(result.replacedCount).toBe(2);
  });
});

describe('foldConstantsInBodyText', () => {
  it('folds isBrowser to false in a standalone body when isServer=true', () => {
    const importMap = importMapOf(`import { isBrowser } from '@qwik.dev/core';`);
    const out = foldConstantsInBodyText(`() => { if (isBrowser) { load(); } return 1; }`, importMap, true, undefined);
    expect(out).toContain('if (false)');
    expect(/\bisBrowser\b/.test(out)).toBe(false);
  });

  it('folds isServer to true and negates isBrowser to false on a server build', () => {
    const importMap = importMapOf(`import { isServer, isBrowser } from '@qwik.dev/core/build';`);
    const out = foldConstantsInBodyText(`() => [isServer, isBrowser]`, importMap, true, undefined);
    expect(out).toContain('[true, false]');
  });

  it('leaves isDev untouched when isDev is undefined', () => {
    const importMap = importMapOf(`import { isServer, isDev } from '@qwik.dev/core';`);
    const out = foldConstantsInBodyText(`() => [isServer, isDev]`, importMap, true, undefined);
    expect(out).toContain('[true, isDev]');
  });

  it('does not fold a member-access property of the same name', () => {
    const importMap = importMapOf(`import { isServer } from '@qwik.dev/core';`);
    const out = foldConstantsInBodyText(`() => obj.isServer`, importMap, true, undefined);
    expect(out).toContain('obj.isServer');
  });

  it('returns the body unchanged when no const-source import matches', () => {
    const importMap = importMapOf(`import { isServer } from 'some-other-lib';`);
    const body = `() => { if (isServer) { load(); } }`;
    expect(foldConstantsInBodyText(body, importMap, true, undefined)).toBe(body);
  });

  it('returns the body unchanged when isServer and isDev are both undefined', () => {
    const importMap = importMapOf(`import { isServer } from '@qwik.dev/core';`);
    const body = `() => { if (isServer) { load(); } }`;
    expect(foldConstantsInBodyText(body, importMap, undefined, undefined)).toBe(body);
  });
});

describe('const folding reaches hoist/inline strategy bodies', () => {
  it('folds isBrowser inside a hoisted marker body and drops the dead-branch-only import', () => {
    const input = `
import { component$, isBrowser } from '@qwik.dev/core';
import { routes } from '@app-config';
export const C = component$(() => {
  if (isBrowser) { register(routes); }
  return <div>hi</div>;
});
`;
    const code = parentCode(input, true);
    expect(/\bisBrowser\b/.test(code)).toBe(false);
    expect(code).not.toContain('if (false)');
    expect(code).not.toContain('@app-config');
  });

  it('keeps the client branch and drops the server branch when isServer=false', () => {
    const input = `
import { component$, isServer } from '@qwik.dev/core';
export const C = component$(() => {
  if (isServer) { serverOnly(); } else { clientOnly(); }
  return <div>hi</div>;
});
`;
    const code = parentCode(input, false);
    expect(/\bisServer\b/.test(code)).toBe(false);
    expect(code).toContain('clientOnly()');
    expect(code).not.toContain('serverOnly()');
  });
});
