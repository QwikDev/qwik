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
import { captureNames, chunkCanonicalFilename } from './emit-chunk';
import { emitJsSetup, signalReadName } from './emit-setup';
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
    const statements: string[] = emitJsSetup(
      this.module,
      this.module.programs[component.body],
      this.imports
    );
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
    const holes = op.children.filter((child) => child.op === OpKind.Hole);
    if (holes.length > 0) {
      // A sole hole child binds the template's placeholder text node (deeper positions later).
      if (op.children.length !== 1) {
        throw new UnsupportedError('a text hole with sibling children');
      }
      this.textHole(holes[0] as Extract<Op, { op: OpKind.Hole }>, mounted.el, statements, names);
    }
    // Template markup excludes event props; text is escaped for innerHTML parsing.
    this.hoistTemplate(mounted.template, foldStaticOp(templateOp(op), true));
    return mounted.el;
  }

  /** The effect re-runs the expression chunk against the placeholder text node. */
  private textHole(
    op: Extract<Op, { op: OpKind.Hole }>,
    el: string,
    statements: string[],
    names: GeneratedNames
  ): void {
    if (op.value.v === ValueKind.Read) {
      // Signal reads bind the placeholder text node directly — no chunk involved.
      const signal = signalReadName(this.module, op.value.expr);
      const text = this.next(QwikGenWord.Text);
      statements.push(`const ${text} = ${QwikWord.FirstChild}(${el});`);
      const effect = this.next(QwikGenWord.Effect);
      this.imports.add(QwikWord.CreateTextNodeEffect);
      statements.push(
        `const ${effect} = ${QwikWord.CreateTextNodeEffect}(${text}, ${signal}, ${names.ctx}.scheduler);`
      );
      statements.push(`${names.ctx}.scheduler.notify(${effect});`);
      return;
    }
    if (op.value.v !== ValueKind.Computed || !('qrl' in op.value.resume)) {
      throw new UnsupportedError('a non-computed text hole');
    }
    const use = op.value.resume.qrl;
    const qrl = this.module.qrls.find((candidate) => candidate.id === use.qrl);
    if (qrl === undefined) {
      throw new Error(`pipeline.generateJsCsr: unknown qrl "${use.qrl}"`);
    }
    const text = this.next(QwikGenWord.Text);
    statements.push(`const ${text} = ${QwikWord.FirstChild}(${el});`);
    const effect = this.next(QwikGenWord.Effect);
    const captures = captureNames(this.module, qrl);
    this.imports.add(QwikWord.CreateTextExpressionEffect);
    statements.push(
      `const ${effect} = ${QwikWord.CreateTextExpressionEffect}(${text}, [${captures.join(', ')}], ${this.chunkSymbol(qrl.id)}, ${names.ctx}.scheduler);`
    );
    statements.push(`${names.ctx}.scheduler.notify(${effect});`);
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
    const qrls = handlers.map((handler) => {
      const value = handler.h === HandlerKind.Value ? handler.value : null;
      if (value === null || value.v !== ValueKind.Qrl) {
        throw new UnsupportedError('a non-QRL event handler');
      }
      const qrl = this.module.qrls.find((candidate) => candidate.id === value.use.qrl);
      if (qrl === undefined) {
        throw new Error('pipeline.generateJsCsr: unknown qrl');
      }
      return qrl;
    });
    if (qrls.length > 1 && qrls.some((qrl) => qrl.formals.length > 0)) {
      throw new UnsupportedError('captures across multiple handlers of one event');
    }
    const symbols = qrls.map((qrl) => this.chunkSymbol(qrl.id));
    const captures = captureNames(this.module, qrls[0]);
    const value = symbols.length === 1 ? symbols[0] : `[${symbols.join(', ')}]`;
    this.imports.add(QwikWord.SetEvent);
    statements.push(
      `${QwikWord.SetEvent}(${el}, ${JSON.stringify(scopeName)}, ${value}${captures.length === 0 ? '' : `, [${captures.join(', ')}]`});`
    );
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

/** Template shape: events stripped, holes become a single-space placeholder text node. */
function templateOp(op: Extract<Op, { op: OpKind.Element }>): Op {
  return {
    ...op,
    props: op.props.filter((prop) => prop.k === PropKind.Static),
    children: op.children.map((child) =>
      child.op === OpKind.Hole ? { op: OpKind.Static as const, html: ' ' } : child
    ),
  };
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
