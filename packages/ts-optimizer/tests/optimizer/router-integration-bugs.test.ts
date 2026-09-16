import { describe, expect, test } from 'vitest';

import { transformModule } from '../../src/index.js';
import { mkFilePath, mkSourceText } from '../../src/optimizer/types/brands.js';

describe('routes/<name>/index.tsx symbol-name disambiguation', () => {
  test('two sibling onClick$ handlers in routes/<dir>/index.tsx do not produce invalid symbol names', () => {
    const code = `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
    const count = useSignal(0);
    return (
        <main>
            <button onClick$={() => count.value++}>{count.value}</button>
            <button onClick$={() => console.log('two')}>two</button>
        </main>
    );
});
`;
    expect(() =>
      transformModule({
        srcDir: mkFilePath('/src'),
        input: [
          {
            path: mkFilePath('src/routes/index.tsx'),
            code: mkSourceText(code),
          },
        ],
        transpileTs: true,
        transpileJsx: true,
      })
    ).not.toThrow();
  });

  test('deeply-nested routes/<a>/<b>/index.tsx also disambiguates correctly', () => {
    const code = `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
    const count = useSignal(0);
    return (
        <button onClick$={() => count.value++}>{count.value}</button>
    );
});
`;
    const result = transformModule({
      srcDir: mkFilePath('/workspace/app'),
      input: [
        {
          path: mkFilePath('src/routes/admin/dashboard/index.tsx'),
          code: mkSourceText(code),
        },
      ],
      transpileTs: true,
      transpileJsx: true,
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.modules.length).toBeGreaterThan(0);
    for (const mod of result.modules) {
      if (mod.kind === 'segment') {
        expect(mod.segment.name).not.toMatch(/\./);
      }
    }
  });
});

describe('C02 only fires for enclosing-closure-scoped fn/class refs', () => {
  test('module-level fn referenced from a top-level useTask$ does not emit C02', () => {
    const code = `import { component$, useTask$ } from '@qwik.dev/core';

function helperFn() {
    return 42;
}

export default component$(() => {
    useTask$(() => {
        return helperFn();
    });
    return <div />;
});
`;
    const result = transformModule({
      srcDir: mkFilePath('/src'),
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(code),
        },
      ],
      transpileTs: true,
      transpileJsx: true,
    });
    const c02s = result.diagnostics.filter((d) => d.code === 'C02');
    expect(c02s).toEqual([]);
  });

  test('module-level class referenced from a top-level useTask$ does not emit C02', () => {
    const code = `import { component$, useTask$ } from '@qwik.dev/core';

class Helper {
    static answer() { return 42; }
}

export default component$(() => {
    useTask$(() => {
        return Helper.answer();
    });
    return <div />;
});
`;
    const result = transformModule({
      srcDir: mkFilePath('/src'),
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(code),
        },
      ],
      transpileTs: true,
      transpileJsx: true,
    });
    const c02s = result.diagnostics.filter((d) => d.code === 'C02');
    expect(c02s).toEqual([]);
  });

  test('fn declared INSIDE an enclosing component$ body, referenced from a nested $(), still emits C02', () => {
    const code = `import { $, component$ } from '@qwik.dev/core';
export const App = component$(() => {
    function hola() {
        console.log('hola');
    }
    return $(() => {
        hola();
        return <div />;
    });
});
`;
    const result = transformModule({
      srcDir: mkFilePath('/src'),
      input: [
        {
          path: mkFilePath('test.tsx'),
          code: mkSourceText(code),
        },
      ],
      transpileTs: true,
      transpileJsx: true,
    });
    const c02s = result.diagnostics.filter((d) => d.code === 'C02');
    expect(c02s.length).toBeGreaterThan(0);
    expect(c02s[0]!.message).toContain("'hola'");
  });
});

describe('single-consumer `const X = server$(…)` migrates to its one consumer', () => {
  const code = `import { component$, useSignal } from '@qwik.dev/core';
import { server$ } from '@qwik.dev/router';

const testServer$ = server$(() => console.log('HI'));

export default component$(() => {
	const count = useSignal(0);
	return (
		<main>
			<button onClick$={() => testServer$()}>{count.value}</button>
		</main>
	);
});
`;

  function run(isServer: boolean) {
    return transformModule({
      srcDir: mkFilePath('/proj'),
      input: [{ path: mkFilePath('/proj/src/routes/index.tsx'), code: mkSourceText(code) }],
      transpileTs: true,
      transpileJsx: true,
      explicitExtensions: true,
      preserveFilenames: true,
      mode: 'prod',
      isServer,
    });
  }

  for (const isServer of [true, false]) {
    test(`testServer$ is moved into the handler segment, not kept in the parent (isServer=${isServer})`, () => {
      const result = run(isServer);
      const parent = result.modules.find((m) => m.kind === 'parent') ?? result.modules[0]!;
      const handler = result.modules.find(
        (m) => m.kind === 'segment' && m.code.includes('testServer$()')
      );

      expect(handler, 'binding moved into its one consumer, self-contained').toBeDefined();
      expect(handler!.code).toMatch(/const testServer\$ = serverQrl\(q_/);
      expect(handler!.code).toMatch(/import \{ serverQrl \} from "@qwik\.dev\/router"/);
      expect(parent.code, 'parent no longer owns the binding').not.toMatch(/const testServer\$ =/);
      expect(parent.code, 'no dropped-binding `serverQrl(q_…);` statement').not.toMatch(
        /^\s*serverQrl\(/m
      );
    });
  }

  test('strip-aware: moved decl registers via `_noopQrl`, not a stripped-chunk import', () => {
    const result = transformModule({
      srcDir: mkFilePath('/proj'),
      input: [{ path: mkFilePath('/proj/src/routes/index.tsx'), code: mkSourceText(code) }],
      transpileTs: true,
      transpileJsx: true,
      explicitExtensions: true,
      preserveFilenames: true,
      mode: 'prod',
      isServer: false,
      stripCtxName: ['server'],
    });
    const handler = result.modules.find(
      (m) => m.kind === 'segment' && m.code.includes('testServer$()')
    );
    expect(handler, 'expected a handler segment consuming testServer$').toBeDefined();
    expect(handler!.code).toMatch(/const testServer\$ = serverQrl\(q_/);
    expect(handler!.code).toMatch(/_noopQrl\("s_/);
    expect(handler!.code).not.toMatch(/qrl\(\(\)\s*=>\s*import\(/);
  });
});
