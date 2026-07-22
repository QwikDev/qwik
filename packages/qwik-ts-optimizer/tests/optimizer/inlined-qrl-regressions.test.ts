import { describe, it, expect } from 'vitest';
import { transformModule } from '../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../src/optimizer/types/brands.js';

function findModule(modules: readonly TransformModule[], pathSubstr: string): TransformModule | undefined {
  return modules.find((m) => m.path.includes(pathSubstr));
}

describe('inlinedQrl migration', () => {
  it('attributes module-level decl references inside inlinedQrl bodies to the segment', () => {
    const input = `
import { componentQrl, inlinedQrl, useTaskQrl } from '@qwik.dev/core';

const helper = (v) => v * 2;

const Foo = componentQrl(inlinedQrl(() => {
    useTaskQrl(inlinedQrl(() => {
        return helper(1);
    }, "Foo_useWatch_aaa", []));
    return helper(2);
}, "Foo_component_bbb", []));
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.ts'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
    });

    const parent = findModule(result.modules, 'test.ts');
    expect(parent?.code).toBeTruthy();
    expect(parent!.code).toContain('export { helper as _auto_helper }');

    const innerSeg = findModule(result.modules, 'Foo_useWatch_aaa');
    expect(innerSeg?.code).toBeTruthy();
    expect(innerSeg!.code).toContain('_auto_helper as helper');

    const outerSeg = findModule(result.modules, 'Foo_component_bbb');
    expect(outerSeg?.code).toBeTruthy();
    expect(outerSeg!.code).toContain('_auto_helper as helper');
  });

  it('still treats a module-level decl referenced only at root as KEEP (no _auto_ export)', () => {
    const input = `
import { componentQrl, inlinedQrl } from '@qwik.dev/core';

const rootOnly = () => 1;
console.log(rootOnly());

const Foo = componentQrl(inlinedQrl(() => {
    return 42;
}, "Foo_component_ccc", []));
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.ts'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
    });

    const parent = findModule(result.modules, 'test.ts');
    expect(parent?.code).toBeTruthy();
    expect(parent!.code).not.toContain('_auto_rootOnly');
  });
});

describe('inlinedQrl segment imports', () => {
  it('does not emit bogus `import { *Qrl } from "@qwik.dev/core"` for user-named identifiers', () => {
    const input = `
import { componentQrl, inlinedQrl } from '@qwik.dev/core';

function qwikifyQrl(reactCmpQrl) {
    return componentQrl(inlinedQrl((props) => {
        const [reactCmpQrl] = useLexicalScope();
        return reactCmpQrl.resolve();
    }, "qwikifyQrl_component_ddd", [reactCmpQrl]));
}
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.ts'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
    });

    const seg = findModule(result.modules, 'qwikifyQrl_component_ddd');
    expect(seg?.code).toBeTruthy();
    expect(seg!.code).not.toContain('import { reactCmpQrl } from "@qwik.dev/core"');
  });

  it('still emits the legitimate `import { qrl }` for nested QRL declarations', () => {
    const input = `
import { component$, useTask$ } from '@qwik.dev/core';

const Foo = component$(() => {
    useTask$(() => { console.log('inner'); });
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
    });

    const outerSeg = result.modules.find((m) => m.kind === 'segment' && m.segment.ctxName === 'component$');
    expect(outerSeg?.code).toBeTruthy();
    expect(outerSeg!.code).toMatch(/import\s*\{\s*qrl\s*\}\s*from\s*"@qwik\.dev\/core"/);
  });
});
