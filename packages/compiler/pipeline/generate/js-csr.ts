/** `generateJsCsr(browserLinkedPlan, options)` — browser modules from the browser LinkedPlan. */
import {
  Environment,
  HandlerKind,
  ModuleKind,
  OpKind,
  PropKind,
  ProgramBodyKind,
  QrlBodyKind,
  ValueKind,
  type LinkedModule,
  type LinkedPlan,
  type LinkedQrl,
  type Op,
  type Prop,
} from '../schema';
import { QwikWord, QwikGenWord } from '../words';
import { UnsupportedError } from '../errors';
import { generateQwikModule, type QwikModuleEmitter } from './assemble-module';
import {
  captureNames,
  chunkCanonicalFilename,
  sourceFunctionEmission,
  type FunctionEmission,
} from './emit-chunk';
import { emitJsSetup, signalReadName } from './emit-setup';
import { escapeText } from '../html';
import { foldStaticOp, isFullyStaticSubtree } from './fold-static';
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

class CsrModuleEmitter implements QwikModuleEmitter {
  readonly imports = new Set<string>();
  readonly chunkImports: string[] = [];
  readonly hoists: string[] = [];
  private readonly importedChunks = new Set<string>();
  private readonly lazyQrls = new Set<string>();
  /** Per-component: generated locals are function-scoped, so numbering restarts per render. */
  private next!: (prefix: string) => string;

  constructor(private readonly module: LinkedModule) {}

  emitProgram(qrl: LinkedQrl, names: GeneratedNames): ComponentEmission {
    if (qrl.body.b !== QrlBodyKind.Program) {
      throw new Error(`pipeline.generateJsCsr: splicing the non-program qrl "${qrl.id}"`);
    }
    return this.renderProgram(qrl.body.program, qrl.declaration?.name ?? qrl.name, names);
  }

  /** The shared render core — component bodies and branch arm programs emit identically. */
  private renderProgram(
    programId: number,
    ownerName: string,
    names: GeneratedNames
  ): ComponentEmission {
    const program = this.module.programs[programId];
    if (program.body.kind !== ProgramBodyKind.Ops) {
      throw new Error('pipeline.generateJsCsr: js-bodied programs not implemented yet');
    }
    this.next = createNameAllocator();
    const statements: string[] = emitJsSetup(this.module, program, this.imports);
    const roots: string[] = [];
    for (const op of program.body.ops) {
      roots.push(this.op(op, ownerName, statements, names));
    }
    if (roots.length > 1) {
      throw new Error('pipeline.generateJsCsr: multi-root renders not implemented yet');
    }
    return { statements, value: roots.length === 0 ? '[]' : roots[0] };
  }

  /** Returns the local holding the op's root node. */
  private op(op: Op, ownerName: string, statements: string[], names: GeneratedNames): string {
    switch (op.op) {
      case OpKind.Static:
        return this.staticRoot(op, ownerName, statements, names);
      case OpKind.Element:
        return this.elementRoot(op, ownerName, statements, names);
      default:
        throw new Error(`pipeline.generateJsCsr: op "${op.op}" not implemented yet`);
    }
  }

  private staticRoot(
    op: Extract<Op, { op: OpKind.Static }>,
    ownerName: string,
    statements: string[],
    names: GeneratedNames
  ): string {
    const mounted = this.mountTemplate(ownerName, statements, names);
    this.hoistTemplate(mounted.template, foldStaticOp(op, true));
    return mounted.el;
  }

  private elementRoot(
    op: Extract<Op, { op: OpKind.Element }>,
    ownerName: string,
    statements: string[],
    names: GeneratedNames
  ): string {
    const mounted = this.mountTemplate(ownerName, statements, names);
    for (const prop of op.props) {
      switch (prop.k) {
        case PropKind.Static: {
          break;
        }
        case PropKind.Event: {
          this.event(prop.name, prop.handlers, mounted.el, statements);
          break;
        }
        case PropKind.Dynamic: {
          this.dynamicProp(prop, mounted.el, statements, names);
          break;
        }
        default: {
          throw new UnsupportedError(`the prop "${prop.k}" in a csr element`);
        }
      }
    }
    this.walkChildren(op, mounted.el, statements, names);
    // Template markup excludes event props; templateOp pre-escapes text for innerHTML parsing.
    this.hoistTemplate(mounted.template, foldStaticOp(templateOp(op), false));
    return mounted.el;
  }

  /** Dispatches an element's children; nested elements compose the locator path. */
  private walkChildren(
    op: Extract<Op, { op: OpKind.Element }>,
    elementExpr: string,
    statements: string[],
    names: GeneratedNames
  ): void {
    // Branches occupy TWO template nodes (their start/end comment pair).
    const nodeCount = op.children.reduce(
      (count, child) => count + (child.op === OpKind.Branch ? 2 : 1),
      0
    );
    let nodeIndex = 0;
    for (const child of op.children) {
      switch (child.op) {
        case OpKind.Static: {
          nodeIndex++;
          break;
        }
        case OpKind.Hole: {
          this.textHole(child, elementExpr, statements, names, nodeCount, nodeIndex++);
          break;
        }
        case OpKind.Element: {
          if (!isFullyStaticSubtree(child)) {
            this.walkChildren(
              child,
              childPathExpression(elementExpr, nodeIndex, nodeCount, this.imports),
              statements,
              names
            );
          }
          nodeIndex++;
          break;
        }
        case OpKind.Branch: {
          this.branch(child, elementExpr, nodeIndex, nodeCount, statements, names);
          nodeIndex += 2;
          break;
        }
        default: {
          throw new UnsupportedError(`the child op "${child.op}" in a csr element`);
        }
      }
    }
  }

  /** The branch swaps DOM between its start/end comment pair via a range effect. */
  private branch(
    op: Extract<Op, { op: OpKind.Branch }>,
    elementExpr: string,
    nodeIndex: number,
    nodeCount: number,
    statements: string[],
    names: GeneratedNames
  ): void {
    const start = this.next(QwikGenWord.Start);
    statements.push(
      `const ${start} = ${childPathExpression(elementExpr, nodeIndex, nodeCount, this.imports)};`
    );
    const end = this.next(QwikGenWord.End);
    this.imports.add(QwikWord.NextSibling);
    statements.push(`const ${end} = ${QwikWord.NextSibling}(${start});`);
    if (op.condition.v !== ValueKind.Qrl) {
      throw new UnsupportedError('a non-QRL branch condition');
    }
    const conditionQrl = this.qrlById(op.condition.use.qrl);
    this.imports.add(QwikWord.BranchRange);
    this.imports.add(QwikWord.CreateBranch);
    const conditionCaptures = captureNames(this.module, conditionQrl);
    let condition = this.chunkSymbol(conditionQrl.id);
    if (conditionCaptures.length > 0) {
      this.imports.add(QwikWord.WithCaptures);
      condition = `${QwikWord.WithCaptures}(${condition}, [${conditionCaptures.join(', ')}])`;
    }
    const thenRef = this.lazyQrlReference(this.armQrl(op.then));
    const elseRef = op.else === null ? 'undefined' : this.lazyQrlReference(this.armQrl(op.else));
    const branch = this.next(QwikGenWord.Branch);
    statements.push(
      `const ${branch} = ${QwikWord.CreateBranch}(${names.ctx}, new ${QwikWord.BranchRange}(${names.ctx}.document, ${start}, ${end}), ${condition}, ${thenRef}, ${elseRef});`
    );
    statements.push(`${names.ctx}.scheduler.notify(${branch});`);
  }

  /** An arm's function is a normal render program; source-bodied QRLs replay authored code. */
  qrlFunction(qrl: LinkedQrl): FunctionEmission {
    if (qrl.body.b !== QrlBodyKind.Program) {
      return sourceFunctionEmission(this.module, qrl);
    }
    // A fresh emitter keeps the render's imports/hoists out of the main module.
    const emitter = new CsrModuleEmitter(this.module);
    const names = { props: QwikGenWord.ComponentProps, ctx: QwikGenWord.ComponentContext };
    const emission = emitter.renderProgram(qrl.body.program, qrl.name, names);
    return {
      imports: emitter.imports,
      chunkImports: emitter.chunkImports,
      hoists: emitter.hoists,
      params: emission.statements.length === 0 ? [] : [names.ctx],
      statements: emission.statements,
      value: emission.value,
      async: false,
    };
  }

  /** Arms load lazily: a hoisted `_qrlWithChunk` reference per arm chunk. */
  private lazyQrlReference(qrl: LinkedQrl): string {
    if (!this.lazyQrls.has(qrl.id)) {
      this.lazyQrls.add(qrl.id);
      const path = `./${chunkCanonicalFilename(this.module, qrl)}`;
      this.imports.add(QwikWord.QrlWithChunk);
      this.hoists.push(
        `const q_${qrl.name} = /*#__PURE__*/ ${QwikWord.QrlWithChunk}(${JSON.stringify(path)}, () => import(${JSON.stringify(path)}), ${JSON.stringify(qrl.name)});`
      );
    }
    return `q_${qrl.name}`;
  }

  private armQrl(program: number): LinkedQrl {
    const qrl = this.module.qrls.find(
      (candidate) => candidate.body.b === QrlBodyKind.Program && candidate.body.program === program
    );
    if (qrl === undefined) {
      throw new Error(`pipeline.generateJsCsr: no qrl for the arm program ${program}`);
    }
    return qrl;
  }

  private qrlById(id: string): LinkedQrl {
    const qrl = this.module.qrls.find((candidate) => candidate.id === id);
    if (qrl === undefined) {
      throw new Error(`pipeline.generateJsCsr: unknown qrl "${id}"`);
    }
    return qrl;
  }

  /** Dynamic attrs bind an effect against the element itself — no lookup, no marker. */
  private dynamicProp(
    prop: Extract<Prop, { k: PropKind.Dynamic }>,
    el: string,
    statements: string[],
    names: GeneratedNames
  ): void {
    const effect = this.next(QwikGenWord.Effect);
    switch (prop.value.v) {
      case ValueKind.Read: {
        // Signal reads bind directly — no chunk involved.
        const signal = signalReadName(this.module, prop.value.expr);
        this.imports.add(QwikWord.CreateAttrEffect);
        statements.push(
          `const ${effect} = ${QwikWord.CreateAttrEffect}(${el}, ${JSON.stringify(prop.name)}, ${signal}, ${names.ctx}.scheduler);`
        );
        break;
      }
      case ValueKind.Computed: {
        if (!('qrl' in prop.value.resume)) {
          throw new UnsupportedError('a non-QRL computed prop');
        }
        const use = prop.value.resume.qrl;
        const qrl = this.module.qrls.find((candidate) => candidate.id === use.qrl);
        if (qrl === undefined) {
          throw new Error(`pipeline.generateJsCsr: unknown qrl "${use.qrl}"`);
        }
        const captures = captureNames(this.module, qrl);
        this.imports.add(QwikWord.CreateAttrExpressionEffect);
        statements.push(
          `const ${effect} = ${QwikWord.CreateAttrExpressionEffect}(${el}, ${JSON.stringify(prop.name)}, [${captures.join(', ')}], ${this.chunkSymbol(qrl.id)}, ${names.ctx}.scheduler);`
        );
        break;
      }
      default:
        throw new UnsupportedError(`the dynamic prop value "${prop.value.v}"`);
    }
    statements.push(`${names.ctx}.scheduler.notify(${effect});`);
  }

  /** The effect re-runs the expression chunk against the resolved target text node. */
  private textHole(
    op: Extract<Op, { op: OpKind.Hole }>,
    text: string,
    statements: string[],
    names: GeneratedNames,
    nodeCount: number,
    nodeIndex: number
  ): void {
    const path = childPathExpression(text, nodeIndex, nodeCount, this.imports);
    const target = this.next(QwikGenWord.Text);

    if (nodeCount === 1) {
      statements.push(`const ${target} = ${path};`);
    } else if (nodeCount > 1) {
      // The comment placeholder cannot carry text — swap in an empty text node.
      const marker = this.next(QwikGenWord.Marker);
      statements.push(`const ${marker} = ${path};`);
      statements.push(`const ${target} = ${names.ctx}.document.createTextNode('');`);
      statements.push(`${marker}.replaceWith(${target});`);
    }

    switch (op.value.v) {
      case ValueKind.Read: {
        // Signal reads bind the placeholder text node directly — no chunk involved.
        const signal = signalReadName(this.module, op.value.expr);
        const effect = this.next(QwikGenWord.Effect);
        this.imports.add(QwikWord.CreateTextNodeEffect);
        statements.push(
          `const ${effect} = ${QwikWord.CreateTextNodeEffect}(${target}, ${signal}, ${names.ctx}.scheduler);`
        );
        statements.push(`${names.ctx}.scheduler.notify(${effect});`);
        break;
      }
      case ValueKind.Computed: {
        if (!('qrl' in op.value.resume)) {
          throw new UnsupportedError('a non-QRL computed text hole');
        }
        const use = op.value.resume.qrl;
        const qrl = this.module.qrls.find((candidate) => candidate.id === use.qrl);
        if (qrl === undefined) {
          throw new Error(`pipeline.generateJsCsr: unknown qrl "${use.qrl}"`);
        }
        const effect = this.next(QwikGenWord.Effect);
        const captures = captureNames(this.module, qrl);
        this.imports.add(QwikWord.CreateTextExpressionEffect);
        statements.push(
          `const ${effect} = ${QwikWord.CreateTextExpressionEffect}(${target}, [${captures.join(
            ', '
          )}], ${this.chunkSymbol(qrl.id)}, ${names.ctx}.scheduler);`
        );
        statements.push(`${names.ctx}.scheduler.notify(${effect});`);
        break;
      }
      default:
        throw new UnsupportedError('a non-computed text hole');
    }
  }

  /** Clones the template into fresh `fragmentN`/`elN` locals. */
  private mountTemplate(
    ownerName: string,
    statements: string[],
    names: GeneratedNames
  ): { el: string; template: string } {
    const fragment = this.next(QwikGenWord.Fragment);
    const el = this.next(QwikGenWord.Element);
    const template = `${ownerName}_${this.next(QwikGenWord.Template)}`;
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
    if (qrls.length > 1 && qrls.some((qrl) => qrl.captures.length > 0)) {
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

/**
 * Template shape: events stripped; a sole hole becomes a single-space text node, a hole among
 * siblings an empty comment (adjacent text would merge with a text placeholder). Text is
 * pre-escaped HERE so the raw comment placeholder survives the fold.
 */
function templateOp(op: Extract<Op, { op: OpKind.Element }>): Op {
  const placeholder = op.children.length > 1 ? '<!---->' : ' ';
  return {
    ...op,
    props: op.props.filter((prop) => prop.k === PropKind.Static),
    children: op.children.map((child) => {
      switch (child.op) {
        case OpKind.Hole:
          return { op: OpKind.Static as const, html: placeholder };
        case OpKind.Element:
          return templateOp(child);
        case OpKind.Static:
          return { ...child, html: escapeText(child.html) };
        case OpKind.Branch:
          // The branch's start/end comment pair.
          return { op: OpKind.Static as const, html: '<!----><!---->' };
        default:
          return child;
      }
    }),
  };
}

/**
 * Shortest navigation to the template child at `index` of `nodeCount` nodes; ties prefer the front
 * walk — the only shape the legacy oracle emits.
 */
export function childPathExpression(
  el: string,
  index: number,
  nodeCount: number,
  imports: Set<string>
): string {
  const stepsFromBack = nodeCount - 1 - index;
  if (stepsFromBack < index) {
    imports.add(QwikWord.LastChild);
    let path = `${QwikWord.LastChild}(${el})`;
    for (let i = 0; i < stepsFromBack; i++) {
      imports.add(QwikWord.PreviousSibling);
      path = `${QwikWord.PreviousSibling}(${path})`;
    }
    return path;
  }
  imports.add(QwikWord.FirstChild);
  let path = `${QwikWord.FirstChild}(${el})`;
  for (let i = 0; i < index; i++) {
    imports.add(QwikWord.NextSibling);
    path = `${QwikWord.NextSibling}(${path})`;
  }
  return path;
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
