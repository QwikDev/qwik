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
