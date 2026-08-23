/**
 * `generateJsSsr(serverLinkedPlan, options)` — the baseline generator; consumes the exact same
 * server LinkedPlan as `generateRustSsr` (DESIGN.md rule 5).
 */
import {
  Environment,
  ModuleKind,
  OpKind,
  ProgramBodyKind,
  type ComponentDecl,
  type LinkedModule,
  type LinkedPlan,
  type Op,
} from '../schema';
import { assembleQwikModule } from './assemble-module';
import { foldStaticOp } from './fold-static';
import type { ComponentEmission } from './emit-component';
import { generateForeignModule } from './foreign';
import { makeOutput, type GenerateOutput, type PresentationOptions } from './output';

export async function generateJsSsr(
  plan: LinkedPlan,
  options: PresentationOptions
): Promise<GenerateOutput> {
  if (plan.specialization.environment !== Environment.Server) {
    throw new Error('generateJsSsr requires a server LinkedPlan');
  }
  const modules: GenerateOutput['modules'] = [];
  for (const module of plan.modules) {
    modules.push(await generateModule(module, options));
  }
  return makeOutput(plan, modules);
}

async function generateModule(
  module: LinkedModule,
  options: PresentationOptions
): Promise<GenerateOutput['modules'][number]> {
  switch (module.kind) {
    case ModuleKind.Foreign:
      return generateForeignModule(module, options);
    case ModuleKind.Qwik: {
      const emitter = new SsrModuleEmitter(module);
      return {
        path: module.path,
        code: assembleQwikModule(module, emitter, (component) => emitter.emitProgram(component)),
        map: null,
        isEntry: false,
        origPath: null,
        segment: null,
      };
    }
    case ModuleKind.ExportsOnly:
    case ModuleKind.Failed:
      throw new Error(
        `pipeline.generateJsSsr: ${module.kind} modules not implemented yet (slice 1): ${module.path}`
      );
  }
}

class SsrModuleEmitter {
  readonly imports = new Set<string>();
  readonly hoists: string[] = [];

  constructor(private readonly module: LinkedModule) {}

  emitProgram(component: ComponentDecl): ComponentEmission {
    const body = this.module.programs[component.body].body;
    if (body.kind !== ProgramBodyKind.Ops) {
      throw new Error('pipeline.generateJsSsr: js-bodied programs not implemented yet');
    }
    // Adjacent static runs merge into one string part.
    const parts: string[] = [];
    for (const op of body.ops) {
      this.op(op, parts);
    }
    const value =
      parts.length === 0 ? "''" : parts.length === 1 ? parts[0] : `[${parts.join(', ')}]`;
    return { statements: [], value };
  }

  private op(op: Op, parts: string[]): void {
    switch (op.op) {
      case OpKind.Static:
      case OpKind.Element: {
        // SSR streams raw text; adjacent static runs merge into one string part.
        const html = foldStaticOp(op, false);
        const last = parts[parts.length - 1];
        if (last !== undefined && last.startsWith('"')) {
          parts[parts.length - 1] = JSON.stringify((JSON.parse(last) as string) + html);
        } else {
          parts.push(JSON.stringify(html));
        }
        return;
      }
      default:
        throw new Error(`pipeline.generateJsSsr: op "${op.op}" not implemented yet`);
    }
  }
}
