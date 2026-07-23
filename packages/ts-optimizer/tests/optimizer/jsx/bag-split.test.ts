import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function findParent(result: { modules: readonly TransformModule[] }): TransformModule {
  const parent = result.modules.find((m) => m.kind === 'parent');
  if (!parent) throw new Error('parent module not found');
  return parent;
}

describe('_jsxSplit bag split for _restProps spread + real const entry', () => {
  it('splits spread when a boolean-attribute const entry is present', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({some = 1+2, ...rest}) => {
  return <div {...rest} override>hi</div>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;

    expect(code).toMatch(/\{\s*\.\.\._getConstProps\(rest\),\s*override:\s*true\s*\}/);
    expect(code).toContain('..._getVarProps(rest)');
    expect(code).not.toMatch(
      /\{[^}]*\.\.\._getVarProps\([^}]*\.\.\._getConstProps[^}]*\}\s*,\s*\{\s*override/
    );
  });

  it('keeps merged-in-var when const bag only has event-handler routing', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({...rest}) => {
  const onClickHandler = () => console.log('clicked');
  return <input {...rest} bind:value={undefined} onClick$={onClickHandler}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    expect(code).toMatch(/\.\.\._getVarProps\(rest\)/);
    expect(code).toMatch(/\.\.\._getConstProps\(rest\)/);
    expect(code).toMatch(/\}\s*,\s*\{\s*"q-e:click"/);
  });

  it('keeps merged-in-var when there are no const entries', () => {
    const input = `
import { component$, useStore } from '@qwik.dev/core';
export const C = component$(({...rest}) => {
  const store = useStore({ x: 1 });
  return <div {...rest} class={store.x}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    expect(code).toMatch(/\.\.\._getVarProps\(rest\)/);
    expect(code).toMatch(/\.\.\._getConstProps\(rest\)/);
  });

  it('positions _getConstProps before const entries in const bag', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({...rest}) => {
  return <div {...rest} flag>x</div>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    expect(code).toMatch(/\.\.\._getConstProps\(rest\),\s*flag:\s*true/);
  });
});

describe('_jsxSplit component with single spread partitions const props', () => {
  const input = `
import { component$, useSignal } from '@qwik.dev/core';
import { Cmp } from './cmp';
export const C = component$((props) => {
  const open = useSignal(false);
  return <Cmp {...props} onClick$={open.value ? props.onClick$ : props.onDefault$} aria-hidden={!open.value} role="button" />;
});
`;

  function jsxSplitCall(): string {
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'segment' },
    });
    const seg = result.modules.find((m) => m.kind === 'segment' && /_jsxSplit\(Cmp/.test(m.code));
    if (!seg) throw new Error('Cmp _jsxSplit segment not found');
    const line = seg.code.split('\n').find((l) => l.includes('_jsxSplit(Cmp'));
    if (!line) throw new Error('_jsxSplit(Cmp ...) call not found');
    return line;
  }

  function bags(call: string): { varBag: string; constBag: string } {
    const open1 = call.indexOf('{');
    const close1 = call.indexOf('}', open1);
    const open2 = call.indexOf('{', close1);
    const close2 = call.indexOf('}', open2);
    return {
      varBag: call.slice(open1, close1 + 1),
      constBag: call.slice(open2, close2 + 1),
    };
  }

  it('routes reactive _fnSignal and literal into the const bag (not a null bag)', () => {
    const { constBag } = bags(jsxSplitCall());
    expect(constBag).toMatch(/"aria-hidden":\s*_fnSignal/);
    expect(constBag).toMatch(/role:\s*"button"/);
  });

  it('keeps the inline event handler and _getVarProps in the var bag', () => {
    const { varBag } = bags(jsxSplitCall());
    expect(varBag).toContain('..._getVarProps(props)');
    expect(varBag).toMatch(/onClick\$:/);
  });

  it('never leaves a reactive _fnSignal in the var bag', () => {
    const { varBag } = bags(jsxSplitCall());
    expect(varBag).not.toContain('_fnSignal');
  });
});
