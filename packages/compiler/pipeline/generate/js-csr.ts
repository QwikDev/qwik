/** `generateJsCsr(browserLinkedPlan, options)` — browser modules from the browser LinkedPlan. */
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
import { isJsxPath, isTypeScriptPath } from '../analyse/ast/parse';
import { QwikWord, QwikGenWord } from '../words';
import { assembleQwikModule } from './assemble-module';
import { foldStaticOp } from './fold-static';
import type { ComponentEmission, GeneratedNames } from './emit-component';
import { generateForeignModule } from './foreign';
import type { GenerateOutput, PresentationOptions } from './output';

export async function generateJsCsr(
  plan: LinkedPlan,
  options: PresentationOptions
): Promise<GenerateOutput> {
  if (plan.specialization.environment !== Environment.Browser) {
    throw new Error('generateJsCsr requires a browser LinkedPlan');
  }
  const modules: GenerateOutput['modules'] = [];
  for (const module of plan.modules) {
    modules.push(await generateModule(module, options));
  }
  return {
    modules,
    diagnostics: plan.diagnostics.map((entry) => entry.diagnostic),
    isTypeScript: plan.modules.some((module) => isTypeScriptPath(module.path)),
    isJsx: plan.modules.some((module) => isJsxPath(module.path)),
  };
}

async function generateModule(
  module: LinkedModule,
  options: PresentationOptions
): Promise<GenerateOutput['modules'][number]> {
  switch (module.kind) {
    case ModuleKind.Foreign:
      return generateForeignModule(module, options);
    case ModuleKind.Qwik: {
      const emitter = new CsrModuleEmitter(module);
      return {
        path: module.path,
        code: assembleQwikModule(
          module,
          emitter,
          (component, names) => emitter.emitProgram(component, names),
          'module-top'
        ),
        map: null,
        isEntry: false,
        origPath: null,
        segment: null,
      };
    }
    case ModuleKind.ExportsOnly:
    case ModuleKind.Failed:
      throw new Error(
        `pipeline.generateJsCsr: ${module.kind} modules not implemented yet (slice 2): ${module.path}`
      );
  }
}

class CsrModuleEmitter {
  readonly imports = new Set<string>();
  readonly hoists: string[] = [];
  /** Per-component: generated locals are function-scoped, so numbering restarts per render. */
  private next!: (prefix: string) => string;

  constructor(private readonly module: LinkedModule) {}

  emitProgram(component: ComponentDecl, names: GeneratedNames): ComponentEmission {
    const body = this.module.programs[component.body].body;
    if (body.kind !== ProgramBodyKind.Ops) {
      throw new Error('pipeline.generateJsCsr: js-bodied programs not implemented yet');
    }
    this.next = createNameAllocator();
    const statements: string[] = [];
    const roots: string[] = [];
    for (const op of body.ops) {
      roots.push(this.op(op, component, statements, names));
    }
    if (roots.length !== 1) {
      throw new Error('pipeline.generateJsCsr: multi-root renders not implemented yet');
    }
    return { statements, value: roots[0] };
  }

  /** Returns the local holding the op's root node. */
  private op(
    op: Op,
    component: ComponentDecl,
    statements: string[],
    names: GeneratedNames
  ): string {
    switch (op.op) {
      case OpKind.Static:
      case OpKind.Element: {
        const fragment = this.next(QwikGenWord.Fragment);
        const el = this.next(QwikGenWord.Element);
        const template = `${component.name}_${this.next(QwikGenWord.Template)}`;
        statements.push(`const ${fragment} = ${template}(${names.ctx}.document);`);
        this.imports.add(QwikWord.FirstChild);
        statements.push(`const ${el} = ${QwikWord.FirstChild}(${fragment});`);
        // The template import and hoist land after the ops walk, matching the request order.
        this.imports.add(QwikWord.CreateTemplate);
        this.hoists.push(
          `const ${template} = ${QwikWord.CreateTemplate}(${JSON.stringify(foldStaticOp(op, true))});`
        );
        return el;
      }
      default:
        throw new Error(`pipeline.generateJsCsr: op "${op.op}" not implemented yet`);
    }
  }
}

/** `fragment0`, `el0`, `tmpl0`, … — one counter per prefix. */
function createNameAllocator() {
  const indexes = new Map<string, number>();
  return (prefix: string) => {
    const index = indexes.get(prefix) ?? 0;
    indexes.set(prefix, index + 1);
    return `${prefix}${index}`;
  };
}
