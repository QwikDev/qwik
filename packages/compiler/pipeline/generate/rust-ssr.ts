/**
 * `generateRustSsr(serverLinkedPlan, entry, options)` — native render sources from the same server
 * LinkedPlan `generateJsSsr` consumes; `entry` names which root is packaged.
 */
import {
  AssemblyKind,
  EntryKind,
  Environment,
  ModuleKind,
  OpKind,
  ProgramBodyKind,
  type ComponentDecl,
  type LinkedModule,
  type LinkedPlan,
  type Op,
} from '../schema';
import { isJsxPath, isTypeScriptPath } from '../analyse/ast/parse';
import { foldStaticOp } from './fold-static';
import type { GenerateOutput, PresentationOptions } from './output';

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
  return {
    modules: [
      {
        path: `${module.path}.rs`,
        code: renders.join('\n'),
        map: null,
        isEntry: true,
        origPath: module.path,
        segment: null,
      },
    ],
    diagnostics: plan.diagnostics.map((item) => item.diagnostic),
    isTypeScript: plan.modules.some((item) => isTypeScriptPath(item.path)),
    isJsx: plan.modules.some((item) => isJsxPath(item.path)),
  };
}

function emitComponentRender(module: LinkedModule, component: ComponentDecl): string {
  const body = module.programs[component.body].body;
  if (body.kind !== ProgramBodyKind.Ops) {
    throw new Error('pipeline.generateRustSsr: js-bodied programs are unsupported by design');
  }
  const statements = body.ops.map((op) => emitOp(op));
  const fnName = `render_${component.name.toLowerCase()}`;
  // `_ctx` because a fully static render never touches the context.
  return `pub fn ${fnName}(_ctx: &mut qwik::render::SsrContext, out: &mut String) {\n${statements.join('')}}\n`;
}

function emitOp(op: Op): string {
  switch (op.op) {
    case OpKind.Static:
    case OpKind.Element:
      return `    out.push_str(${rustString(foldStaticOp(op, false))});\n`;
    default:
      throw new Error(`pipeline.generateRustSsr: op "${op.op}" not implemented yet`);
  }
}

function rustString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
