/** Golden snapshots: slots and projections. */
import { describe, expect, test } from 'vitest';
import { transformModules } from '../transform-modules';
import { testInput, testInputs } from './snapshot-runner';

describe.each(['ssr', 'csr'] as const)('%s', (mode) => {
  test.each([
    ['children-read', `export const Wrapper = (props) => <section>{props.children}</section>;`],
    ['children-read', `export const Wrapper = ({ children }) => <section>{children}</section>;`],
    ['children-read', `export const Wrapper = (props) => <p>{props.children?.length}<Slot /></p>;`],
    [
      'children-read',
      `import { Card } from './card';
export const Wrapper = (props) => <Card>{props.children}</Card>;`,
    ],
    [
      'children-attribute',
      `import { Card } from './card';
export const Wrapper = () => <Card children={<b>x</b>} />;`,
    ],
    [
      'children-read',
      `export const Wrapper = ({ children = <p>none</p> }) => <section><Slot /></section>;`,
    ],
    [
      'children-function',
      `import { Card } from './card';
export const Wrapper = () => <Card>{(value: number) => <b>{value}</b>}</Card>;`,
    ],
  ])('should diagnose children used as content: %s', async (code, source) => {
    const output = await testInput(mode, `children-contract-${code}-${source.length}`, {
      code: `import { Slot } from '@qwik.dev/core';\n${source}\nexport default () => <Wrapper><p>Projected</p></Wrapper>;\n`,
    });
    // Children is projected content: only <Slot /> renders it, useChildrenInfo() describes it.
    expect(output.diagnostics).toMatchObject([{ code }]);
  });

  test('should describe a q:type fragment as one child', async () => {
    const output = await testInput(mode, 'children-descriptor-fragment', {
      code: `import { component$, Fragment, Slot, useChildrenInfo } from '@qwik.dev/core';
export const List = component$(() => {
  const children = useChildrenInfo();
  return <ul>{children.length}<Slot /></ul>;
});
export default component$(() => (
  <List>
    <Fragment q:type="group">text<b>b</b></Fragment>
    <li q:type="row">y</li>
  </List>
));
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // Text alone cannot carry q:type, so a typed fragment groups its content as one entry.
    expect(main).toContain('createSlotScope(null, [{ "type": "group" }, { "type": "row" }])');
    expect(main.match(/registerProjection\(/g)).toHaveLength(2);
  });

  test('should describe children as data a chunk can carry without imports', async () => {
    const output = await testInput(mode, 'children-descriptor-chunk', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export const Child = component$(() => <i>child</i>);
export default component$(() => {
  const tag = useSignal('section');
  const Tag = tag.value;
  return (
    <Tag>
      <button onClick$={() => (tag.value = 'article')} />
      <Child />
    </Tag>
  );
});
`,
    });
    // The descriptor is plain data: the dynamic tag chunk never references the child component.
    const chunk = output.modules.find((module) => module.path.includes('tag_dynamic'))!;
    expect(chunk.code).not.toContain('Child');
  });

  test('should describe projected children to a component that calls useChildrenInfo', async () => {
    const output = await testInput(mode, 'children-descriptor', {
      code: `import { component$, Slot, useChildrenInfo, useSignal } from '@qwik.dev/core';
import { Card } from './card';
export const Counter = component$(() => {
  const children = useChildrenInfo();
  return <p>{children.length}<Slot /></p>;
});
export const Plain = component$(() => <p><Slot /></p>);
export default component$(() => {
  const count = useSignal(1);
  return (
    <>
      <Counter><b q:type="bold">x</b>text<Card q:type="card" />{count.value}</Counter>
      <Plain><b>x</b></Plain>
      <Card><b>x</b></Card>
    </>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // The parent describes the default projection only to a consumer that calls useChildrenInfo().
    expect(main).toContain(
      'createSlotScope(null, [{ "type": "bold" }, _EMPTY_OBJ, { "type": "card" }, _EMPTY_OBJ])'
    );
    expect(main).not.toContain('q:type');
    // A known consumer that never reads them gets a bare scope; an external one gets a description.
    expect(main.match(/createSlotScope\(\)/g)).toHaveLength(1);
    expect(main).toContain('createSlotScope(null, [_EMPTY_OBJ])');
  });

  test('should project component children through the Slot marker', async () => {
    await testInput(mode, 'component-children-slot', {
      code: `import { Slot } from '@qwik.dev/core';
export const Wrapper = () => <section><Slot /></section>;
export default () => <Wrapper><p>Projected</p></Wrapper>;
`,
    });
  });

  test('should capture signals used by projected component children', async () => {
    await testInput(mode, 'component-children-signal', {
      code: `import { Slot, useSignal } from '@qwik.dev/core';
export const Wrapper = () => <section><Slot /></section>;
export default () => {
  const count = useSignal(1);
  return <Wrapper><p>{count.value}</p></Wrapper>;
};
`,
    });
  });

  test('should project component children through static named slots', async () => {
    await testInput(mode, 'component-children-named-slot', {
      code: `import { Slot } from '@qwik.dev/core';
export const Card = () => <article><header><Slot name="header" /></header><Slot /></article>;
export default () => <Card><h1 q:slot="header">Title</h1><p>Content</p></Card>;
`,
    });
  });

  test('should project nested fragments into default and named slots', async () => {
    const code = `import { Slot, useSignal } from '@qwik.dev/core';
export const Card = () => <article><header><Slot name="header" /></header><Slot /></article>;
export default () => {
  const count = useSignal(1);
  return <Card><><h1 q:slot="header">Title</h1><>{/* comment */}<p>Count:<> </>{count.value}<i /><b /><em /></p></></></Card>;
};
`;
    const flattened = await transformModules({
      srcDir: 'src',
      transpileTs: true,
      transpileJsx: true,
      isServer: mode === 'ssr',
      input: [{ path: 'src/component.tsx', code: code.replaceAll('<>', '').replaceAll('</>', '') }],
    });
    const output = await testInput(mode, 'component-children-fragments', { code });
    expect(output.modules.map((module) => module.code)).toEqual(
      flattened.modules.map((module) => module.code)
    );
  });

  test('should project mapped rows into static named slots', async () => {
    const output = await testInput(mode, 'component-children-mapped-slots', {
      code: `import { Slot, useSignal } from '@qwik.dev/core';
export const Panel = () => <main><Slot name="header" /><Slot name="footer" /><Slot /></main>;
export default () => {
  const items = useSignal([{ id: 1, title: 'Title' }]);
  return <Panel>{items.value.map((item) => <h2 key={item.id} q:slot="header">{item.title}</h2>)}{['End'].map((label) => <p q:slot="footer">{label}</p>)}{items.value.map((item) => <section key={item.id}><span q:slot="nested">{item.title}</span></section>)}</Panel>;
};
`,
    });
    expect(output.diagnostics).toEqual([]);
    if (mode === 'csr') {
      const projections = output.modules.filter(
        (module) => module.segment?.ctxName === 'slot:render'
      );
      expect(projections).toHaveLength(3);
      for (const projection of projections) {
        expect(projection.code).toContain('return [...fragment0.childNodes];');
      }
    }
  });

  test.each([
    ['reactive', 'items.value'],
    ['array', "[{ title: 'Title', description: 'Body' }]"],
  ])('should split mapped fragments into slots: %s', async (kind, source) => {
    const output = await testInput(mode, `component-children-mapped-fragments-${kind}`, {
      code: `import { Slot, useSignal } from '@qwik.dev/core';
export const Panel = () => <main><Slot name="header" /><Slot /></main>;
export default () => {
  const items = useSignal([{ title: 'Title', description: 'Body' }]);
  return <Panel>{${source}.map((item) => <><h2 q:slot="header">{item.title}</h2><><b q:slot="header">!</b><p>{item.description}</p></></>)}</Panel>;
};
`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test.each([
    ['reactive', 'items.value'],
    ['array', "[{ title: 'Title', featured: true, visible: false }]"],
  ])('should project conditional mapped rows: %s', async (kind, source) => {
    const output = await testInput(mode, `component-children-mapped-conditions-${kind}`, {
      code: `import { Slot, useSignal } from '@qwik.dev/core';
export const Panel = () => <main><Slot name="header" /><Slot /></main>;
export default () => {
  const items = useSignal([{ title: 'Title', featured: true, visible: false }]);
  return <Panel>{${source}.map(({ title, featured, visible }, index) => featured && index === 0 ? <h2 q:slot="header">{index}:{title}</h2> : visible && <p>{title}</p>)}</Panel>;
};
`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test.each([
    ['reactive', 'items.value'],
    ['array', "[{ title: 'Title' }]"],
  ])('should project rows with a single return block: %s', async (kind, source) => {
    const row = '<h2 q:slot="header">{title}</h2>';
    const callback = `({ title }) => { /* row */ return (${row}); }`;
    const code = `import { Slot, useSignal } from '@qwik.dev/core';
export const Panel = () => <main><Slot name="header" /></main>;
export default () => {
  const items = useSignal([{ title: 'Title' }]);
  return <Panel>{${source}.map(${callback})}</Panel>;
};
`;
    const output = await testInput(mode, `component-children-mapped-return-${kind}`, { code });
    expect(output.diagnostics).toEqual([]);
    if (kind === 'reactive') {
      const concise = await transformModules({
        srcDir: 'src',
        transpileTs: true,
        transpileJsx: true,
        isServer: mode === 'ssr',
        input: [
          { path: 'src/component.tsx', code: code.replace(callback, `({ title }) => ${row}`) },
        ],
      });
      expect(output.modules.map((module) => module.code)).toEqual(
        concise.modules.map((module) => module.code)
      );
    }
  });

  test.each([
    ['reactive', 'items.value'],
    ['array', "[{ title: 'Title' }]"],
  ])('should preserve local consts in mapped projections: %s', async (kind, source) => {
    const output = await testInput(mode, `component-children-mapped-const-${kind}`, {
      code: `import { Slot, useSignal } from '@qwik.dev/core';
export const Panel = () => <main><Slot name="header" /></main>;
export default () => {
  const suffix = useSignal('!');
  const items = useSignal([{ title: 'Title' }]);
  return <Panel>{${source}.map(({ title }, index) => {
    const label = title.toUpperCase() + suffix.value;
    const numbered = index + ':' + label, visible = label.length > 0;
    return visible && <h2 q:slot="header" title={numbered} onClick$={() => console.log(label)}>{label}:{numbered}</h2>;
  })}</Panel>;
};
`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test.each([
    ['reactive', 'items.value'],
    ['array', "[{ details: { parts: ['First', 'Skip', 'Last'] }, fallback: 'Title' }]"],
  ])('should destructure local consts in mapped projections: %s', async (kind, source) => {
    const output = await testInput(mode, `component-children-mapped-destructure-${kind}`, {
      code: `import { Slot, useSignal } from '@qwik.dev/core';
export const Panel = () => <main><Slot name="header" /></main>;
export default () => {
  const suffix = useSignal('!');
  const items = useSignal([{ details: { parts: ['First', 'Skip', 'Last'] }, fallback: 'Title' }]);
  return <Panel>{${source}.map(({ details, fallback }, index) => {
    const { title: label = fallback, copy = label, [index]: position = suffix.value, ...rest } = details;
    const [first = copy, , ...tail] = rest.parts;
    return <h2 q:slot="header" onClick$={() => console.log(label, first, tail)}>{label}:{first}:{position}:{tail.length}</h2>;
  })}</Panel>;
};
`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('should register a projection under a dynamic slot name', async () => {
    const output = await testInput(mode, 'projection-dynamic-name', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
import { Card } from './card';
export default component$(() => {
  const side = useSignal('left');
  return (
    <Card>
      <div q:slot={side.value}>content</div>
      <b q:slot="right">fixed</b>
    </Card>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // The client reads the name through a bound static function; the server serializes a QRL.
    expect(main).toMatch(
      mode === 'ssr'
        ? /registerProjection\(slotScope0, q_component_slot_name_segment_\w+\.w\(\[side\]\), /
        : /registerProjection\(slotScope0, \(\) => component_slot_name_segment_\w+\(side\), /
    );
    expect(main).toMatch(/registerProjection\(slotScope0, "right", /);
    // The scope carries the segment its consumer's live slots run.
    expect(main).toMatch(/createSlotScope\(q_component_slot_content_segment_\w+\)/);
    const nameChunk = output.modules.find((module) => module.path.includes('slot_name'))!;
    expect(nameChunk.code).toContain('return side.value;');
  });

  test('should forward slots and render fallback through fragments', async () => {
    const output = await testInput(mode, 'component-slot-forwarding-fragments', {
      code: `import { Slot } from '@qwik.dev/core';
export const Inner = () => <article><Slot name="title" /></article>;
export const Wrapper = () => <Inner>{(<><Slot name="heading" q:slot="title"><><h2>Fallback</h2></></Slot></>)}</Inner>;
export default () => <main><Wrapper><><h1 q:slot="heading">Provided</h1></></Wrapper><Wrapper><>{/* empty */}<></></></Wrapper></main>;
`,
    });
    expect(output.modules).toHaveLength(3);
  });

  test('should switch component children through a dynamic slot name', async () => {
    await testInput(mode, 'component-children-dynamic-slot', {
      code: `import { Slot } from '@qwik.dev/core';
export const Switch = (props) => <Slot name={props.name} />;
export default (props) => <Switch name={props.pick}><i q:slot="a">Alpha</i><b q:slot="b">Bravo</b></Switch>;
`,
    });
  });

  test('should project a conditional child into its statically named slot', async () => {
    await testInput(mode, 'component-children-conditional-slot', {
      code: `import { Slot, useSignal } from '@qwik.dev/core';
export const Panel = () => <main><Slot name="start" /><Slot /></main>;
export default () => {
  const show = useSignal(true);
  return <Panel>{show.value && <span q:slot="start">start</span>}</Panel>;
};
`,
    });
  });

  test('should split a conditional child across its statically named slots', async () => {
    await testInput(mode, 'component-children-conditional-slot-split', {
      code: `import { Slot, useSignal } from '@qwik.dev/core';
export const Panel = () => <main><Slot name="x" /><Slot name="y" /></main>;
export default () => {
  const flip = useSignal(false);
  return <Panel>{flip.value ? <a q:slot="x">alpha</a> : <b q:slot="y">bravo</b>}</Panel>;
};
`,
    });
  });

  test('should render a slot fallback only without a projection', async () => {
    await testInput(mode, 'component-slot-fallback', {
      code: `import { Slot } from '@qwik.dev/core';
export const Card = () => <section><Slot><p>Empty</p></Slot></section>;
export default () => <main><Card /><Card><p>Projected</p></Card></main>;
`,
    });
  });

  test('should split nested conditional fragments into named and default projections', async () => {
    await testInput(mode, 'component-children-nested-conditional-fragments', {
      code: `import { Slot } from '@qwik.dev/core';
export const Panel = () => <main><Slot name="header" /><Slot /></main>;
export default (props) => <Panel>{props.show ? <><h1 q:slot="header">Title</h1>{props.details && <><p>Details</p><p>More</p></>}</> : null}</Panel>;
`,
    });
  });

  test('should forward a projection through a nested slot', async () => {
    const output = await testInput(mode, 'component-slot-forwarding', {
      code: `import { Slot } from '@qwik.dev/core';
export const Inner = () => <article><Slot /></article>;
export const Wrapper = () => <Inner><Slot /></Inner>;
export default () => <Wrapper><p>Forwarded</p></Wrapper>;
`,
    });
    expect(output.modules).toHaveLength(2);
  });

  test('should forward a named projection under a different name', async () => {
    const output = await testInput(mode, 'component-slot-forwarding-named', {
      code: `import { Slot } from '@qwik.dev/core';
export const Inner = () => <article><Slot name="title" /></article>;
export const Wrapper = () => <Inner><Slot name="heading" q:slot="title" /></Inner>;
export default () => <Wrapper><h1 q:slot="heading">Hello</h1></Wrapper>;
`,
    });
    expect(output.modules).toHaveLength(2);
  });

  test('should use a fallback when a forwarded named projection is absent', async () => {
    const output = await testInput(mode, 'component-slot-forwarding-fallback', {
      code: `import { Slot } from '@qwik.dev/core';
export const Inner = () => <article><Slot name="title" /></article>;
export const Wrapper = () => <Inner><Slot name="heading" q:slot="title"><h2>Fallback</h2></Slot></Inner>;
export default () => <main><Wrapper><h1 q:slot="heading">Provided</h1></Wrapper><Wrapper /></main>;
`,
    });
    expect(output.modules).toHaveLength(3);
  });
});
