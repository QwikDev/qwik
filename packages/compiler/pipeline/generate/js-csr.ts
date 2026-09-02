/** `generateJsCsr(browserLinkedPlan, options)` — browser modules from the browser LinkedPlan. */
import {
  Environment,
  HandlerKind,
  ModuleKind,
  OpKind,
  PropKind,
  EachSourceKind,
  ProgramBodyKind,
  QrlBodyKind,
  ResumeKind,
  RowKind,
  ValueKind,
  type LinkedModule,
  type LinkedPlan,
  type LinkedQrl,
  type LinkedOp,
  type Prop,
} from '../schema';
import { QwikWord, QwikGenWord } from '../words';
import { UnsupportedError } from '../errors';
import { generateQwikModule, type QwikModuleEmitter } from './assemble-module';
import {
  captureNames,
  capturePrelude,
  emptyFunctionEmission,
  inlineValueJs,
  programKind,
  usedParamPrefix,
  ProgramKind,
  rowShapeCode,
  chunkCanonicalFilename,
  qrlPropsName,
  resolveQrlUse,
  sourceFunctionEmission,
  type FunctionEmission,
} from './emit-chunk';
import { emitJsSetup, signalReadName } from './emit-setup';
import { escapeText } from '../html';
import { foldStaticOp, isFullyStaticSubtree } from './fold-static';
import {
  createNameAllocator,
  emitComponentCall,
  type ComponentEmission,
  type GeneratedNames,
} from './emit-component';
import { generateForeignModule } from './foreign';
import {
  createFailedModule,
  makeOutput,
  type GenerateOutput,
  type PresentationOptions,
} from './output';

type TextOp = Extract<LinkedOp, { op: OpKind.Static | OpKind.Hole }>;

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
      return generateQwikModule(module, new CsrModuleEmitter(module), options, 'module-top');
    case ModuleKind.Failed:
      return [createFailedModule(module.path)];
    case ModuleKind.ExportsOnly:
      throw new Error(
        `pipeline.generateJsCsr: ${module.kind} modules not implemented yet (slice 2): ${module.path}`
      );
  }
}

/** Everything one render pass carries — created in renderProgram, threaded explicitly. */
interface RenderPass {
  names: GeneratedNames;
  next: (prefix: string) => string;
}

class CsrModuleEmitter implements QwikModuleEmitter {
  readonly imports = new Set<string>();
  readonly chunkImports: string[] = [];
  readonly hoists: string[] = [];
  private readonly importedChunks = new Set<string>();
  private readonly lazyQrls = new Set<string>();

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
    const pass: RenderPass = { names, next: createNameAllocator(this.module) };
    const statements: string[] = emitJsSetup(this.module, program, this.imports);
    const ops = program.body.ops;
    if (ops.length === 0) {
      return { statements, value: '[]' };
    }
    if (ops.length === 1) {
      return {
        statements,
        value: this.op(ops[0], ownerName, statements, pass),
      };
    }
    if (ops.every((op): op is TextOp => op.op === OpKind.Static || op.op === OpKind.Hole)) {
      return {
        statements,
        value: `[${this.textRoots(ops, ownerName, statements, pass).join(', ')}]`,
      };
    }
    const roots = ops.map((op) => this.op(op, ownerName, statements, pass));
    return {
      statements,
      value: `[${roots.join(', ')}]`,
    };
  }

  private textRoots(
    ops: TextOp[],
    ownerName: string,
    statements: string[],
    pass: RenderPass
  ): string[] {
    const fragment = pass.next(QwikGenWord.Fragment);
    const template = `${ownerName}_${pass.next(QwikGenWord.Template)}`;
    statements.push(`const ${fragment} = ${template}(${pass.names.ctx}.document);`);

    this.imports.add(QwikWord.FirstChild);
    this.imports.add(QwikWord.NextSibling);
    const roots: string[] = [];
    let path = `${QwikWord.FirstChild}(${fragment})`;
    for (const op of ops) {
      let text: string;
      if (op.op === OpKind.Static) {
        text = pass.next(QwikGenWord.Text);
        statements.push(`const ${text} = ${path};`);
      } else {
        const marker = pass.next(QwikGenWord.Marker);
        statements.push(`const ${marker} = ${path};`);
        text = pass.next(QwikGenWord.Text);
        statements.push(`const ${text} = ${pass.names.ctx}.document.createTextNode('');`);
        statements.push(`${marker}.replaceWith(${text});`);
        this.bindTextHole(op, text, statements, pass);
      }
      roots.push(text);
      path = `${QwikWord.NextSibling}(${text})`;
    }

    this.hoistTemplate(
      template,
      ops.map((op) => (op.op === OpKind.Static ? escapeText(op.html) : '<!---->')).join('')
    );
    return roots;
  }

  /** Returns the local holding the op's root node. */
  private op(op: LinkedOp, ownerName: string, statements: string[], pass: RenderPass): string {
    switch (op.op) {
      case OpKind.Static:
        return this.staticRoot(op, ownerName, statements, pass);
      case OpKind.Element:
        return this.elementRoot(op, ownerName, statements, pass);
      case OpKind.Hole:
        return this.holeRoot(op, statements, pass);
      case OpKind.Component:
        return this.createComponent(op, statements, pass);
      default:
        throw new Error(`pipeline.generateJsCsr: op "${op.op}" not implemented yet`);
    }
  }

  private createComponent(
    op: Extract<LinkedOp, { op: OpKind.Component }>,
    statements: string[],
    pass: RenderPass
  ): string {
    const component = pass.next(QwikGenWord.Component);
    const call = emitComponentCall(this.module, op, pass, this.imports, (use) => {
      const { qrl, args } = resolveQrlUse(this.module, use, pass.names.props);
      return { qrl, reference: this.lazyQrlReference(qrl), args };
    });
    statements.push(...call.statements, `const ${component} = ${call.expression};`);
    return component;
  }

  private holeRoot(
    op: Extract<LinkedOp, { op: OpKind.Hole }>,
    statements: string[],
    pass: RenderPass
  ): string {
    const text = pass.next(QwikGenWord.Text);
    statements.push(`const ${text} = ${pass.names.ctx}.document.createTextNode('');`);
    this.bindTextHole(op, text, statements, pass);
    return text;
  }

  private staticRoot(
    op: Extract<LinkedOp, { op: OpKind.Static }>,
    ownerName: string,
    statements: string[],
    pass: RenderPass
  ): string {
    const mounted = this.mountTemplate(ownerName, statements, pass);
    this.hoistTemplate(mounted.template, foldStaticOp(op, true));
    return mounted.el;
  }

  private elementRoot(
    op: Extract<LinkedOp, { op: OpKind.Element }>,
    ownerName: string,
    statements: string[],
    pass: RenderPass
  ): string {
    const mounted = this.mountTemplate(ownerName, statements, pass);
    this.elementProps(op, mounted.el, statements, pass);
    this.walkChildren(op.children, mounted.el, statements, pass);
    // Template markup excludes event props; templateOp pre-escapes text for innerHTML parsing.
    this.hoistTemplate(mounted.template, foldStaticOp(templateOp(op), false));
    return mounted.el;
  }

  /** Wires an element's non-static props — events and dynamic attributes — onto its node. */
  private elementProps(
    op: Extract<LinkedOp, { op: OpKind.Element }>,
    el: string,
    statements: string[],
    pass: RenderPass
  ): void {
    for (const prop of op.props) {
      switch (prop.k) {
        case PropKind.Static: {
          break;
        }
        case PropKind.Event: {
          this.event(prop.name, prop.handlers, el, statements, pass);
          break;
        }
        case PropKind.Dynamic: {
          this.dynamicProp(prop, el, statements, pass);
          break;
        }
        default: {
          throw new UnsupportedError(`the prop "${prop.k}" in a csr element`);
        }
      }
    }
  }

  /** Dispatches a node's children; nested elements compose the locator path. */
  private walkChildren(
    children: readonly LinkedOp[],
    elementExpr: string,
    statements: string[],
    pass: RenderPass
  ): void {
    const nodeCount = children.reduce((count, child) => count + templateNodeCount(child), 0);
    let nodeIndex = 0;
    for (const child of children) {
      switch (child.op) {
        case OpKind.Static: {
          nodeIndex++;
          break;
        }
        case OpKind.Hole: {
          this.textHole(child, elementExpr, statements, pass, nodeCount, nodeIndex++);
          break;
        }
        case OpKind.Element: {
          if (!isFullyStaticSubtree(child)) {
            const path = childPathExpression(elementExpr, nodeIndex, nodeCount, this.imports);
            if (child.props.some((prop) => prop.k !== PropKind.Static)) {
              const el = pass.next(QwikGenWord.Element);
              statements.push(`const ${el} = ${path};`);
              this.elementProps(child, el, statements, pass);
              this.walkChildren(child.children, el, statements, pass);
            } else {
              this.walkChildren(child.children, path, statements, pass);
            }
          }
          nodeIndex++;
          break;
        }
        case OpKind.Branch: {
          this.branch(child, elementExpr, nodeIndex, nodeCount, statements, pass);
          nodeIndex += 2;
          break;
        }
        case OpKind.Each: {
          this.each(child, elementExpr, nodeIndex, nodeCount, statements, pass);
          nodeIndex += 2;
          break;
        }
        case OpKind.Component: {
          this.mountComponent(child, elementExpr, nodeIndex, nodeCount, statements, pass);
          nodeIndex += 2;
          break;
        }
        default: {
          throw new UnsupportedError(`the child op "${child.op}" in a csr element`);
        }
      }
    }
  }

  private mountComponent(
    op: Extract<LinkedOp, { op: OpKind.Component }>,
    elementExpr: string,
    nodeIndex: number,
    nodeCount: number,
    statements: string[],
    pass: RenderPass
  ): void {
    const { start, end } = this.locateRange(elementExpr, nodeIndex, nodeCount, statements, pass);
    const component = this.createComponent(op, statements, pass);
    this.imports.add(QwikWord.ToNodes);
    statements.push(
      `for (const node of ${QwikWord.ToNodes}(${component})) { ${end}.parentNode.insertBefore(node, ${end}); }`
    );
    statements.push(`${start}.remove();`);
    statements.push(`${end}.remove();`);
  }

  /** The branch swaps DOM between its start/end comment pair via a range effect. */
  private branch(
    op: Extract<LinkedOp, { op: OpKind.Branch }>,
    elementExpr: string,
    nodeIndex: number,
    nodeCount: number,
    statements: string[],
    pass: RenderPass
  ): void {
    const { start, end } = this.locateRange(elementExpr, nodeIndex, nodeCount, statements, pass);
    if (op.condition.v !== ValueKind.Qrl) {
      throw new UnsupportedError('a non-QRL branch condition');
    }
    const conditionUse = resolveQrlUse(this.module, op.condition.use, pass.names.props);
    this.imports.add(QwikWord.BranchRange);
    this.imports.add(QwikWord.CreateBranch);
    let condition = this.chunkSymbol(conditionUse.qrl);
    if (conditionUse.args.length > 0) {
      this.imports.add(QwikWord.WithCaptures);
      condition = `${QwikWord.WithCaptures}(${condition}, [${conditionUse.args.join(', ')}])`;
    }
    const thenRef = this.armReference(op.then, pass.names.props);
    const elseRef = op.else === null ? 'undefined' : this.armReference(op.else, pass.names.props);
    const branch = pass.next(QwikGenWord.Branch);
    statements.push(
      `const ${branch} = ${QwikWord.CreateBranch}(${pass.names.ctx}, new ${QwikWord.BranchRange}(${pass.names.ctx}.document, ${start}, ${end}), ${condition}, ${thenRef}, ${elseRef});`
    );
    statements.push(`${pass.names.ctx}.scheduler.notify(${branch});`);
  }

  /** Rows reconcile between the start/end pair; key and render chunks import statically. */
  private each(
    op: Extract<LinkedOp, { op: OpKind.Each }>,
    elementExpr: string,
    nodeIndex: number,
    nodeCount: number,
    statements: string[],
    pass: RenderPass
  ): void {
    const { start, end } = this.locateRange(elementExpr, nodeIndex, nodeCount, statements, pass);
    let source: string;
    switch (op.source.s) {
      case EachSourceKind.Array:
        source = inlineValueJs(this.module, op.source.value);
        break;
      case EachSourceKind.Reactive:
        if (op.source.value.v !== ValueKind.Read) {
          throw new UnsupportedError('a non-signal collection source');
        }
        source = signalReadName(this.module, op.source.value.expr);
        break;
      default:
        throw new UnsupportedError(`the collection source "${op.source.s}"`);
    }
    this.imports.add(QwikWord.CreateCollection);
    switch (op.row.r) {
      case RowKind.Chunk: {
        // Import order matches the seed: render chunk first, key second.
        const render = this.chunkSymbol(
          resolveQrlUse(this.module, op.row.use, pass.names.props).qrl
        );
        if (op.key !== null && op.key.v !== ValueKind.Qrl) {
          throw new UnsupportedError('a non-QRL collection key');
        }
        const key =
          op.key === null
            ? 'null'
            : this.chunkSymbol(resolveQrlUse(this.module, op.key.use, pass.names.props).qrl);
        statements.push(
          `${pass.names.ctx}.scheduler.waitFor(${QwikWord.CreateCollection}(${pass.names.ctx}, ${start}, ${end}, ${source}, ${key}, ${render}, ${op.index}, '', ${rowShapeCode(op.shape)}));`
        );
        break;
      }
      case RowKind.Inline: {
        if (op.key !== null) {
          throw new UnsupportedError('a keyed inline collection row');
        }
        // One-shot render: local row function, transient collection, nothing awaited.
        const rowFn = this.inlineRowFunction(op.row, statements);
        statements.push(
          `${QwikWord.CreateCollection}(${pass.names.ctx}, ${start}, ${end}, ${source}, null, ${rowFn}, ${op.index}, '', ${rowShapeCode(op.shape)}, true);`
        );
        break;
      }
    }
  }

  private locateRange(
    elementExpr: string,
    nodeIndex: number,
    nodeCount: number,
    statements: string[],
    pass: RenderPass
  ): { start: string; end: string } {
    const start = pass.next(QwikGenWord.Start);
    statements.push(
      `const ${start} = ${childPathExpression(elementExpr, nodeIndex, nodeCount, this.imports)};`
    );
    const end = pass.next(QwikGenWord.End);
    this.imports.add(QwikWord.NextSibling);
    statements.push(`const ${end} = ${QwikWord.NextSibling}(${start});`);
    return { start, end };
  }

  /** Inline row: a local function over a module-hoisted element template. */
  private inlineRowFunction(
    row: { program: number; renderId: string },
    statements: string[]
  ): string {
    const body = this.module.programs[row.program].body;
    if (body.kind !== ProgramBodyKind.Ops) {
      throw new UnsupportedError('a js-bodied inline collection row');
    }
    const root = body.ops[0];
    if (body.ops.length !== 1 || root.op !== OpKind.Element) {
      throw new UnsupportedError('a rootless row in an inline collection');
    }
    // A fresh pass for name numbering; THIS emitter keeps chunk imports and hoists module-level.
    const pass: RenderPass = {
      names: { props: QwikGenWord.ComponentProps, ctx: QwikGenWord.ComponentContext },
      next: createNameAllocator(this.module),
    };
    const template = `${row.renderId}_${pass.next(QwikGenWord.Template)}`;
    const el = pass.next(QwikGenWord.Element);
    const rowStatements = [`const ${el} = ${template}(${pass.names.ctx}.document);`];
    for (const prop of root.props) {
      if (prop.k !== PropKind.Static) {
        throw new UnsupportedError(`the prop "${prop.k}" in an inline collection row root`);
      }
    }
    this.walkChildren(root.children, el, rowStatements, pass);
    this.imports.add(QwikWord.CreateElementTemplate);
    this.hoists.push(
      `const ${template} = ${QwikWord.CreateElementTemplate}(${JSON.stringify(foldStaticOp(templateOp(root), false))});`
    );
    const loopParams = this.module.programs[row.program].params
      .map((binding) => `, ${this.module.bindings[binding].name}`)
      .join('');
    const bodyText = [...rowStatements, `return ${el};`]
      .map((statement) => `  ${statement}`)
      .join('\n');
    statements.push(`function ${row.renderId}(ctx${loopParams}) {\n${bodyText}\n}`);
    return row.renderId;
  }

  /** A lazy arm ref wears its captures via `.w([...])` — restored from `_captures` in the chunk. */
  private armReference(
    use: Extract<LinkedOp, { op: OpKind.Branch }>['then'],
    propsName: string
  ): string {
    const resolved = resolveQrlUse(this.module, use, propsName);
    const ref = this.lazyQrlReference(resolved.qrl);
    return resolved.args.length === 0 ? ref : `${ref}.w([${resolved.args.join(', ')}])`;
  }

  /** An arm's function is a normal render program; source-bodied QRLs replay authored code. */
  qrlFunction(qrl: LinkedQrl): FunctionEmission {
    switch (qrl.body.b) {
      case QrlBodyKind.Js:
      case QrlBodyKind.Expr:
        return sourceFunctionEmission(this.module, qrl);
      case QrlBodyKind.Task:
        throw new UnsupportedError('a task QRL body');
      case QrlBodyKind.Program: {
        if (programKind(qrl) === ProgramKind.CollectionRow) {
          return this.rowFunction(qrl);
        }
        // A fresh emitter keeps the render's imports/hoists out of the main module.
        const emitter = new CsrModuleEmitter(this.module);
        const names = {
          props: qrlPropsName(this.module, qrl, QwikGenWord.ComponentProps),
          ctx: QwikGenWord.ComponentContext,
        };
        const emission = emitter.renderProgram(qrl.body.program, qrl.name, names);
        // Captures restore from `_captures` ahead of the render statements.
        const captures = captureNames(this.module, qrl);
        const statements = [...capturePrelude(captures), ...emission.statements];
        return {
          imports: new Set([
            ...(captures.length > 0 ? [QwikWord.Captures] : []),
            ...emitter.imports,
          ]),
          chunkImports: emitter.chunkImports,
          hoists: emitter.hoists,
          params: statements.length === 0 ? [] : [names.ctx],
          statements,
          value: emission.value,
          async: false,
          uses: [],
        };
      }
    }
  }

  /** A row mounts through an element template — the root element IS the return value. */
  private rowFunction(qrl: LinkedQrl): FunctionEmission {
    if (qrl.body.b !== QrlBodyKind.Program) {
      throw new UnsupportedError('a non-program collection row');
    }
    const program = this.module.programs[qrl.body.program];
    const body = program.body;
    if (body.kind !== ProgramBodyKind.Ops) {
      throw new UnsupportedError('a js-bodied collection row');
    }
    const root = body.ops[0];
    const elementRoot = body.ops.length === 1 && root.op === OpKind.Element;
    // A fresh emitter keeps the row's imports/chunk references out of the main module.
    const emitter = new CsrModuleEmitter(this.module);
    const pass: RenderPass = {
      names: {
        props: qrlPropsName(this.module, qrl, QwikGenWord.ComponentProps),
        ctx: QwikGenWord.ComponentContext,
      },
      next: createNameAllocator(this.module),
    };
    const emission = emptyFunctionEmission();
    const template = `${qrl.name}_${pass.next(QwikGenWord.Template)}`;
    let statements: string[];
    let value: string;
    if (elementRoot && root.op === OpKind.Element) {
      const el = pass.next(QwikGenWord.Element);
      statements = [`const ${el} = ${template}(${pass.names.ctx}.document);`];
      emitter.elementProps(root, el, statements, pass);
      emitter.walkChildren(root.children, el, statements, pass);
      // Row roots mount through an element template — the root element IS the return value.
      emitter.imports.add(QwikWord.CreateElementTemplate);
      emitter.hoists.push(
        `const ${template} = ${QwikWord.CreateElementTemplate}(${JSON.stringify(foldStaticOp(templateOp(root), false))});`
      );
      value = el;
    } else {
      // Rootless rows mount a fragment template; the runtime brackets the nodes in `<!r>`.
      const fragment = pass.next(QwikGenWord.Fragment);
      statements = [`const ${fragment} = ${template}(${pass.names.ctx}.document);`];
      emitter.walkChildren(body.ops, fragment, statements, pass);
      emitter.imports.add(QwikWord.CreateTemplate);
      const html = templateChildren(body.ops)
        .map((child) => foldStaticOp(child, false))
        .join('');
      emitter.hoists.push(
        `const ${template} = ${QwikWord.CreateTemplate}(${JSON.stringify(html)});`
      );
      // Mirrors Shape.Text: one text node; branches/collections span two marker nodes.
      const singleNode =
        body.ops.length === 1 && (root.op === OpKind.Static || root.op === OpKind.Hole);
      value = singleNode
        ? childPathExpression(fragment, 0, 1, emitter.imports)
        : `[...${fragment}.childNodes]`;
    }
    const loopParams = usedParamPrefix(this.module, qrl);
    emission.params = statements.length === 0 ? [] : [pass.names.ctx, ...loopParams];
    emission.statements = statements;
    emission.value = value;
    emission.imports = emitter.imports;
    emission.chunkImports = emitter.chunkImports;
    emission.hoists = emitter.hoists;
    return emission;
  }

  /** CSR nested references are direct symbol imports (chunkImports) — nothing left to satisfy. */
  resolveChunkUses(emission: FunctionEmission): FunctionEmission {
    return emission;
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

  /** Dynamic attrs bind an effect against the element itself — no lookup, no marker. */
  private dynamicProp(
    prop: Extract<Prop, { k: PropKind.Dynamic }>,
    el: string,
    statements: string[],
    pass: RenderPass
  ): void {
    const effect = pass.next(QwikGenWord.Effect);
    switch (prop.value.v) {
      case ValueKind.Read: {
        // Signal reads bind directly — no chunk involved.
        const signal = signalReadName(this.module, prop.value.expr);
        this.imports.add(QwikWord.CreateAttrEffect);
        statements.push(
          `const ${effect} = ${QwikWord.CreateAttrEffect}(${el}, ${JSON.stringify(prop.name)}, ${signal}, ${pass.names.ctx}.scheduler);`
        );
        break;
      }
      case ValueKind.Computed: {
        if (prop.value.resume.r !== ResumeKind.Qrl) {
          throw new UnsupportedError('a non-QRL computed prop');
        }
        const use = prop.value.resume.qrl;
        const resolved = resolveQrlUse(this.module, use, pass.names.props);
        this.imports.add(QwikWord.CreateAttrExpressionEffect);
        statements.push(
          `const ${effect} = ${QwikWord.CreateAttrExpressionEffect}(${el}, ${JSON.stringify(prop.name)}, [${resolved.args.join(', ')}], ${this.chunkSymbol(resolved.qrl)}, ${pass.names.ctx}.scheduler);`
        );
        break;
      }
      default:
        throw new UnsupportedError(`the dynamic prop value "${prop.value.v}"`);
    }
    statements.push(`${pass.names.ctx}.scheduler.notify(${effect});`);
  }

  /** The effect re-runs the expression chunk against the resolved target text node. */
  private textHole(
    op: Extract<LinkedOp, { op: OpKind.Hole }>,
    text: string,
    statements: string[],
    pass: RenderPass,
    nodeCount: number,
    nodeIndex: number
  ): void {
    const path = childPathExpression(text, nodeIndex, nodeCount, this.imports);
    if (op.value.v === ValueKind.Computed && op.value.resume.r === ResumeKind.Inline) {
      // Lexical inline value: the text is fixed for the row's lifetime — no effect.
      this.imports.add(QwikWord.TextValue);
      const value = `${QwikWord.TextValue}(${inlineValueJs(this.module, op.value)})`;
      if (nodeCount === 1) {
        statements.push(`${path}.data = ${value};`);
      } else {
        const marker = pass.next(QwikGenWord.Marker);
        statements.push(`const ${marker} = ${path};`);
        statements.push(
          `${marker}.replaceWith(${pass.names.ctx}.document.createTextNode(${value}));`
        );
      }
      return;
    }
    const target = pass.next(QwikGenWord.Text);

    if (nodeCount === 1) {
      statements.push(`const ${target} = ${path};`);
    } else if (nodeCount > 1) {
      // The comment placeholder cannot carry text — swap in an empty text node.
      const marker = pass.next(QwikGenWord.Marker);
      statements.push(`const ${marker} = ${path};`);
      statements.push(`const ${target} = ${pass.names.ctx}.document.createTextNode('');`);
      statements.push(`${marker}.replaceWith(${target});`);
    }

    this.bindTextHole(op, target, statements, pass);
  }

  private bindTextHole(
    op: Extract<LinkedOp, { op: OpKind.Hole }>,
    target: string,
    statements: string[],
    pass: RenderPass
  ): void {
    switch (op.value.v) {
      case ValueKind.Read: {
        // Signal reads bind the placeholder text node directly — no chunk involved.
        const signal = signalReadName(this.module, op.value.expr);
        const effect = pass.next(QwikGenWord.Effect);
        this.imports.add(QwikWord.CreateTextNodeEffect);
        statements.push(
          `const ${effect} = ${QwikWord.CreateTextNodeEffect}(${target}, ${signal}, ${pass.names.ctx}.scheduler${op.stringify ? ', true' : ''});`
        );
        statements.push(`${pass.names.ctx}.scheduler.notify(${effect});`);
        break;
      }
      case ValueKind.Computed: {
        if (op.value.resume.r !== ResumeKind.Qrl) {
          throw new UnsupportedError('a non-QRL computed text hole');
        }
        const use = op.value.resume.qrl;
        const resolved = resolveQrlUse(this.module, use, pass.names.props);
        const effect = pass.next(QwikGenWord.Effect);
        this.imports.add(QwikWord.CreateTextExpressionEffect);
        statements.push(
          `const ${effect} = ${QwikWord.CreateTextExpressionEffect}(${target}, [${resolved.args.join(
            ', '
          )}], ${this.chunkSymbol(resolved.qrl)}, ${pass.names.ctx}.scheduler);`
        );
        statements.push(`${pass.names.ctx}.scheduler.notify(${effect});`);
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
    pass: RenderPass
  ): { el: string; template: string } {
    const fragment = pass.next(QwikGenWord.Fragment);
    const el = pass.next(QwikGenWord.Element);
    const template = `${ownerName}_${pass.next(QwikGenWord.Template)}`;
    statements.push(`const ${fragment} = ${template}(${pass.names.ctx}.document);`);
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
    statements: string[],
    pass: RenderPass
  ): void {
    const uses = handlers.map((handler) => {
      const value = handler.h === HandlerKind.Value ? handler.value : null;
      if (value === null || value.v !== ValueKind.Qrl) {
        throw new UnsupportedError('a non-QRL event handler');
      }
      return resolveQrlUse(this.module, value.use, pass.names.props);
    });
    if (uses.length > 1 && uses.some((use) => use.args.length > 0)) {
      throw new UnsupportedError('captures across multiple handlers of one event');
    }
    const symbols = uses.map((use) => this.chunkSymbol(use.qrl));
    const args = uses[0].args;
    const value = symbols.length === 1 ? symbols[0] : `[${symbols.join(', ')}]`;
    this.imports.add(QwikWord.SetEvent);
    statements.push(
      `${QwikWord.SetEvent}(${el}, ${JSON.stringify(scopeName)}, ${value}${args.length === 0 ? '' : `, [${args.join(', ')}]`});`
    );
  }

  private chunkSymbol(qrl: LinkedQrl): string {
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
function templateOp(op: Extract<LinkedOp, { op: OpKind.Element }>): LinkedOp {
  return {
    ...op,
    props: op.props.filter((prop) => prop.k === PropKind.Static),
    children: templateChildren(op.children),
  };
}

/** Template form of a child list — holes and boundaries become locator placeholders. */
function templateChildren(children: readonly LinkedOp[]): LinkedOp[] {
  const placeholder = children.length > 1 ? '<!---->' : ' ';
  return children.map((child) => {
    switch (child.op) {
      case OpKind.Hole:
        return { op: OpKind.Static as const, html: placeholder };
      case OpKind.Element:
        return templateOp(child);
      case OpKind.Static:
        return { ...child, html: escapeText(child.html) };
      case OpKind.Branch:
      case OpKind.Each:
      case OpKind.Component:
        // A dynamic range's start/end comment pair.
        return { op: OpKind.Static as const, html: '<!----><!---->' };
      default:
        return child;
    }
  });
}

function templateNodeCount(op: LinkedOp): number {
  switch (op.op) {
    case OpKind.Branch:
    case OpKind.Each:
    case OpKind.Component:
      return 2;
    default:
      return 1;
  }
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
