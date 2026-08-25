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

  test('the counter matches the captured crate output (locals renumbered)', async () => {
    const plan = await analyseModule(
      {
        path: 'src/component.tsx',
        code: "import { useSignal } from '@qwik.dev/core';\nexport default () => {\n  const count = useSignal(0);\n  return <button onClick$={() => count.value++}>{count.value}</button>;\n};\n",
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
    // `local_1` vs the crate's `local_2`: local numbering follows each plan's binding table.
    expect(generated.modules[0].code).toBe(
      'pub fn render_default(ctx: &mut qwik::render::SsrContext, out: &mut String) {\n' +
        '    let local_1 = std::rc::Rc::new(qwik::serdes::SerdesValue::Signal(\n' +
        '        std::cell::RefCell::new(qwik::serdes::SignalState { value: std::rc::Rc::new(qwik::serdes::SerdesValue::Number(0f64)), subs: Vec::new() }),\n' +
        '    ));\n' +
        '    let element_id_0_0 = ctx.next_id();\n' +
        '    let mut children_1 = String::new();\n' +
        '    ctx.serializer.add_root(std::rc::Rc::clone(&local_1));\n' +
        '    ctx.subscribe_element_text(&local_1, element_id_0_0);\n' +
        '    children_1.push_str(&qwik::escape::escape_html(&qwik::render::signal_text(&local_1)));\n' +
        '    out.push_str("<button");\n' +
        '    out.push_str(&format!(" q:id=\\"{}\\"", element_id_0_0));\n' +
        '    out.push_str(&ctx.event_attr("q-e:click", std::rc::Rc::new(qwik::serdes::SerdesValue::Qrl(qwik::serdes::QrlValue {\n' +
        '        chunk: "component.tsx_component_q_e_click_segment_0_2xwyg1cinvmpz".to_string(), symbol: "component_q_e_click_segment_0_2xwyg1cinvmpz".to_string(), captures: vec![std::rc::Rc::clone(&local_1), ],\n' +
        '    }))));\n' +
        "    out.push('>');\n" +
        '    out.push_str(&children_1);\n' +
        '    out.push_str("</button>");\n' +
        '}\n'
    );
  });

  test('event handler capturing a signal matches the captured crate output', async () => {
    const plan = await analyseModule(
      {
        path: 'src/component.tsx',
        code: "import { useSignal } from '@qwik.dev/core';\nexport default () => {\n  const count = useSignal(0);\n  return <button onClick$={() => count.value++}>go</button>;\n};\n",
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
    // `local_1` vs the crate's `local_2`: local numbering follows each plan's binding table.
    expect(generated.modules[0].code).toBe(
      'pub fn render_default(ctx: &mut qwik::render::SsrContext, out: &mut String) {\n' +
        '    let local_1 = std::rc::Rc::new(qwik::serdes::SerdesValue::Signal(\n' +
        '        std::cell::RefCell::new(qwik::serdes::SignalState { value: std::rc::Rc::new(qwik::serdes::SerdesValue::Number(0f64)), subs: Vec::new() }),\n' +
        '    ));\n' +
        '    let mut children_0 = String::new();\n' +
        '    children_0.push_str("go");\n' +
        '    out.push_str("<button");\n' +
        '    out.push_str(&ctx.event_attr("q-e:click", std::rc::Rc::new(qwik::serdes::SerdesValue::Qrl(qwik::serdes::QrlValue {\n' +
        '        chunk: "component.tsx_component_q_e_click_segment_0_2xwyg1cinvmpz".to_string(), symbol: "component_q_e_click_segment_0_2xwyg1cinvmpz".to_string(), captures: vec![std::rc::Rc::clone(&local_1), ],\n' +
        '    }))));\n' +
        "    out.push('>');\n" +
        '    out.push_str(&children_0);\n' +
        '    out.push_str("</button>");\n' +
        '}\n'
    );
  });

  test('text hole matches the captured crate output', async () => {
    const plan = await analyseModule(
      {
        path: 'src/component.tsx',
        code: 'export default (props) => {\n  return <p>{props.title}</p>;\n};\n',
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
      'pub fn render_default(ctx: &mut qwik::render::SsrContext, out: &mut String, props: &std::rc::Rc<qwik::serdes::SerdesValue>) {\n' +
        '    let props = std::rc::Rc::clone(props);\n' +
        '    let element_id_0_0 = ctx.next_id();\n' +
        '    out.push_str("<p");\n' +
        '    out.push_str(&format!(" q:id=\\"{}\\"", element_id_0_0));\n' +
        "    out.push('>');\n" +
        '    ctx.serializer.add_root(std::rc::Rc::clone(&props));\n' +
        '    let mut tracked_1: Vec<std::rc::Rc<qwik::serdes::SerdesValue>> = Vec::new();\n' +
        '    let value_1 = qwik::render::member_read(&props, "title", &mut tracked_1);\n' +
        '    if !tracked_1.is_empty() {\n' +
        '        ctx.subscribe_element_text_expression(&tracked_1, element_id_0_0, vec![std::rc::Rc::clone(&props), ], std::rc::Rc::new(qwik::serdes::SerdesValue::Qrl(qwik::serdes::QrlValue {\n' +
        '        chunk: "component.tsx_component_text_segment_0_1fh10fbkzokfc".to_string(), symbol: "component_text_segment_0_1fh10fbkzokfc".to_string(), captures: vec![],\n' +
        '    })));\n' +
        '    }\n' +
        '    out.push_str(&qwik::escape::escape_html(&qwik::render::ssr_text_value(&value_1)));\n' +
        '    out.push_str("</p>");\n' +
        '}\n'
    );
  });

  test('useSignal render matches the captured crate output (locals renumbered)', async () => {
    const plan = await analyseModule(
      {
        path: 'src/component.tsx',
        code: "import { useSignal } from '@qwik.dev/core';\nexport default () => {\n  const count = useSignal(0);\n  return <p>{count.value}</p>;\n};\n",
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
    // `local_1` vs the crate's `local_2`: local numbering follows each plan's binding table.
    expect(generated.modules[0].code).toBe(
      'pub fn render_default(ctx: &mut qwik::render::SsrContext, out: &mut String) {\n' +
        '    let local_1 = std::rc::Rc::new(qwik::serdes::SerdesValue::Signal(\n' +
        '        std::cell::RefCell::new(qwik::serdes::SignalState { value: std::rc::Rc::new(qwik::serdes::SerdesValue::Number(0f64)), subs: Vec::new() }),\n' +
        '    ));\n' +
        '    let element_id_0_0 = ctx.next_id();\n' +
        '    out.push_str("<p");\n' +
        '    out.push_str(&format!(" q:id=\\"{}\\"", element_id_0_0));\n' +
        "    out.push('>');\n" +
        '    ctx.serializer.add_root(std::rc::Rc::clone(&local_1));\n' +
        '    ctx.subscribe_element_text(&local_1, element_id_0_0);\n' +
        '    out.push_str(&qwik::escape::escape_html(&qwik::render::signal_text(&local_1)));\n' +
        '    out.push_str("</p>");\n' +
        '}\n'
    );
  });

  test('text hole with sibling children matches the captured crate output', async () => {
    const plan = await analyseModule(
      {
        path: 'src/component.tsx',
        code: 'export default (props) => {\n  return <p>a{props.title}b</p>;\n};\n',
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
      'pub fn render_default(ctx: &mut qwik::render::SsrContext, out: &mut String, props: &std::rc::Rc<qwik::serdes::SerdesValue>) {\n' +
        '    let props = std::rc::Rc::clone(props);\n' +
        '    let element_id_0_0 = ctx.next_id();\n' +
        '    out.push_str("<p");\n' +
        '    out.push_str(&format!(" q:id=\\"{}\\"", element_id_0_0));\n' +
        '    out.push_str(">a<!t>");\n' +
        '    ctx.serializer.add_root(std::rc::Rc::clone(&props));\n' +
        '    let mut tracked_1: Vec<std::rc::Rc<qwik::serdes::SerdesValue>> = Vec::new();\n' +
        '    let value_1 = qwik::render::member_read(&props, "title", &mut tracked_1);\n' +
        '    if !tracked_1.is_empty() {\n' +
        '        ctx.subscribe_text_expression(&tracked_1, element_id_0_0, 0, vec![std::rc::Rc::clone(&props), ], std::rc::Rc::new(qwik::serdes::SerdesValue::Qrl(qwik::serdes::QrlValue {\n' +
        '        chunk: "component.tsx_component_text_segment_0_1fh10fbkzokfc".to_string(), symbol: "component_text_segment_0_1fh10fbkzokfc".to_string(), captures: vec![],\n' +
        '    })));\n' +
        '    }\n' +
        '    out.push_str(&qwik::escape::escape_html(&qwik::render::ssr_text_value(&value_1)));\n' +
        '    out.push_str("<!/t>b</p>");\n' +
        '}\n'
    );
  });

  test('signal-read hole with sibling children matches the captured crate output (locals renumbered)', async () => {
    const plan = await analyseModule(
      {
        path: 'src/component.tsx',
        code: "import { useSignal } from '@qwik.dev/core';\nexport default () => {\n  const count = useSignal(0);\n  return <p>Count: {count.value}!</p>;\n};\n",
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
    // `local_1` vs the crate's `local_2`: local numbering follows each plan's binding table.
    expect(generated.modules[0].code).toBe(
      'pub fn render_default(ctx: &mut qwik::render::SsrContext, out: &mut String) {\n' +
        '    let local_1 = std::rc::Rc::new(qwik::serdes::SerdesValue::Signal(\n' +
        '        std::cell::RefCell::new(qwik::serdes::SignalState { value: std::rc::Rc::new(qwik::serdes::SerdesValue::Number(0f64)), subs: Vec::new() }),\n' +
        '    ));\n' +
        '    let element_id_0_0 = ctx.next_id();\n' +
        '    out.push_str("<p");\n' +
        '    out.push_str(&format!(" q:id=\\"{}\\"", element_id_0_0));\n' +
        '    out.push_str(">Count: <!t>");\n' +
        '    ctx.serializer.add_root(std::rc::Rc::clone(&local_1));\n' +
        '    ctx.subscribe_range_text(&local_1, element_id_0_0, 0);\n' +
        '    out.push_str(&qwik::escape::escape_html(&qwik::render::signal_text(&local_1)));\n' +
        '    out.push_str("<!/t>!</p>");\n' +
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
