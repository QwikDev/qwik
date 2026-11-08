/* eslint-disable no-new-func -- Execute generated optimizer output. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSnapshot } from '../../../src/testing/snapshot-parser.js';
import { SNAP_DIR } from '../../rust-snapshots.js';
import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';
import type { TransformModulesOptions } from '../../../src/optimizer/types/types.js';

// Handlers in an inner `.map()` that capture the outer loop's item (#9190).
// The `.w([…])` binding has to live inside the outer loop callback, where the
// outer item is in scope — at component scope it throws a ReferenceError
// during SSR.

const NESTED_EXPRESSION_BODY = `
import { component$ } from '@qwik.dev/core';
export const Facets = component$((props: any) => {
  return (
    <div>
      {props.facets.map((facet: any) => (
        <div key={facet.slug}>
          {facet.items.map((item: any) => (
            <label key={item.slug}>
              <input type="checkbox" onChange$={() => props.toggle$(facet.slug, item.slug)} />
            </label>
          ))}
        </div>
      ))}
    </div>
  );
});
`;

const NESTED_EXPRESSION_BODIED_COMPONENT = `
import { component$ } from '@qwik.dev/core';
export const Facets = component$((props: any) => (
  <div>
    {props.facets.map((facet: any) => (
      <div key={facet.slug}>
        {facet.items.map((item: any) => (
          <label key={item.slug}>
            <input type="checkbox" onChange$={() => props.toggle$(facet.slug, item.slug)} />
          </label>
        ))}
      </div>
    ))}
  </div>
));
`;

const COMPACT_EXPRESSION_BODIED_COMPONENT = `
import { component$ } from '@qwik.dev/core';
export const Facets = component$((p)=>p.map((f)=>(
  <div>{f.items.map((i) => <input onChange$={() => p.toggle$(f.slug, i.slug)} />)}</div>
)));
`;

const NESTED_BLOCK_BODY_LOCAL = `
import { component$ } from '@qwik.dev/core';
export const Facets = component$((props: any) => {
  return (
    <div>
      {props.facets.map((facet: any) => {
        const slug = facet.slug;
        return (
          <div key={slug}>
            {facet.items.map((item: any) => (
              <input key={item.slug} onChange$={() => props.toggle$(slug, item.slug)} />
            ))}
          </div>
        );
      })}
    </div>
  );
});
`;

const NESTED_FOR_OF = `
import { component$ } from '@qwik.dev/core';
export const Facets = component$((props: any) => {
  const inputs: any[] = [];
  for (const facet of props.facets) {
    for (const item of facet.items) {
      inputs.push(<input onChange$={() => props.toggle$(facet.slug, item.slug)} />);
    }
  }
  return <div>{inputs}</div>;
});
`;

const SINGLE_LOOP = `
import { component$ } from '@qwik.dev/core';
export const List = component$((props: any) => {
  const prefix = props.prefix;
  return (
    <ul>
      {props.items.map((item: any) => (
        <li key={item.id} onClick$={() => props.select$(prefix, item.id)} />
      ))}
    </ul>
  );
});
`;

const SINGLE_LOOP_EXPRESSION_BODIED_COMPONENT = `
import { component$ } from '@qwik.dev/core';
export const List = component$((props: any) => (
  <ul>
    {props.items.map((item: any) => (
      <li key={item.id} onClick$={() => props.select$(item.id)} />
    ))}
  </ul>
));
`;

const COMMENTED_ARROW_BODY = (comment: string) => `
import { component$ } from '@qwik.dev/core';
export const Facets = component$((props: any) => {
  return props.facets.map((facet: any) => ${comment}
    (
      <div>
        {facet.items.map((item: any) => (
          <input onChange$={() => props.toggle$(facet.slug, item.slug)} />
        ))}
      </div>
    )
  );
});
`;

const SIBLING_NESTED_LOOPS = `
import { component$ } from '@qwik.dev/core';
export const Filters = component$((props: any) => {
  return (
    <>
      {props.facets.map((facet: any) => (
        <div>{facet.items.map((item: any) => (
          <input onChange$={() => props.toggle$(facet.slug, item.slug)} />
        ))}</div>
      ))}
      {props.groups.map((group: any) => (
        <div>{group.items.map((item: any) => (
          <input onChange$={() => props.toggle$(group.slug, item.slug)} />
        ))}</div>
      ))}
    </>
  );
});
`;

const ssrOptions: Partial<TransformModulesOptions> = {
  entryStrategy: { type: 'hoist' },
  isServer: true,
  stripCtxName: ['useClient', 'useBrowser', 'useVisibleTask', 'client', 'browser', 'event$'],
  stripEventHandlers: true,
  regCtxName: ['server'],
};

function transform(code: string, options: Partial<TransformModulesOptions>) {
  return transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    mode: 'prod',
    minify: 'simplify',
    transpileTs: true,
    transpileJsx: true,
    ...options,
  } as TransformModulesOptions);
}

/** The module holding the component body (the parent for hoist, the component segment otherwise). */
function componentCode(code: string, options: Partial<TransformModulesOptions>): string {
  const output = transform(code, options);
  const module = output.modules.find((m) => /\.map\(\(/.test(m.code));
  if (!module) {
    throw new Error('component body not found');
  }
  return module.code.replace(/\s+/g, ' ');
}

function expectBindingInsideOuterLoop(code: string, captures: string) {
  const outerLoop = code.indexOf('props.facets.map((facet) => {');
  const binding = code.search(new RegExp(`const \\w+ = q_\\w+\\.w\\(\\[ ?${captures} ?\\]\\);`));
  const innerLoop = code.indexOf('facet.items.map(');
  expect(outerLoop).toBeGreaterThan(-1);
  expect(binding).toBeGreaterThan(outerLoop);
  expect(innerLoop).toBeGreaterThan(binding);
  // The outer item keeps its name — no collision rename against a stray component-scope reference.
  expect(code).not.toMatch(/\bfacet1\b/);
}

describe('loop handler .w() bindings capturing an outer loop item (#9190)', () => {
  it('SSR hoist build: binds inside an expression-bodied outer callback', () => {
    expectBindingInsideOuterLoop(componentCode(NESTED_EXPRESSION_BODY, ssrOptions), 'facet, props');
  });

  it('hoist build without stripping: binds inside the outer callback', () => {
    expectBindingInsideOuterLoop(
      componentCode(NESTED_EXPRESSION_BODY, { entryStrategy: { type: 'hoist' } }),
      'facet, props'
    );
  });

  it('client segment build: resolves typed loop params to the outer callback', () => {
    expectBindingInsideOuterLoop(
      componentCode(NESTED_EXPRESSION_BODY, { entryStrategy: { type: 'smart' } }),
      'facet, props'
    );
  });

  it('SSR hoist build: binds after a local declared in a block-bodied outer callback', () => {
    const code = componentCode(NESTED_BLOCK_BODY_LOCAL, ssrOptions);
    const local = code.indexOf('const slug = facet.slug;');
    expect(local).toBeGreaterThan(code.indexOf('props.facets.map((facet) => {'));
    expectBindingInsideOuterLoop(code, 'props, slug');
    expect(code.search(/q_\w+\.w\(\[ ?props, slug ?\]\)/)).toBeGreaterThan(local);
    expect(code).not.toMatch(/\bslug1\b/);
  });

  it('binds inside the outer for-of body in SSR and client builds', () => {
    for (const options of [ssrOptions, { entryStrategy: { type: 'smart' } } as const]) {
      const output = transform(NESTED_FOR_OF, options);
      const module = output.modules.find((m) => m.code.includes('for (const facet of'));
      const code = module!.code.replace(/\s+/g, ' ');
      const outerLoop = code.indexOf('for (const facet of props.facets) {');
      const binding = code.search(/const \w+ = q_\w+\.w\(\[ ?facet, props ?\]\);/);
      expect(outerLoop).toBeGreaterThan(-1);
      expect(binding).toBeGreaterThan(outerLoop);
      expect(code.indexOf('for (const item of facet.items)')).toBeGreaterThan(binding);
    }
  });

  it('keeps component-scoped captures of a single loop at component scope', () => {
    for (const options of [ssrOptions, { entryStrategy: { type: 'smart' } } as const]) {
      const code = componentCode(SINGLE_LOOP, options);
      const binding = code.search(/const \w+ = q_\w+\.w\(\[ ?prefix, props ?\]\);/);
      expect(binding).toBeGreaterThan(code.indexOf('const prefix = props.prefix;'));
      expect(binding).toBeLessThan(code.indexOf('props.items.map('));
    }
  });

  it('binds inside the outer callback when the component returns JSX directly', () => {
    for (const options of [
      ssrOptions,
      { entryStrategy: { type: 'hoist' } } as const,
      { entryStrategy: { type: 'smart' } } as const,
    ]) {
      expectBindingInsideOuterLoop(
        componentCode(NESTED_EXPRESSION_BODIED_COMPONENT, options),
        'facet, props'
      );
    }
  });

  it('binds inside the outer callback when a compact component returns the loop directly', () => {
    for (const options of [ssrOptions, { entryStrategy: { type: 'smart' } } as const]) {
      const code = componentCode(COMPACT_EXPRESSION_BODIED_COMPONENT, options);
      const outerLoop = code.indexOf('p.map((f) => {');
      const binding = code.search(/const \w+ = q_\w+\.w\(\[ ?f, p ?\]\);/);
      expect(outerLoop).toBeGreaterThan(-1);
      expect(binding).toBeGreaterThan(outerLoop);
      expect(code.indexOf('f.items.map(')).toBeGreaterThan(binding);
    }
  });

  it('keeps component-scoped captures of a single loop when the component returns JSX directly', () => {
    for (const options of [ssrOptions, { entryStrategy: { type: 'smart' } } as const]) {
      const code = componentCode(SINGLE_LOOP_EXPRESSION_BODIED_COMPONENT, options);
      const componentBody = code.indexOf('(props) => {');
      const binding = code.search(/const \w+ = q_\w+\.w\(\[ ?props ?\]\);/);
      expect(componentBody).toBeGreaterThan(-1);
      expect(binding).toBeGreaterThan(componentBody);
      expect(binding).toBeLessThan(code.indexOf('props.items.map('));
    }
  });

  for (const comment of ['// some comment here', '/* => */']) {
    it(`keeps the JSX of an outer callback with \`${comment}\` after its arrow`, () => {
      for (const options of [ssrOptions, { entryStrategy: { type: 'smart' } } as const]) {
        const code = componentCode(COMMENTED_ARROW_BODY(comment), options);
        expect(code).not.toMatch(/return;/);
        expect(code).toMatch(/return \/\*#__PURE__\*\/ _jsxSorted\("div"/);
        expectBindingInsideOuterLoop(code, 'facet, props');
      }
    });
  }

  it('binds each sibling nested loop handler inside its own outer callback', () => {
    for (const options of [ssrOptions, { entryStrategy: { type: 'smart' } } as const]) {
      const code = componentCode(SIBLING_NESTED_LOOPS, options);
      const facets = code.indexOf('props.facets.map((facet) => {');
      const facetBinding = code.search(/const \w+ = q_\w+\.w\(\[ ?facet, props ?\]\);/);
      const facetItems = code.indexOf('facet.items.map(');
      const groups = code.indexOf('props.groups.map((group) => {');
      const groupBinding = code.search(/const \w+ = q_\w+\.w\(\[ ?group, props ?\]\);/);
      const groupItems = code.indexOf('group.items.map(');
      expect(facets).toBeGreaterThan(-1);
      expect(facetBinding).toBeGreaterThan(facets);
      expect(facetItems).toBeGreaterThan(facetBinding);
      expect(groups).toBeGreaterThan(facetItems);
      expect(groupBinding).toBeGreaterThan(groups);
      expect(groupItems).toBeGreaterThan(groupBinding);
    }
  });
});

const RENDER_ARROW_BEFORE_CAPTURE = `
import { component$ } from '@qwik.dev/core';
export const List = component$((props: any) => {
  const renderRows = () =>
    props.items.map((item: any) => <button onClick$={() => props.select$(prefix, item)} />);

  const prefix = props.prefix;
  return <div>{renderRows()}</div>;
});
`;

const RENDER_ARROW_BEFORE_CALLBACK_CAPTURE = `
import { component$ } from '@qwik.dev/core';
export const Facets = component$((props: any) => (
  <div>
    {props.facets.map((facet: any) => {
      const render = () =>
        facet.items.map((item: any) => <input onChange$={() => props.toggle$(label, item.slug)} />);
      const label = facet.label;
      return <div>{render()}</div>;
    })}
  </div>
));
`;

describe('loop handler .w() bindings and their captured locals', () => {
  it('binds after a capture declared below the arrow that renders the loop', () => {
    for (const options of [
      ssrOptions,
      { entryStrategy: { type: 'hoist' } } as const,
      { entryStrategy: { type: 'smart' } } as const,
    ]) {
      const code = componentCode(RENDER_ARROW_BEFORE_CAPTURE, options);
      const capture = code.indexOf('const prefix = props.prefix;');
      const binding = code.search(/const \w+ = q_\w+\.w\(\[ ?prefix, props ?\]\);/);
      expect(capture).toBeGreaterThan(-1);
      expect(binding).toBeGreaterThan(capture);
      expect(code.indexOf('return /*#__PURE__*/ _jsxSorted("div"')).toBeGreaterThan(binding);
    }
  });

  it('binds inside the outer callback after a capture declared below its render arrow', () => {
    for (const options of [
      ssrOptions,
      { entryStrategy: { type: 'hoist' } } as const,
      { entryStrategy: { type: 'smart' } } as const,
    ]) {
      const code = componentCode(RENDER_ARROW_BEFORE_CALLBACK_CAPTURE, options);
      const outerLoop = code.indexOf('props.facets.map((facet) => {');
      const capture = code.indexOf('const label = facet.label;');
      const binding = code.search(/const \w+ = q_\w+\.w\(\[ ?label, props ?\]\);/);
      expect(outerLoop).toBeGreaterThan(-1);
      expect(capture).toBeGreaterThan(outerLoop);
      expect(binding).toBeGreaterThan(capture);
      expect(code.indexOf('render()', binding)).toBeGreaterThan(binding);
      expect(code).not.toMatch(/\blabel1\b/);
    }
  });
});

function executeSegment(code: string, bindings: Record<string, unknown>) {
  const functionName = code.match(/export const (\w+)/)![1];
  const executable = code.replace(/^import .*;\n/gm, '').replace(/export /g, '');
  return new Function(...Object.keys(bindings), executable + ';return ' + functionName)(
    ...Object.values(bindings)
  );
}

it.each([
  {
    name: 'stable capture',
    setup: '',
    update: '',
    initialize: 'const prefix = props.prefix;',
    expectedPrefix: 'stable',
  },
  {
    name: 'shadowed write',
    setup: 'const setPrefix = prefix => { prefix = "ignored"; };',
    update: 'setPrefix(item.name);',
    initialize: 'const prefix = props.prefix;',
    expectedPrefix: 'stable',
  },
  {
    name: 'assignment before loop',
    setup: '',
    update: '',
    initialize: 'let prefix = props.prefix; prefix = "updated";',
    expectedPrefix: 'updated',
  },
  {
    name: 'computed destructuring key read',
    setup: '',
    update: 'let assigned; ({ [prefix]: assigned } = item);',
    initialize: 'const prefix = props.prefix;',
    expectedPrefix: 'stable',
  },
  {
    name: 'destructuring default read',
    setup: '',
    update: 'let assigned; ({ assigned = prefix } = item);',
    initialize: 'const prefix = props.prefix;',
    expectedPrefix: 'stable',
  },
  { name: 'direct assignment', setup: '', update: 'prefix = item.name;' },
  { name: 'array destructuring', setup: '', update: '[prefix] = [item.name];' },
  { name: 'object destructuring', setup: '', update: '({ name: prefix } = item);' },
  {
    name: 'callback passed to helper',
    setup: 'const run = action => action();',
    update: 'run(() => { prefix = item.name; });',
  },
  {
    name: 'local helper',
    setup: 'const setPrefix = value => { prefix = value; };',
    update: 'setPrefix(item.name);',
  },
  {
    name: 'helper alias',
    setup: 'const setPrefix = value => { prefix = value; }; const alias = setPrefix;',
    update: 'alias(item.name);',
  },
])(
  'delivers captures from $name while sharing the QRL',
  ({ setup, update, initialize = "let prefix = 'initial';", expectedPrefix }) => {
    const output = transform(
      `import { component$ } from '@qwik.dev/core';
export const List = component$((props) => {
 ${initialize} ${setup}
 return <div>{props.items.map(item => { ${update}
   return <button onClick$={() => props.select$(prefix, item.name)} />;
 })}</div>;
});`,
      { entryStrategy: { type: 'smart' } }
    );
    const component = output.modules.find((m) => m.code.includes('props.items.map'))!;
    const handler = output.modules.find((m) => m.code.includes('return props.select$'))!;
    let allocations = 0;
    const qrl = () => ({
      m() {
        return this;
      },
      w(captures: unknown[]) {
        allocations++;
        return { captures };
      },
    });
    const render = executeSegment(component.code, {
      qrl,
      _jsxSorted: (_tag: string, props: unknown, _constant: unknown, children: unknown) => ({
        props,
        children,
      }),
    });
    const selected: string[] = [];
    const tree = render({
      prefix: 'stable',
      items: [{ name: 'a' }, { name: 'b' }],
      select$: (prefix: string, name: string) => selected.push(prefix + ':' + name),
    });
    const buttons = tree.children;
    expect(buttons[0].props['q-e:click']).toBe(buttons[1].props['q-e:click']);
    expect(allocations).toBe(1);
    if (expectedPrefix === 'stable') {
      expect(buttons.every((button: any) => button.props['q:ps'] === undefined)).toBe(true);
    }
    for (const button of buttons) {
      const captures = { _: button.props['q-e:click'].captures };
      const invoke = executeSegment(handler.code, { _capturesObj: captures });
      invoke(null, null, ...(button.props['q:ps'] ?? [button.props['q:p']]));
    }
    expect(selected).toEqual([`${expectedPrefix ?? 'a'}:a`, `${expectedPrefix ?? 'b'}:b`]);
  }
);

it.each(['test', 'prod'] as const)('keeps capture slots local in %s mode', (mode) => {
  const output = transform(
    `import { component$ } from '@qwik.dev/core';

export const List = component$((props) => {
  let prefix = props.prefix;
  prefix = \`\${prefix}!\`;
  return (
    <ul>
      {props.items.map((item) => (
        <li key={item.id} onClick$={() => props.select$(prefix, item.id)} />
      ))}
    </ul>
  );
});

export const Groups = component$((props) => (
  <div>
    {props.groups.map((group) => {
      let label = group.label;
      label = label.toUpperCase();
      return group.items.map((item) => (
        <button key={item.id} onClick$={() => props.select$(label, item.id)} />
      ));
    })}
  </div>
));`,
    { mode, entryStrategy: { type: 'smart' } }
  );
  const component = output.modules.find(
    (m) =>
      m.kind === 'segment' &&
      m.segment.ctxKind === 'function' &&
      m.segment.displayName.includes('Groups_component')
  )!;
  const handler = output.modules.find(
    (m) =>
      m.kind === 'segment' &&
      m.segment.ctxKind === 'eventHandler' &&
      m.segment.displayName.includes('Groups_component')
  )!;
  const selected: string[] = [];
  const qrl = () => ({
    m() {
      return this;
    },
    w(captures: unknown[]) {
      return { captures };
    },
  });
  const render = executeSegment(component.code, {
    qrl,
    _jsxSorted: (_tag: string, props: unknown, _constant: unknown, children: unknown) => ({
      props,
      children,
    }),
  });
  const tree = render({
    groups: [{ label: 'group', items: [{ id: 'a' }, { id: 'b' }] }],
    select$: (label: string, name: string) => selected.push(label + ':' + name),
  });
  for (const button of tree.children.flat()) {
    const invoke = executeSegment(handler.code, {
      _capturesObj: { _: button.props['q-e:click'].captures },
    });
    invoke(null, null, ...button.props['q:ps']);
  }
  expect(selected).toEqual(['GROUP:a', 'GROUP:b']);
});

describe.each(['TypeScript', 'Rust'] as const)('%s loop capture regressions', (optimizer) => {
  it.each([
    {
      snapshot: 'should_transform_loop_stable_hoisted_var',
      expected: Array.from({ length: 1000 }, (_, index) => 'stable:' + index),
      perElementArrays: 0,
      itemNames: Array.from({ length: 1000 }, (_, index) => String(index)),
    },
    {
      snapshot: 'should_transform_loop_stable_hoisted_var_declarators',
      expected: ['stable:a', 'stable:b'],
      perElementArrays: 0,
    },
    {
      snapshot: 'should_transform_loop_hoisted_function_reference',
      expected: ['stable:a', 'stable:b'],
      perElementArrays: 2,
    },
    {
      snapshot: 'should_transform_loop_hoisted_function_chain',
      expected: ['stable:a', 'stable:b'],
      perElementArrays: 0,
    },
    {
      snapshot: 'should_transform_loop_hoisted_function_chain_initialization',
      expected: ['undefined:a', 'undefined:b', 'stable:a', 'stable:b'],
      perElementArrays: 4,
    },
    {
      snapshot: 'should_transform_loop_logical_property_capture',
      expected: ['stable:a'],
      perElementArrays: 1,
    },
    {
      snapshot: 'should_transform_loop_array_property_capture',
      expected: ['stable:a'],
      perElementArrays: 1,
    },
    {
      snapshot: 'should_transform_loop_object_property_capture',
      expected: ['stable:a'],
      perElementArrays: 1,
    },
    {
      snapshot: 'should_transform_loop_stable_logical_property_capture',
      expected: ['stable:a'],
      perElementArrays: 0,
    },
    {
      snapshot: 'should_transform_loop_hoisted_helper_initialization',
      expected: ['undefined:a', 'undefined:b', 'stable:a', 'stable:b'],
      perElementArrays: 4,
    },
    {
      snapshot: 'should_transform_loop_stable_hoisted_helper',
      expected: ['stable:a', 'stable:b'],
      perElementArrays: 0,
    },
    { snapshot: 'should_transform_loop_property_helper', expected: ['stable:a', 'stable:b'] },
    { snapshot: 'should_transform_loop_pushed_helper', expected: ['stable:a', 'stable:b'] },
    { snapshot: 'should_transform_loop_setter_helper', expected: ['stable:a', 'stable:b'] },
    {
      snapshot: 'should_transform_loop_property_helper_across_initialization',
      expected: ['undefined:a', 'undefined:b', 'stable:a', 'stable:b'],
    },
    {
      snapshot: 'should_transform_loop_stable_property_helper',
      expected: Array.from({ length: 1000 }, (_, index) => 'stable:' + index),
      itemNames: Array.from({ length: 1000 }, (_, index) => String(index)),
      perElementArrays: 0,
    },
    {
      snapshot: 'should_transform_loop_nullable_capture',
      expected: ['null:fixed', 'null:fixed'],
      prefix: null,
    },
    { snapshot: 'should_transform_loop_named_factory', expected: ['stable:a', 'stable:b'] },
    { snapshot: 'should_transform_loop_function_argument', expected: ['stable:a', 'stable:b'] },
    { snapshot: 'should_transform_loop_conditional_factory', expected: ['stable:a', 'stable:b'] },
    {
      snapshot: 'should_transform_loop_factory_returning_helper',
      expected: ['stable:a', 'stable:b'],
    },
    {
      snapshot: 'should_transform_loop_named_factory_across_initialization',
      expected: ['undefined:a', 'undefined:b', 'stable:a', 'stable:b'],
    },
    {
      snapshot: 'should_transform_loop_argument_across_initialization',
      expected: ['undefined:a', 'undefined:b', 'stable:a', 'stable:b'],
    },
    {
      snapshot: 'should_transform_loop_var_in_nested_blocks',
      expected: ['setup:stable', 'stable:a', 'stable:b'],
      perElementArrays: 0,
    },
    {
      snapshot: 'should_transform_loop_var_in_try',
      expected: ['setup:ready', 'stable:a', 'stable:b'],
      perElementArrays: 0,
    },
    {
      snapshot: 'should_transform_loop_var_in_label',
      expected: ['stable:a', 'stable:b'],
      perElementArrays: 0,
    },
    {
      snapshot: 'should_transform_loop_var_in_nested_branch',
      expected: ['setup:stable', 'stable:a', 'stable:b'],
      perElementArrays: 0,
    },
    {
      snapshot: 'should_transform_loop_var_in_while',
      expected: ['0:a', '0:b', '1:a', '1:b'],
      bindings: 2,
      perElementArrays: 0,
    },
    {
      snapshot: 'should_transform_loop_shared_padding_capture',
      expected: ['stable:first:a', 'stable:second:a', 'stable:first:b', 'stable:second:b'],
      events: ['onClick$', 'onMouseDown$'],
      bindings: 2,
    },
    {
      snapshot: 'should_transform_loop_shadowed_helper_name',
      expected: ['stable:a', 'stable:b'],
      perElementArrays: 2,
    },
    { snapshot: 'should_transform_loop_assigned_helper_alias', expected: ['stable:a', 'stable:b'] },
    {
      snapshot: 'should_transform_loop_assigned_alias_across_initialization',
      expected: ['undefined:a', 'undefined:b', 'stable:a', 'stable:b'],
    },
    {
      snapshot: 'should_transform_loop_branch_assigned_helper',
      expected: ['stable:a', 'stable:b'],
    },
    { snapshot: 'should_transform_loop_factory_helper', expected: ['stable:a', 'stable:b'] },
    {
      snapshot: 'should_transform_loop_factory_across_initialization',
      expected: ['undefined:a', 'undefined:b', 'stable:a', 'stable:b'],
    },
    { snapshot: 'should_transform_loop_helper_in_call_result', expected: ['stable:a', 'stable:b'] },
    {
      snapshot: 'should_transform_loop_handler_with_awaited_map_argument',
      expected: [
        'receiver:ready',
        'method:ready',
        'binding:ready',
        'argument:ready',
        'stable:a',
        'stable:b',
      ],
      recordCallOrder: true,
    },
    {
      snapshot: 'should_transform_loop_stable_var_in_block',
      expected: Array.from({ length: 1000 }, (_, index) => 'stable:' + index),
      itemNames: Array.from({ length: 1000 }, (_, index) => String(index)),
      perElementArrays: 0,
    },
    {
      snapshot: 'should_transform_loop_stable_var_in_branch',
      expected: ['stable:a', 'stable:b'],
      perElementArrays: 0,
    },
    {
      snapshot: 'should_transform_loop_destructured_array_helper',
      expected: ['stable:a', 'stable:b'],
    },
    {
      snapshot: 'should_transform_loop_destructured_object_helper',
      expected: ['stable:a', 'stable:b'],
    },
    { snapshot: 'should_transform_loop_conditional_helper', expected: ['stable:a', 'stable:b'] },
    {
      snapshot: 'should_transform_loop_destructured_helper_across_initialization',
      expected: ['undefined:a', 'undefined:b', 'stable:a', 'stable:b'],
    },
    { snapshot: 'should_transform_loop_capture_named_padding', expected: ['stable:a', 'stable:b'] },
    {
      snapshot: 'should_transform_loop_for_of_var_head',
      expected: ['first:a', 'first:b', 'second:a', 'second:b'],
    },
    {
      snapshot: 'should_transform_loop_for_in_var_head',
      expected: ['first:a', 'first:b', 'second:a', 'second:b'],
    },
    {
      snapshot: 'should_transform_loop_function_scoped_var_in_block',
      expected: ['setup:ready', 'stable:a', 'stable:b'],
    },
    {
      snapshot: 'should_transform_loop_function_scoped_var_in_for',
      expected: ['stable:a', 'stable:b'],
    },
    {
      snapshot: 'should_transform_loop_uncaptured_var_initializers',
      expected: ['stable:a', 'stable:b'],
    },
    {
      snapshot: 'should_transform_loop_first_var_initialization_array_pattern',
      expected: ['undefined:a', 'undefined:b', 'stable:a', 'stable:b'],
      perElementArrays: 4,
    },
    {
      snapshot: 'should_transform_loop_first_var_initialization_object_pattern',
      expected: ['undefined:a', 'undefined:b', 'stable:a', 'stable:b'],
      perElementArrays: 4,
    },
    {
      snapshot: 'should_transform_loop_first_var_initialization_between_declarators',
      expected: ['undefined:a', 'undefined:b', 'stable:a', 'stable:b'],
      perElementArrays: 4,
    },
    {
      snapshot: 'should_transform_loop_first_var_initialization_between_alias_calls',
      expected: ['undefined:a', 'undefined:b', 'stable:a', 'stable:b'],
      perElementArrays: 4,
    },
    {
      snapshot: 'should_transform_loop_first_var_initialization_between_branch_calls',
      expected: ['undefined:a', 'undefined:b', 'stable:a', 'stable:b'],
      perElementArrays: 4,
    },
    {
      snapshot: 'should_transform_loop_first_var_initialization_between_helper_calls',
      expected: ['undefined:a', 'undefined:b', 'stable:a', 'stable:b'],
      perElementArrays: 4,
    },
    {
      snapshot: 'should_transform_loop_var_capture_after_helper_storage',
      perElementArrays: 2,
      expected: ['stable:a', 'stable:b'],
    },
    {
      snapshot: 'should_transform_loop_handler_before_single_var_initializer',
      perElementArrays: 2,
      expected: ['undefined:a', 'undefined:b'],
    },
    {
      snapshot: 'should_transform_loop_var_reinitialized_before_helper',
      expected: ['second:a', 'second:b'],
    },
    {
      snapshot: 'should_transform_loop_var_reinitialized_between_helper_calls',
      expected: ['first:a', 'first:b', 'second:a', 'second:b'],
    },
    {
      snapshot: 'should_transform_loop_helper_call_after_capture_declarator',
      perElementArrays: 0,
      expected: ['stable:a', 'stable:b'],
    },
    {
      snapshot: 'should_transform_loop_stable_var_capture',
      perElementArrays: 0,
      expected: ['stable:a', 'stable:b', 'stable:a', 'stable:b'],
    },
    { snapshot: 'should_transform_loop_helper_in_array', expected: ['stable:a', 'stable:b'] },
    {
      snapshot: 'should_transform_loop_helper_in_array_declaration',
      expected: ['stable:a', 'stable:b'],
    },
    {
      snapshot: 'should_transform_loop_handler_before_var_initializer',
      expected: ['undefined:a', 'undefined:b'],
    },
    {
      snapshot: 'should_transform_loop_handler_in_arrow_parameter_default',
      expected: ['stable:a', 'stable:b'],
    },
    {
      snapshot: 'should_transform_loop_helper_multiple_declarators',
      expected: ['stable:a', 'stable:b', 'stable:a', 'stable:b'],
    },
    {
      snapshot: 'should_transform_loop_helper_call_in_declaration',
      expected: ['stable:a', 'stable:b', 'stable:a', 'stable:b'],
    },
    { snapshot: 'should_transform_loop_parenthesized_update_capture', expected: ['1:a', '2:b'] },
    {
      snapshot: 'should_transform_loop_for_of_head_capture',
      expected: ['first:a', 'first:b', 'second:a', 'second:b'],
    },
    {
      snapshot: 'should_transform_loop_for_in_head_capture',
      expected: ['first:a', 'first:b', 'second:a', 'second:b'],
    },
    {
      snapshot: 'should_transform_loop_handler_in_parameter_default',
      expected: ['stable:a', 'stable:b'],
    },
  ])(
    '$snapshot',
    async ({
      snapshot,
      expected,
      perElementArrays,
      events = ['onClick$'],
      bindings = 1,
      itemNames = ['a', 'b'],
      recordCallOrder = false,
      prefix = 'stable',
    }) => {
      const fixture = parseSnapshot(
        readFileSync(join(SNAP_DIR, `qwik_core__test__${snapshot}.snap`), 'utf8')
      );
      const modules =
        optimizer === 'Rust'
          ? fixture.segments.map((segment) => ({
              code: segment.code,
              ctxName: segment.metadata?.ctxName,
            }))
          : transform(fixture.input!, { entryStrategy: { type: 'smart' } }).modules.map(
              (module) => ({
                code: module.code,
                ctxName: module.kind === 'segment' ? module.segment.ctxName : undefined,
              })
            );
      const component = modules.find((module) => module.ctxName === 'component$')!;
      const handlers = events.map((event) => modules.find((module) => module.ctxName === event)!);
      let allocations = 0;
      const qrl = () => ({
        m() {
          return this;
        },
        w(captures: unknown[]) {
          allocations++;
          if (recordCallOrder) {
            selected.push('binding:ready');
          }
          return { captures };
        },
      });
      const render = executeSegment(component.code, {
        qrl,
        _jsxSorted: (_tag: string, props: unknown, _constant: unknown, children: unknown) => ({
          props,
          children,
        }),
      });
      const selected: string[] = [];
      const items = itemNames.map((name) => ({ name }));
      if (recordCallOrder) {
        Object.defineProperty(items, 'map', {
          get() {
            selected.push('method:ready');
            return Array.prototype.map;
          },
        });
      }
      const tree = await render({
        prefix,
        get items() {
          if (recordCallOrder) {
            selected.push('receiver:ready');
          }
          return items;
        },
        get context() {
          if (recordCallOrder) {
            selected.push('argument:ready');
          }
          return null;
        },
        select$: (prefix: string, name: string) => selected.push(prefix + ':' + name),
      });
      const buttons = [tree.children].flat(Infinity);
      if (perElementArrays !== undefined) {
        expect(
          buttons.filter((button: { props: Record<string, unknown> }) => button.props['q:ps'])
            .length
        ).toBe(perElementArrays);
      }
      expect(allocations).toBe(bindings);
      const groupSize = (buttons.length * events.length) / bindings;
      for (const [index, button] of buttons.entries()) {
        const firstButton = buttons[Math.floor(index / groupSize) * groupSize];
        for (const handler of handlers) {
          const event = 'q-e:' + handler.ctxName!.slice(2, -1).toLowerCase();
          expect(button.props[event]).toBe(firstButton.props[event]);
          const invoke = executeSegment(handler.code, {
            _capturesObj: { _: button.props[event].captures },
          });
          invoke(null, null, ...(button.props['q:ps'] ?? [button.props['q:p']]));
        }
      }
      expect(selected).toEqual(expected);
    }
  );
});
