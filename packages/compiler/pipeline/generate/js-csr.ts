/** `generateJsCsr(browserLinkedPlan, options)` — browser modules from the browser LinkedPlan. */
import {
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
import { QwikWord, QwikGenWord } from '../words';
import { UnsupportedError } from '../errors';
import { generateQwikModule } from './assemble-module';
import { chunkCanonicalFilename } from './emit-chunk';
import { foldStaticOp } from './fold-static';
import type { ComponentEmission, GeneratedNames } from './emit-component';
import { generateForeignModule } from './foreign';
import { makeOutput, type GenerateOutput, type PresentationOptions } from './output';

export async function generateJsCsr(
  plan: LinkedPlan,
  options: PresentationOptions
): Promise<GenerateOutput> {
  if (plan.specialization.environment !== Environment.Browser) {
    throw new Error('generateJsCsr requires a browser LinkedPlan');
  }
  const modules: GenerateOutput['modules'] = [];
  for (const module of plan.modules) {
    modules.push(...(await generateModule(module, options)));
  }
  return makeOutput(plan, modules);
}

async function generateModule(
  module: LinkedModule,
  options: PresentationOptions
): Promise<GenerateOutput['modules']> {
  switch (module.kind) {
    case ModuleKind.Foreign:
      return [await generateForeignModule(module, options)];
    case ModuleKind.Qwik:
      return generateQwikModule(module, new CsrModuleEmitter(module), 'module-top');
    case ModuleKind.ExportsOnly:
    case ModuleKind.Failed:
      throw new Error(
        `pipeline.generateJsCsr: ${module.kind} modules not implemented yet (slice 2): ${module.path}`
      );
  }
}

class CsrModuleEmitter {
  readonly imports = new Set<string>();
  readonly chunkImports: string[] = [];
  readonly hoists: string[] = [];
  private readonly importedChunks = new Set<string>();
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
        return this.staticRoot(op, component, statements, names);
      case OpKind.Element:
        return this.elementRoot(op, component, statements, names);
      default:
        throw new Error(`pipeline.generateJsCsr: op "${op.op}" not implemented yet`);
    }
  }

  private staticRoot(
    op: Extract<Op, { op: OpKind.Static }>,
    component: ComponentDecl,
    statements: string[],
    names: GeneratedNames
  ): string {
    const mounted = this.mountTemplate(component, statements, names);
    this.hoistTemplate(mounted.template, foldStaticOp(op, true));
    return mounted.el;
  }

  private elementRoot(
    op: Extract<Op, { op: OpKind.Element }>,
    component: ComponentDecl,
    statements: string[],
    names: GeneratedNames
  ): string {
    const mounted = this.mountTemplate(component, statements, names);
    for (const prop of op.props) {
      if (prop.k === PropKind.Event) {
        this.event(prop.name, prop.handlers, mounted.el, statements);
      }
    }
    // Template markup excludes event props; text is escaped for innerHTML parsing.
    this.hoistTemplate(
      mounted.template,
      foldStaticOp({ ...op, props: op.props.filter((prop) => prop.k === PropKind.Static) }, true)
    );
    return mounted.el;
  }

  /** Clones the template into fresh `fragmentN`/`elN` locals. */
  private mountTemplate(
    component: ComponentDecl,
    statements: string[],
    names: GeneratedNames
  ): { el: string; template: string } {
    const fragment = this.next(QwikGenWord.Fragment);
    const el = this.next(QwikGenWord.Element);
    const template = `${component.name}_${this.next(QwikGenWord.Template)}`;
    statements.push(`const ${fragment} = ${template}(${names.ctx}.document);`);
    this.imports.add(QwikWord.FirstChild);
    statements.push(`const ${el} = ${QwikWord.FirstChild}(${fragment});`);
    return { el, template };
  }

  /** After the dynamic wiring, so the template import keeps the request order. */
  private hoistTemplate(template: string, html: string): void {
    this.imports.add(QwikWord.CreateTemplate);
    this.hoists.push(`const ${template} = ${QwikWord.CreateTemplate}(${JSON.stringify(html)});`);
  }

  /** Events wire the imported chunk fn onto the live element — they never enter the template. */
  private event(
    scopeName: string,
    handlers: Extract<Prop, { k: PropKind.Event }>['handlers'],
    el: string,
    statements: string[]
  ): void {
    const symbols = handlers.map((handler) => {
      if (handler.h !== HandlerKind.Value || handler.value.v !== ValueKind.Qrl) {
        throw new UnsupportedError('a non-QRL event handler');
      }
      return this.chunkSymbol(handler.value.use.qrl);
    });
    const value = symbols.length === 1 ? symbols[0] : `[${symbols.join(', ')}]`;
    this.imports.add(QwikWord.SetEvent);
    statements.push(`${QwikWord.SetEvent}(${el}, ${JSON.stringify(scopeName)}, ${value});`);
  }

  private chunkSymbol(id: string): string {
    const qrl = this.module.qrls.find((candidate) => candidate.id === id);
    if (qrl === undefined) {
      throw new Error(`pipeline.generateJsCsr: unknown qrl "${id}"`);
    }
    if (!this.importedChunks.has(qrl.id)) {
      this.importedChunks.add(qrl.id);
      this.chunkImports.push(
        `import { ${qrl.name} } from ${JSON.stringify(`./${chunkCanonicalFilename(this.module, qrl)}`)};`
      );
    }
    return qrl.name;
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
