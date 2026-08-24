/**
 * The expected source is the oracle crate's output, captured by running
 * `qwik_ssr_gen::generate_component` (packages/compiler/generators/rust/ssr) on this example's
 * linked ssr-plan. Re-capture there whenever this golden needs updating.
 */
import { describe, expect, test } from 'vitest';
import { analyseModule, generateRustSsr, linkPlans } from '../index';
import { EntryKind, LinkResultKind } from '../schema';
import { serverSpecialization } from './fixtures';

describe('generateRustSsr', () => {
  test('example 1: static default-arrow component', async () => {
    const plan = await analyseModule(
      {
        path: 'src/component.tsx',
        code: 'export default () => {\n  return <p>Hello Qwik</p>;\n};\n',
      },
      { transpileTs: true }
    );
    const linked = linkPlans(
      [plan],
      [{ kind: EntryKind.Module, module: 'src/component.tsx' }],
      serverSpecialization(),
      { edges: {} },
      { claims: [], policies: [], emissions: [] },
      true
    );
    if (linked.kind !== LinkResultKind.Linked) throw new Error('expected linked');
    const generated = await generateRustSsr(linked.plan, 0, {});
    expect(generated.modules).toHaveLength(1);
    expect(generated.modules[0]).toMatchObject({
      path: 'src/component.tsx.rs',
      isEntry: true,
      origPath: 'src/component.tsx',
    });
    expect(generated.modules[0].code).toBe(
      'pub fn render_default(_ctx: &mut qwik::render::SsrContext, out: &mut String) {\n' +
        '    out.push_str("<p>Hello Qwik</p>");\n' +
        '}\n'
    );
  });

  test('event handler element matches the captured crate output', async () => {
    const plan = await analyseModule(
      {
        path: 'src/component.tsx',
        code: 'export default () => {\n  return <button onClick$={() => console.log(1)}>go</button>;\n};\n',
      },
      { transpileTs: true }
    );
    const linked = linkPlans(
      [plan],
      [{ kind: EntryKind.Module, module: 'src/component.tsx' }],
      serverSpecialization(),
      { edges: {} },
      { claims: [], policies: [], emissions: [] },
      true
    );
    if (linked.kind !== LinkResultKind.Linked) {
      throw new Error('expected linked');
    }
    const generated = await generateRustSsr(linked.plan, 0, {});
    expect(generated.modules[0].code).toBe(
      'pub fn render_default(ctx: &mut qwik::render::SsrContext, out: &mut String) {\n' +
        '    let mut children_0 = String::new();\n' +
        '    children_0.push_str("go");\n' +
        '    out.push_str("<button");\n' +
        '    out.push_str(&ctx.event_attr("q-e:click", std::rc::Rc::new(qwik::serdes::SerdesValue::Qrl(qwik::serdes::QrlValue {\n' +
        '        chunk: "component.tsx_component_q_e_click_segment_0_2xwyg1cinvmpz".to_string(), symbol: "component_q_e_click_segment_0_2xwyg1cinvmpz".to_string(), captures: vec![],\n' +
        '    }))));\n' +
        "    out.push('>');\n" +
        '    out.push_str(&children_0);\n' +
        '    out.push_str("</button>");\n' +
        '}\n'
    );
  });

  test('refuses an incomplete link', async () => {
    const linked = linkPlans(
      [],
      [],
      serverSpecialization(),
      { edges: {} },
      {
        claims: [],
        policies: [],
        emissions: [],
      },
      false
    );
    if (linked.kind !== LinkResultKind.Linked) {
      throw new Error('expected linked');
    }
    await expect(generateRustSsr(linked.plan, 0, {})).rejects.toThrow('COMPLETE link');
  });
});
