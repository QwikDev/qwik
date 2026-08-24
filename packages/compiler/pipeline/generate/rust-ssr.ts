/**
 * `generateRustSsr(serverLinkedPlan, entry, options)` — native render sources from the same server
 * LinkedPlan `generateJsSsr` consumes; `entry` names which root is packaged.
 */
import {
  AssemblyKind,
  EntryKind,
  Environment,
  HandlerKind,
  ModuleKind,
  OpKind,
  PropKind,
  ProgramBodyKind,
  ValueKind,
  type ComponentDecl,
  type LinkedModule,
  type LinkedPlan,
  type Op,
  type Prop,
} from '../schema';
import { ValueIrKind, type ValueIR } from '../../src/expr-ir';
import { captureNames, chunkCanonicalFilename } from './emit-chunk';
import { foldStaticOp, isFullyStaticSubtree } from './fold-static';
import { UnsupportedError } from '../errors';
import { makeOutput, type GenerateOutput, type PresentationOptions } from './output';

export async function generateRustSsr(
  plan: LinkedPlan,
  entry: number,
  options: PresentationOptions
): Promise<GenerateOutput> {
  if (plan.specialization.environment !== Environment.Server) {
    throw new Error('generateRustSsr requires a server LinkedPlan');
  }
  if (!plan.complete) {
    throw new Error('generateRustSsr requires a COMPLETE link');
  }
  const root = plan.entries[entry];
  if (root === undefined) {
    throw new Error(`generateRustSsr: entry ${entry} is not in LinkedPlan.entries`);
  }
  if (root.kind !== EntryKind.Module) {
    throw new Error('pipeline.generateRustSsr: export entries not implemented yet (slice 5)');
  }
  void options;
  const module = plan.modules[root.module];
  if (module.kind !== ModuleKind.Qwik) {
    throw new Error(`pipeline.generateRustSsr: ${module.kind} entry modules not implemented yet`);
  }
  const renders = module.assembly.map((intent) => {
    if (intent.a !== AssemblyKind.Component) {
      throw new Error(
        `pipeline.generateRustSsr: assembly intent "${intent.a}" not implemented yet`
      );
    }
    return emitComponentRender(module, module.components[intent.component]);
  });
  return makeOutput(plan, [
    {
      path: `${module.path}.rs`,
      code: renders.join('\n'),
      map: null,
      isEntry: true,
      origPath: module.path,
      segment: null,
    },
  ]);
}

function emitComponentRender(module: LinkedModule, component: ComponentDecl): string {
  const body = module.programs[component.body].body;
  if (body.kind !== ProgramBodyKind.Ops) {
    throw new Error('pipeline.generateRustSsr: js-bodied programs are unsupported by design');
  }
  const fnName = `render_${component.name.toLowerCase()}`;
  if (body.ops.every(isFullyStaticSubtree)) {
    const statements = body.ops.map(
      (op) => `    out.push_str(${rustString(foldStaticOp(op, false))});\n`
    );
    // `_ctx` because a fully static render never touches the context.
    return `pub fn ${fnName}(_ctx: &mut qwik::render::SsrContext, out: &mut String) {\n${statements.join('')}}\n`;
  }
  if (body.ops.length !== 1 || body.ops[0].op !== OpKind.Element) {
    throw new UnsupportedError('a dynamic rust render beyond a single root element');
  }
  const propsName = componentPropsName(module, component);
  const head =
    propsName === null
      ? `pub fn ${fnName}(ctx: &mut qwik::render::SsrContext, out: &mut String) {\n`
      : `pub fn ${fnName}(ctx: &mut qwik::render::SsrContext, out: &mut String, ${propsName}: &std::rc::Rc<qwik::serdes::SerdesValue>) {\n`;
  const statements =
    propsName === null ? [] : [`    let ${propsName} = std::rc::Rc::clone(${propsName});\n`];
  statements.push(...emitDynamicElement(module, body.ops[0], propsName));
  return `${head}${statements.join('')}}\n`;
}

function componentPropsName(module: LinkedModule, component: ComponentDecl): string | null {
  const surface = component.parameter?.surface;
  return surface?.kind === 'identifier' ? module.bindings[surface.binding].name : null;
}

function emitDynamicElement(
  module: LinkedModule,
  op: Extract<Op, { op: OpKind.Element }>,
  propsName: string | null
): string[] {
  const lines: string[] = [];
  // One shared temp counter: element ids, children buffers, and hole values each take a slot.
  let temps = 0;
  const holes = op.children.filter((child) => child.op === OpKind.Hole);
  const idVariable = holes.length > 0 ? `element_id_${temps++}_0` : null;
  if (idVariable !== null) {
    lines.push(`    let ${idVariable} = ctx.next_id();\n`);
  }
  let childrenBuffer: string | null = null;
  if (holes.length === 0 && op.children.length > 0) {
    const childrenHtml = op.children
      .map((child) => {
        if (!isFullyStaticSubtree(child)) {
          throw new UnsupportedError('a dynamic child in a rust element render');
        }
        return foldStaticOp(child, false);
      })
      .join('');
    childrenBuffer = `children_${temps++}`;
    lines.push(`    let mut ${childrenBuffer} = String::new();\n`);
    lines.push(`    ${childrenBuffer}.push_str(${rustString(childrenHtml)});\n`);
  }
  lines.push(`    out.push_str(${rustString(`<${op.tag}`)});\n`);
  if (idVariable !== null) {
    lines.push(`    out.push_str(&format!(" q:id=\\"{}\\"", ${idVariable}));\n`);
  }
  for (const prop of op.props) {
    switch (prop.k) {
      case PropKind.Event:
        emitEventAttr(module, prop, lines);
        break;
      default:
        throw new UnsupportedError(`the prop "${prop.k}" in a rust element render`);
    }
  }
  lines.push(`    out.push('>');\n`);
  if (holes.length > 0 && op.children.length !== 1) {
    throw new UnsupportedError('a text hole with sibling children in a rust render');
  }
  for (const hole of holes) {
    temps = emitTextHole(
      module,
      hole as Extract<Op, { op: OpKind.Hole }>,
      idVariable!,
      temps,
      lines
    );
  }
  if (childrenBuffer !== null) {
    lines.push(`    out.push_str(&${childrenBuffer});\n`);
  }
  if (!op.void) {
    lines.push(`    out.push_str(${rustString(`</${op.tag}>`)});\n`);
  }
  return lines;
}

function emitTextHole(
  module: LinkedModule,
  op: Extract<Op, { op: OpKind.Hole }>,
  idVariable: string,
  temps: number,
  lines: string[]
): number {
  if (op.value.v !== ValueKind.Computed || !('qrl' in op.value.resume)) {
    throw new UnsupportedError('a non-computed text hole');
  }
  if (op.value.expr.kind !== 'ir') {
    throw new UnsupportedError('a js-payload expression on the rust target');
  }
  const use = op.value.resume.qrl;
  const qrl = module.qrls.find((candidate) => candidate.id === use.qrl);
  if (qrl === undefined) {
    throw new Error('pipeline.generateRustSsr: unknown qrl');
  }
  const captures = captureNames(module, qrl);
  for (const capture of captures) {
    lines.push(`    ctx.serializer.add_root(std::rc::Rc::clone(&${capture}));\n`);
  }
  const n = temps;
  const tracked = `tracked_${n}`;
  const value = `value_${n}`;
  lines.push(`    let mut ${tracked}: Vec<std::rc::Rc<qwik::serdes::SerdesValue>> = Vec::new();\n`);
  lines.push(`    let ${value} = ${rustIrValue(module, op.value.expr.ir, tracked)};\n`);
  lines.push(`    if !${tracked}.is_empty() {\n`);
  lines.push(
    `        ctx.subscribe_element_text_expression(&${tracked}, ${idVariable}, vec![${captures.map((capture) => `std::rc::Rc::clone(&${capture}), `).join('')}], ${rustQrlValue(module, qrl)});\n`
  );
  lines.push(`    }\n`);
  lines.push(
    `    out.push_str(&qwik::escape::escape_html(&qwik::render::ssr_text_value(&${value})));\n`
  );
  return n + 1;
}

function emitEventAttr(
  module: LinkedModule,
  prop: Extract<Prop, { k: PropKind.Event }>,
  lines: string[]
): void {
  if (prop.handlers.length !== 1) {
    throw new UnsupportedError('multiple handlers on one rust event');
  }
  const handler = prop.handlers[0];
  const value = handler.h === HandlerKind.Value ? handler.value : null;
  if (value === null || value.v !== ValueKind.Qrl) {
    throw new UnsupportedError('a non-QRL event handler');
  }
  const qrl = module.qrls.find((candidate) => candidate.id === value.use.qrl);
  if (qrl === undefined || qrl.formals.length > 0) {
    throw new UnsupportedError('a capturing rust event handler');
  }
  lines.push(
    `    out.push_str(&ctx.event_attr(${rustString(prop.name)}, ${rustQrlValue(module, qrl)}));\n`
  );
}

/** IR → tracked evaluation; only the captured `member(binding-read)` shape has verified bytes. */
function rustIrValue(module: LinkedModule, ir: ValueIR, tracked: string): string {
  if (
    ir.kind === ValueIrKind.Member &&
    ir.obj.kind === ValueIrKind.BindingRead &&
    ir.optional !== true
  ) {
    const base = module.bindings[ir.obj.binding].name;
    return `qwik::render::member_read(&${base}, ${rustString(ir.name)}, &mut ${tracked})`;
  }
  throw new UnsupportedError(`the IR "${ir.kind}" on the rust target`);
}

function rustQrlValue(
  module: LinkedModule,
  qrl: Parameters<typeof chunkCanonicalFilename>[1]
): string {
  return (
    `std::rc::Rc::new(qwik::serdes::SerdesValue::Qrl(qwik::serdes::QrlValue {\n` +
    `        chunk: ${rustString(chunkCanonicalFilename(module, qrl))}.to_string(), symbol: ${rustString(qrl.name)}.to_string(), captures: vec![],\n` +
    `    }))`
  );
}

function rustString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
