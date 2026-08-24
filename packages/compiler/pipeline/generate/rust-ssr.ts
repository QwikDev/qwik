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
} from '../schema';
import { chunkCanonicalFilename } from './emit-chunk';
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
  const statements = emitDynamicElement(module, body.ops[0]);
  return `pub fn ${fnName}(ctx: &mut qwik::render::SsrContext, out: &mut String) {\n${statements.join('')}}\n`;
}

function emitDynamicElement(
  module: LinkedModule,
  op: Extract<Op, { op: OpKind.Element }>
): string[] {
  const lines: string[] = [];
  const childrenHtml = op.children
    .map((child) => {
      if (!isFullyStaticSubtree(child)) {
        throw new UnsupportedError('a dynamic child in a rust element render');
      }
      return foldStaticOp(child, false);
    })
    .join('');
  if (op.children.length > 0) {
    lines.push(`    let mut children_0 = String::new();\n`);
    lines.push(`    children_0.push_str(${rustString(childrenHtml)});\n`);
  }
  lines.push(`    out.push_str(${rustString(`<${op.tag}`)});\n`);
  for (const prop of op.props) {
    if (prop.k !== PropKind.Event) {
      throw new UnsupportedError(`the prop "${prop.k}" in a rust element render`);
    }
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
      `    out.push_str(&ctx.event_attr(${rustString(prop.name)}, std::rc::Rc::new(qwik::serdes::SerdesValue::Qrl(qwik::serdes::QrlValue {\n` +
        `        chunk: ${rustString(chunkCanonicalFilename(module, qrl))}.to_string(), symbol: ${rustString(qrl.name)}.to_string(), captures: vec![],\n` +
        `    }))));\n`
    );
  }
  lines.push(`    out.push('>');\n`);
  if (op.children.length > 0) {
    lines.push(`    out.push_str(&children_0);\n`);
  }
  if (!op.void) {
    lines.push(`    out.push_str(${rustString(`</${op.tag}>`)});\n`);
  }
  return lines;
}

function rustString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
