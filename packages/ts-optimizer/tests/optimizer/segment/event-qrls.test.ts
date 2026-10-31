import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

const fixture = readFileSync(
  new URL(
    '../../../../optimizer/core/src/fixtures/smart-event-qrl-references.tsx',
    import.meta.url
  ),
  'utf8'
);
function optimize(
  code: string,
  strategy: 'smart' | 'component' = 'smart',
  mode: 'prod' | 'lib' = 'prod'
) {
  return transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    entryStrategy: { type: strategy },
    mode,
    transpileTs: true,
    transpileJsx: true,
  });
}

describe('event-only QRL references', () => {
  it.each(
    [false, true].flatMap((library) => ['View', 'getter'].map((name) => ({ library, name })))
  )('keeps $name in the render group (library=$library)', ({ library, name }) => {
    let code = readFileSync(
      new URL(
        '../../../../optimizer/core/src/fixtures/smart-event-qrl-render-consumers.tsx',
        import.meta.url
      ),
      'utf8'
    );
    if (library) {
      code = optimize(code, 'smart', 'lib')
        .modules.map((mod) => mod.code)
        .join('\n');
    }
    const segments = optimize(code).modules.flatMap((mod) =>
      mod.kind === 'segment' ? [mod.segment] : []
    );
    const parent = segments.find((segment) => segment.ctxName === 'component$')!;
    const consumer = segments.find((segment) => segment.displayName.endsWith('_' + name))!;
    expect(consumer.entry).toBe(parent.entry);
  });

  it('follows a JSX tag alias to its render use', () => {
    const result = optimize(`import {$ as lazy,component$,useSignal} from '@qwik.dev/core';
      export const App=component$(()=>{const count=useSignal(0);const read=lazy(()=> <span>{count.value}</span>);const View=read;return <><button onClick$={read}/><View/></>;});`);
    const segments = result.modules.flatMap((mod) => (mod.kind === 'segment' ? [mod.segment] : []));
    expect(segments.find((segment) => segment.displayName.endsWith('_read'))!.entry).toBe(
      segments.find((segment) => segment.ctxName === 'component$')!.entry
    );
  });

  it('separates event references and preserves render calls through hooks and helpers', () => {
    const segments = optimize(fixture).modules.flatMap((mod) =>
      mod.kind === 'segment' ? [mod.segment] : []
    );
    for (const name of ['click', 'wrapped']) {
      const segment = segments.find((segment) => segment.displayName.endsWith('_' + name))!;
      expect(segment.entry, name).toBe(`segment_${segment.hash}`);
      expect(segment.ctxKind).toBe('function');
      expect(segment.ctxName).toBe('$');
    }
    for (const name of ['render', 'hookRead', 'mixed', 'custom']) {
      expect(
        segments.find((segment) => segment.displayName.endsWith('_' + name))!.entry,
        name
      ).toBe('test.tsx_entry_App');
    }
  });

  it.each(['call', 'hook', 'unknown', 'factory', 'component'] as const)(
    'preserves %s render consumers',
    (kind) => {
      const consumption = {
        call: 'run();',
        hook: 'useAnything(run);',
        unknown: 'unknown(run);',
        factory: '',
        component: '',
      }[kind];
      const jsx =
        kind === 'factory'
          ? '<button onClick$={run()} />'
          : kind === 'component'
            ? '<Child onClick$={run} />'
            : '<button onClick$={run} />';
      const result = optimize(
        `import { $, component$, useSignal } from '@qwik.dev/core'; function useAnything(fn) { return fn(); } export const App=component$(()=>{const state=useSignal(0); const run=$(()=>state.value); ${consumption} return ${jsx};});`
      );
      const run = result.modules.find(
        (mod) => mod.kind === 'segment' && mod.segment.ctxName === '$'
      );
      expect(run?.kind === 'segment' && run.segment.entry).toBe('test.tsx_entry_App');
    }
  );

  it.each([
    ['alias', '', true],
    ['(alias)', '', true],
    ['[alias]', '', true],
    ['enabled ? alias : alias', '', true],
    ['() => alias()', '', true],
    ['alias', 'alias();', false],
    ['alias', 'unknown(alias);', false],
  ] as const)('tracks aliased producers and event consumers: %s %s', (event, render, separated) => {
    const result = optimize(`import { $ as defer, component$, useSignal } from '@qwik.dev/core';
      export const App = component$(() => {
        const count = useSignal(0);
        const click = defer(() => count.value++);
        const alias = click;
        ${render}
        return <button onClick$={${event}} />;
      });`);
    const callback = result.modules
      .flatMap((mod) => (mod.kind === 'segment' ? [mod.segment] : []))
      .find((segment) => segment.displayName.endsWith('_click'))!;
    expect(callback.entry === `segment_${callback.hash}`).toBe(separated);
  });

  it('uses smart analysis when entryStrategy is omitted', () => {
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(fixture) }],
      srcDir: mkFilePath('.'),
      mode: 'prod',
      transpileTs: true,
      transpileJsx: true,
    });
    const click = result.modules
      .flatMap((mod) => (mod.kind === 'segment' ? [mod.segment] : []))
      .find((segment) => segment.displayName.endsWith('_click'))!;
    expect(click.entry).toBe(`segment_${click.hash}`);
  });

  it('does not change component strategy', () => {
    const segments = optimize(fixture, 'component').modules.flatMap((mod) =>
      mod.kind === 'segment' ? [mod.segment] : []
    );
    expect(segments.find((segment) => segment.displayName.endsWith('_click'))!.entry).toBe(
      'test.tsx_entry_App'
    );
  });

  it('resolves shadowed aliases independently', () => {
    const result = optimize(
      `import {$,component$,useSignal} from '@qwik.dev/core'; export const App=component$(()=>{const state=useSignal(0);const click=$(()=>state.value++);{const click=$(()=>state.value);click();}const alias=click;return <button onClick$={alias}/>;});`
    );
    const callbacks = result.modules.flatMap((mod) =>
      mod.kind === 'segment' && mod.segment.ctxName === '$' ? [mod.segment] : []
    );
    expect(callbacks.filter((segment) => segment.entry === `segment_${segment.hash}`)).toHaveLength(
      1
    );
    expect(callbacks.filter((segment) => segment.entry === 'test.tsx_entry_App')).toHaveLength(1);
  });

  it('preserves reference usage through compiled library output', () => {
    const lib = optimize(
      `import {$,component$,useSignal} from '@qwik.dev/core'; export const App=component$(()=>{const state=useSignal(0);const click=$(()=>console.log('EVENT_HEAVY',state.value));const read=$(()=>state.value);read();return <button onClick$={click}/>;});`,
      'smart',
      'lib'
    );
    const result = optimize(lib.modules.map((mod) => mod.code).join('\n'));
    const click = result.modules.find(
      (mod) => mod.kind === 'segment' && mod.code.includes('EVENT_HEAVY')
    );
    expect(click?.kind === 'segment' && click.segment.entry).toBe(
      click?.kind === 'segment' ? `segment_${click.segment.hash}` : 'missing'
    );
  });
});
