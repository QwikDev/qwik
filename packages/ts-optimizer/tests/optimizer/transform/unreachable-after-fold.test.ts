import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function transform(source: string, isServer: boolean, path = 'lib.js'): string {
  const result = transformModule({
    input: [{ path: mkFilePath(path), code: mkSourceText(source) }],
    srcDir: mkFilePath('.'),
    entryStrategy: { type: 'segment' },
    transpileTs: false,
    transpileJsx: false,
    isServer,
  });
  const parent = result.modules.find((m) => m.kind === 'parent') ?? result.modules[0];
  if (!parent) {
    throw new Error('no module emitted');
  }
  return parent.code;
}

/**
 * Folding `isServer` turns the guard into an unconditional exit, which makes everything after it
 * unreachable. Leaving those statements in place keeps their identifiers live, so the server-only
 * import they reference survives into the client bundle — the fold has to take the body with it.
 */
describe('statements made unreachable by a folded guard', () => {
  it('drops the server-only import behind an early-return guard', () => {
    const code = transform(
      `import { Auth } from 'server-only-lib';
import { isServer } from '@qwik.dev/core/build';

export function handler(req) {
  if (!isServer) return;
  const res = Auth(req);
  return res;
}
`,
      false
    );
    expect(code).not.toContain('server-only-lib');
    expect(code).not.toContain('@qwik.dev/core');
    expect(code).not.toContain('Auth(');
  });

  it('drops it behind a positive guard block too', () => {
    const code = transform(
      `import { Auth } from 'server-only-lib';
import { isServer } from '@qwik.dev/core/build';

export function handler(req) {
  if (isServer) {
    return Auth(req);
  }
  return null;
}
`,
      false
    );
    expect(code).not.toContain('server-only-lib');
  });

  it('keeps the code when the guard resolves the other way', () => {
    const code = transform(
      `import { Auth } from 'server-only-lib';
import { isServer } from '@qwik.dev/core/build';

export function handler(req) {
  if (!isServer) return;
  return Auth(req);
}
`,
      true
    );
    expect(code).toContain('server-only-lib');
    expect(code).toContain('Auth(');
  });

  it('drops it from a module-level ternary on the same constant', () => {
    const code = transform(
      `import { fetcher } from 'server-only-lib';
import { isServer } from '@qwik.dev/core/build';

export const customFetch = isServer ? fetcher : undefined;
`,
      false
    );
    expect(code).not.toContain('server-only-lib');
    expect(code).not.toContain('fetcher');
  });

  it('keeps an object-literal branch callable after folding', () => {
    const code = transform(
      `import { isServer } from '@qwik.dev/core/build';

export const make = () => (isServer ? { a: 1 } : { b: 2 });
`,
      false
    );
    // Unparenthesised `{ b: 2 }` in arrow-body position would parse as a block.
    expect(code).toMatch(/\(\s*\{\s*b:\s*2\s*\}\s*\)|return\s*\{\s*b:\s*2\s*\}/);
  });

  it('keeps a hoisted function declaration that follows the exit', () => {
    const code = transform(
      `import { isServer } from '@qwik.dev/core/build';

export function handler(req) {
  if (!isServer) return later(req);
  return 1;
  function later(r) {
    return r;
  }
}
`,
      false
    );
    expect(code).toContain('function later');
  });
});
