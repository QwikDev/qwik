/** `generateJsSsr(serverLinkedPlan, options)` — the baseline generator over the server LinkedPlan. */
import {
  Environment,
  HandlerKind,
  QrlBodyKind,
  QrlPayloadKind,
  ModuleKind,
  OpKind,
  PropKind,
  ProgramBodyKind,
  ResumeKind,
  RowKind,
  Shape,
  ValueKind,
  type LinkedModule,
  type LinkedPlan,
  type LinkedQrl,
  type Op,
  type Prop,
  type QrlUse,
  type Value,
  EachSourceKind,
} from '../schema';
import { QwikAttr, QwikGenWord, QwikWord } from '../words';
import { escapeAttr, serializeAttrValue } from '../html';
import { UnsupportedError } from '../errors';
import { generateQwikModule, type QwikModuleEmitter } from './assemble-module';
import {
  captureNames,
  capturePrelude,
  inlineValueJs,
  rootArgs,
  usedParamPrefix,
  programKind,
  ProgramKind,
  rowShapeCode,
  chunkCanonicalFilename,
  emptyFunctionEmission,
  functionText,
  qrlPropsName,
  resolveQrlUse,
  sourceFunctionEmission,
  type FunctionEmission,
} from './emit-chunk';
import { emitJsSetup, signalReadName } from './emit-setup';
import { foldStaticOp, isFullyStaticSubtree } from './fold-static';
import { createNameAllocator, type ComponentEmission, type GeneratedNames } from './emit-component';
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
      return generateQwikModule(module, new SsrModuleEmitter(module));
    case ModuleKind.ExportsOnly:
    case ModuleKind.Failed:
      throw new Error(
        `pipeline.generateJsSsr: ${module.kind} modules not implemented yet (slice 1): ${module.path}`
      );
  }
}

interface QrlUsage {
  qrl: LinkedQrl;
  /** Invoked segments (render expressions) get an in-module mirror registered via `.s()`. */
  invoked: boolean;
}

interface SsrProgramEmission extends ComponentEmission {
  rangeIdParam: string | null;
  /** The rendered value references `ctx` (e.g. event attr parts) even without statements. */
  needsContext: boolean;
}

type SsrTextTarget =
  | { kind: 'element'; id: string }
  | { kind: 'range'; id: string; markerIndex: number };

interface SsrRootRange {
  idParam: string | null;
  markerIndex: number;
}

/** Everything one render pass accumulates — created in renderProgram, threaded explicitly. */
interface RenderPass {
  names: GeneratedNames;
  statements: string[];
  asyncSteps: string[];
  next: (prefix: string) => string;
  /** The rendered value references `ctx` (e.g. event attr parts) even without statements. */
  usedCtx: boolean;
}

/** Per-kind needs the emission wrappers state explicitly — the core never inspects the QRL. */
/** The runtime row ABI's positional parameter names. */
const RangeIdParam = '__rangeId';
const RowIdParam = '__rowId';

interface SsrRenderOptions {
  /** Stamped into the root element's open tag (a row's `q:row`). */
  rootMarker?: string;
  /** Root holes render into a caller-supplied range id parameter (branch arms). */
  rootRange?: boolean;
  /** Brackets the output in `<!r=id>...<!/r>` — rows with no single element root. */
  rowFence?: boolean;
}

class SsrModuleEmitter implements QwikModuleEmitter {
  readonly imports = new Set<string>();
  readonly chunkImports: string[] = [];
  readonly hoists: string[] = [];
  private readonly usedQrls = new Map<string, QrlUsage>();

  constructor(private readonly module: LinkedModule) {}

  emitProgram(qrl: LinkedQrl, names: GeneratedNames): ComponentEmission {
    const emission = this.renderProgram(qrl, names);
    // QRL hoists flush after the body so their imports keep the request order.
    this.flushQrlHoists();
    return emission;
  }

  /** The kind-agnostic render core — wrappers state their needs through `options`. */
  private renderProgram(
    qrl: LinkedQrl,
    names: GeneratedNames,
    options: SsrRenderOptions = {}
  ): SsrProgramEmission {
    if (qrl.body.b !== QrlBodyKind.Program) {
      throw new Error(`pipeline.generateJsSsr: rendering the non-program qrl "${qrl.id}"`);
    }
    return this.renderProgramById(qrl.body.program, names, options);
  }

  private renderProgramById(
    programId: number,
    names: GeneratedNames,
    options: SsrRenderOptions = {}
  ): SsrProgramEmission {
    const program = this.module.programs[programId];
    const body = program.body;
    if (body.kind !== ProgramBodyKind.Ops) {
      throw new Error('pipeline.generateJsSsr: js-bodied programs not implemented yet');
    }
    const pass: RenderPass = {
      names,
      statements: emitJsSetup(this.module, program, this.imports),
      asyncSteps: [],
      next: createNameAllocator(this.module),
      usedCtx: false,
    };
    const rootRange: SsrRootRange | null = options.rootRange
      ? { idParam: null, markerIndex: 0 }
      : options.rowFence
        ? // Root holes in a fenced row target the row's own marker range.
          { idParam: RowIdParam, markerIndex: 0 }
        : null;
    const parts: string[] = [];
    if (options.rowFence) {
      this.imports.add(QwikWord.CreateSsrNodeId);
      pushMergedStatic(parts, '<!r=');
      parts.push(`${QwikWord.CreateSsrNodeId}(${RowIdParam})`);
      pushMergedStatic(parts, '>');
    }
    for (const op of body.ops) {
      this.op(pass, op, parts, rootRange, options.rootMarker ?? null);
    }
    if (options.rowFence) {
      pushMergedStatic(parts, '<!/r>');
    }
    let value = parts.length === 0 ? "''" : parts.length === 1 ? parts[0] : `[${parts.join(', ')}]`;
    if (pass.asyncSteps.length > 0) {
      this.imports.add(QwikWord.MaybeThen);
      value = pass.asyncSteps.reduceRight(
        (inner, step) => `${QwikWord.MaybeThen}(${step}, (${step}) => ${inner})`,
        value
      );
    }
    return {
      statements: pass.statements,
      value,
      rangeIdParam: rootRange?.idParam ?? null,
      needsContext: pass.usedCtx || pass.statements.length > 0,
    };
  }

  /** One context-neutral producer per QRL — its `uses` are satisfied by the placement. */
  qrlFunction(qrl: LinkedQrl): FunctionEmission {
    switch (qrl.body.b) {
      case QrlBodyKind.Js:
      case QrlBodyKind.Expr:
        return sourceFunctionEmission(this.module, qrl);
      case QrlBodyKind.Task:
        throw new UnsupportedError('a task QRL body');
      case QrlBodyKind.Program:
        switch (programKind(qrl)) {
          case ProgramKind.BranchArm:
            return this.armEmission(qrl);
          case ProgramKind.CollectionRow:
            return this.rowEmission(qrl);
          case ProgramKind.Component:
            throw new UnsupportedError('a component program as a chunk');
        }
    }
  }

  /** Branch arm: any root shape; ABI `(ctx, rangeId?)` — rangeId when a root hole allocated it. */
  private armEmission(qrl: LinkedQrl): FunctionEmission {
    if (this.programOps(qrl).length === 0) {
      const emission = emptyFunctionEmission();
      emission.value = '[]';
      return emission;
    }
    const { emission, core, names } = this.renderEmission(qrl, { rootRange: true });
    emission.params =
      core.rangeIdParam === null
        ? emission.statements.length === 0
          ? []
          : [names.ctx]
        : [names.ctx, core.rangeIdParam];
    return emission;
  }

  /** Collection row: an element root wears `q:row`; any other shape brackets in `<!r=id>`. */
  private rowEmission(qrl: LinkedQrl): FunctionEmission {
    const ops = this.programOps(qrl);
    const elementRoot = ops.length === 1 && ops[0].op === OpKind.Element;
    const { emission, core, names } = this.renderEmission(
      qrl,
      elementRoot ? { rootMarker: QwikAttr.Row } : { rowFence: true }
    );
    const loopParams = usedParamPrefix(this.module, qrl);
    if (!elementRoot || loopParams.length > 0) {
      // Positional ABI: trailing unused params drop, earlier ones stay under their names.
      emission.params = [names.ctx, RangeIdParam, RowIdParam, ...loopParams];
    } else if (core.needsContext) {
      emission.params = [names.ctx];
    }
    return emission;
  }

  /** Fresh-emitter render + capture prelude + import/uses handoff — shared by every kind. */
  private renderEmission(
    qrl: LinkedQrl,
    options: SsrRenderOptions
  ): { emission: FunctionEmission; core: SsrProgramEmission; names: GeneratedNames } {
    const emitter = new SsrModuleEmitter(this.module);
    const names = {
      props: qrlPropsName(this.module, qrl, QwikGenWord.ComponentProps),
      ctx: QwikGenWord.ComponentContext,
    };
    const core = emitter.renderProgram(qrl, names, options);
    const captures = captureNames(this.module, qrl);
    const emission = emptyFunctionEmission();
    emission.statements = [...capturePrelude(captures), ...core.statements];
    emission.value = core.value;
    if (captures.length > 0) {
      emission.imports.add(QwikWord.Captures);
    }
    for (const name of emitter.imports) {
      emission.imports.add(name);
    }
    emission.uses = [...emitter.usedQrls.values()];
    return { emission, core, names };
  }

  private programOps(qrl: LinkedQrl): readonly Op[] {
    if (qrl.body.b !== QrlBodyKind.Program) {
      throw new Error(`pipeline.generateJsSsr: rendering the non-program qrl "${qrl.id}"`);
    }
    const body = this.module.programs[qrl.body.program].body;
    if (body.kind !== ProgramBodyKind.Ops) {
      throw new UnsupportedError('a js-bodied render program');
    }
    return body.ops;
  }

  /** A chunk satisfies its uses itself: sibling-chunk import + `_noopQrl` registration. */
  resolveChunkUses(emission: FunctionEmission): FunctionEmission {
    if (emission.uses.length === 0) {
      return emission;
    }
    // Registration requests `_noopQrl` ahead of the body's own imports.
    emission.imports = new Set([QwikWord.NoopQrl, ...emission.imports]);
    for (const usage of emission.uses) {
      const nested = usage.qrl;
      emission.hoists.push(
        `const q_${nested.name} = /*#__PURE__*/ ${QwikWord.NoopQrl}(${JSON.stringify(nested.name)});`
      );
      // Only invoked uses need the function itself; references stay name-only.
      if (usage.invoked) {
        emission.chunkImports.push(
          `import { ${nested.name} } from ${JSON.stringify(`./${chunkCanonicalFilename(this.module, nested)}`)};`
        );
        emission.hoists.push(`q_${nested.name}.s(${nested.name});`);
      }
    }
    return emission;
  }

  private op(
    pass: RenderPass,
    op: Op,
    parts: string[],
    rootRange: SsrRootRange | null,
    rootMarker: string | null = null
  ): void {
    switch (op.op) {
      case OpKind.Static:
        // SSR streams raw text; adjacent static runs merge into one string part.
        pushMergedStatic(parts, foldStaticOp(op, false));
        return;
      case OpKind.Element:
        // A marked root always renders through element() so the marker lands in its open tag.
        if (rootMarker === null && isFullyStaticSubtree(op)) {
          pushMergedStatic(parts, foldStaticOp(op, false));
          return;
        }
        this.element(pass, op, parts, rootMarker);
        return;
      case OpKind.Hole:
        if (rootRange === null) {
          throw new UnsupportedError('a root text hole outside a range');
        }
        rootRange.idParam ??= pass.next(QwikGenWord.RangeId);
        this.textHole(
          pass,
          op,
          { kind: 'range', id: rootRange.idParam, markerIndex: rootRange.markerIndex++ },
          parts
        );
        return;
      default:
        throw new Error(`pipeline.generateJsSsr: op "${op.op}" not implemented yet`);
    }
  }

  private element(
    pass: RenderPass,
    op: Extract<Op, { op: OpKind.Element }>,
    parts: string[],
    /** Stamped into this element's open tag — a row root's `q:row`. */
    rootMarker: string | null = null
  ): void {
    const holes = op.children.filter((child) => child.op === OpKind.Hole && !isInlineHole(child));
    const hasDynamicProps = op.props.some((prop) => prop.k === PropKind.Dynamic);
    const idVariable = holes.length > 0 || hasDynamicProps ? pass.next(QwikGenWord.Id) : null;
    if (idVariable !== null) {
      pass.statements.push(`const ${idVariable} = ${pass.names.ctx}.nextId();`);
    }
    pushMergedStatic(parts, `<${op.tag}`);
    if (idVariable !== null) {
      this.imports.add(QwikWord.CreateSsrNodeId);
      pushMergedStatic(parts, ` ${QwikAttr.Id}="`);
      parts.push(`${QwikWord.CreateSsrNodeId}(${idVariable})`);
      pushMergedStatic(parts, `"`);
    }
    if (rootMarker !== null) {
      pushMergedStatic(parts, ` ${rootMarker}`);
    }
    for (const prop of op.props) {
      this.prop(pass, prop, parts, idVariable);
    }
    pushMergedStatic(parts, '>');

    let textRangeCount = 0;
    for (const child of op.children) {
      switch (child.op) {
        case OpKind.Static: {
          pushMergedStatic(parts, foldStaticOp(child, false));
          break;
        }
        case OpKind.Hole: {
          if (isInlineHole(child)) {
            this.inlineText(child, parts);
            break;
          }
          this.textHole(
            pass,
            child,
            op.children.length > 1
              ? {
                  kind: 'range',
                  id: idVariable!,
                  markerIndex: textRangeCount++,
                }
              : { kind: 'element', id: idVariable! },
            parts
          );
          break;
        }
        case OpKind.Element: {
          if (isFullyStaticSubtree(child)) {
            pushMergedStatic(parts, foldStaticOp(child, false));
          } else {
            this.element(pass, child, parts);
          }
          break;
        }
        case OpKind.Branch: {
          this.branch(pass, child, parts);
          break;
        }
        case OpKind.Each: {
          this.each(pass, child, parts);
          break;
        }
        default: {
          if (!isFullyStaticSubtree(child)) {
            throw new UnsupportedError('a dynamic child inside an element record');
          }
          pushMergedStatic(parts, foldStaticOp(child, false));
        }
      }
    }
    if (!op.void) {
      pushMergedStatic(parts, `</${op.tag}>`);
    }
  }

  /** A collection renders between `<!f=N>`…`<!/f>` markers; rows reconcile by key. */
  private each(pass: RenderPass, op: Extract<Op, { op: OpKind.Each }>, parts: string[]): void {
    // get source
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
    switch (op.row.r) {
      case RowKind.Chunk: {
        const idVariable = pass.next(QwikGenWord.CollectionId);
        pass.statements.push(`const ${idVariable} = ${pass.names.ctx}.nextId();`);
        // Registration order fixes the mirror order: render first, key second.
        const render = this.useQrl(pass, op.row.use, true);
        const key = op.key === null ? null : this.useQrl(pass, this.qrlValueUse(op.key), true);
        this.imports.add(QwikWord.RenderSsrCollection);
        const step = pass.next(QwikGenWord.Collection);
        // Element-shaped rows wear the q:row marker, so the runtime needs no per-row id.
        const usesRowId = op.shape !== Shape.Element;
        this.pushStep(
          pass,
          step,
          [source, ...render.args, ...(key?.args ?? [])],
          `${QwikWord.RenderSsrCollection}(${pass.names.ctx}, ${idVariable}, ${source}, ${key?.ref ?? 'undefined'}, ${render.ref}, ${op.index}, '', ${usesRowId}, ${rowShapeCode(op.shape)})`
        );
        pushMergedStatic(parts, '<!f=');
        this.imports.add(QwikWord.CreateSsrNodeId);
        parts.push(`${QwikWord.CreateSsrNodeId}(${idVariable})`);
        pushMergedStatic(parts, '>');
        parts.push(step);
        pushMergedStatic(parts, '<!/f>');
        break;
      }
      case RowKind.Inline: {
        if (op.key !== null) {
          throw new UnsupportedError('a keyed inline collection row');
        }
        // One-shot render: no id, no markers, no roots — the row is a plain local function.
        const rowFn = this.inlineRowFunction(pass, op.row);
        this.imports.add(QwikWord.RenderSsrCollection);
        const step = pass.next(QwikGenWord.Collection);
        pass.statements.push(
          `const ${step} = ${QwikWord.RenderSsrCollection}(${pass.names.ctx}, undefined, ${source}, undefined, ${rowFn}, ${op.index}, '', false, ${rowShapeCode(op.shape)});`
        );
        parts.push(step);
        break;
      }
    }
  }

  /** Inline row: a function declared in the component; renderId links declaration and call. */
  private inlineRowFunction(pass: RenderPass, row: { program: number; renderId: string }): string {
    const emitter = new SsrModuleEmitter(this.module);
    const names = { props: QwikGenWord.ComponentProps, ctx: QwikGenWord.ComponentContext };
    const core = emitter.renderProgramById(row.program, names);
    const loopParams = this.module.programs[row.program].params
      .map((binding) => `, ${this.module.bindings[binding].name}`)
      .join('');
    if (emitter.usedQrls.size > 0) {
      throw new UnsupportedError('a qrl inside an inline collection row');
    }
    for (const name of emitter.imports) {
      this.imports.add(name);
    }
    const body = [...core.statements, `return ${core.value};`]
      .map((statement) => `  ${statement}`)
      .join('\n');
    pass.statements.push(
      `function ${row.renderId}(ctx, ${RangeIdParam}, ${RowIdParam}${loopParams}) {\n${body}\n}`
    );
    return row.renderId;
  }

  private qrlValueUse(value: Value): QrlUse {
    if (value.v !== ValueKind.Qrl) {
      throw new UnsupportedError(`the value "${value.v}" as a QRL reference`);
    }
    return value.use;
  }

  /** A branch renders between `<!b=N>`…`<!/b>` markers; arms swap on the client by range. */
  private branch(pass: RenderPass, op: Extract<Op, { op: OpKind.Branch }>, parts: string[]): void {
    const idVariable = pass.next(QwikGenWord.BranchId);
    pass.statements.push(`const ${idVariable} = ${pass.names.ctx}.nextId();`);
    if (op.condition.v !== ValueKind.Qrl) {
      throw new UnsupportedError('a non-QRL branch condition');
    }
    const { ref: condition, args } = this.useQrl(pass, op.condition.use, true);
    const thenArm = this.useQrl(pass, op.then, true);
    const elseArm = op.else === null ? null : this.useQrl(pass, op.else, true);
    this.imports.add(QwikWord.RenderSsrBranch);
    const step = pass.next(QwikGenWord.Branch);
    this.pushStep(
      pass,
      step,
      [...args, ...thenArm.args, ...(elseArm?.args ?? [])],
      `${QwikWord.RenderSsrBranch}(${pass.names.ctx}, ${idVariable}, ${condition}, ${thenArm.ref}, ${elseArm?.ref ?? 'undefined'})`
    );
    pushMergedStatic(parts, '<!b=');
    this.imports.add(QwikWord.CreateSsrNodeId);
    parts.push(`${QwikWord.CreateSsrNodeId}(${idVariable})`);
    pushMergedStatic(parts, '>');
    parts.push(step);
    pushMergedStatic(parts, '<!/b>');
  }

  /** Lexical inline value: coerce + escape in place — nothing ever targets this text. */
  private inlineText(op: Extract<Op, { op: OpKind.Hole }>, parts: string[]): void {
    this.imports.add(QwikWord.EscapeHTML);
    this.imports.add(QwikWord.TextValue);
    parts.push(
      `${QwikWord.EscapeHTML}(${QwikWord.TextValue}(${inlineValueJs(this.module, op.value)}))`
    );
  }

  private textHole(
    pass: RenderPass,
    op: Extract<Op, { op: OpKind.Hole }>,
    target: SsrTextTarget,
    parts: string[]
  ): void {
    const createTextTarget =
      target.kind === 'range'
        ? `${QwikWord.CreateSsrRangeTextTarget}(${target.id}, ${target.markerIndex})`
        : `${QwikWord.CreateSsrElementTextTarget}(${target.id})`;
    this.imports.add(
      target.kind === 'range'
        ? QwikWord.CreateSsrRangeTextTarget
        : QwikWord.CreateSsrElementTextTarget
    );
    this.imports.add(QwikWord.EscapeHTML);
    const step = pass.next(QwikGenWord.Text);

    if (target.kind === 'range') {
      pushMergedStatic(parts, '<!t>');
    }

    switch (op.value.v) {
      case ValueKind.Read: {
        // Signal reads subscribe directly — no QRL involved.
        const signal = signalReadName(this.module, op.value.expr);
        this.imports.add(QwikWord.RenderSsrTextNode);
        this.pushStep(
          pass,
          step,
          [signal],
          `${QwikWord.RenderSsrTextNode}(${createTextTarget}, ${signal}${op.stringify ? ', undefined, true' : ''})`
        );
        parts.push(`${QwikWord.EscapeHTML}(${step})`);
        break;
      }
      case ValueKind.Computed: {
        if (op.value.resume.r !== ResumeKind.Qrl) {
          throw new UnsupportedError('a non-QRL computed text hole');
        }
        const { qrl, ref, args } = this.useQrl(pass, op.value.resume.qrl, true);
        this.imports.add(QwikWord.RenderSsrTextExpression);
        this.pushStep(
          pass,
          step,
          rootArgs(qrl, args),
          `${QwikWord.RenderSsrTextExpression}(${createTextTarget}, [${args.join(', ')}], ${ref})`
        );
        parts.push(`${QwikWord.EscapeHTML}(${step})`);
        break;
      }
      default: {
        throw new UnsupportedError('a non-computed text hole');
      }
    }

    if (target.kind === 'range') {
      pushMergedStatic(parts, '<!/t>');
    }
  }

  /** Every step evaluates eagerly before the first await (see the divergence ledger). */
  private pushStep(
    pass: RenderPass,
    step: string,
    roots: readonly string[],
    callExpr: string
  ): void {
    for (const root of roots) {
      pass.statements.push(`${pass.names.ctx}.addRoot(${root});`);
    }
    pass.statements.push(`const ${step} = ${callExpr};`);
    pass.asyncSteps.push(step);
  }

  /**
   * Emission-side use of a QRL: the reference text with its actual arguments baked in. Function
   * payloads wear `.w([args])`; Value payloads keep a bare reference and receive args separately.
   */
  private useQrl(pass: RenderPass, use: QrlUse, invoked: boolean) {
    const { qrl, args } = resolveQrlUse(this.module, use, pass.names.props);
    let ref = this.qrlReference(qrl, invoked);
    if (qrl.payloadKind === QrlPayloadKind.Function && args.length > 0) {
      ref = `${ref}.w([${args.join(', ')}])`;
      if (invoked) {
        this.imports.add(QwikWord.Captures);
      }
    }
    return { qrl, ref, args };
  }

  private prop(pass: RenderPass, prop: Prop, parts: string[], idVariable: string | null): void {
    switch (prop.k) {
      case PropKind.Static: {
        const serialized = serializeAttrValue(prop.name, prop.value ?? null);
        if (serialized === null) {
          return;
        }
        pushMergedStatic(
          parts,
          serialized === '' ? ` ${prop.name}` : ` ${prop.name}="${escapeAttr(serialized)}"`
        );
        return;
      }
      case PropKind.Dynamic: {
        const step = pass.next(QwikGenWord.Attribute);
        this.imports.add(QwikWord.CreateSsrElementTarget);
        const target = `${QwikWord.CreateSsrElementTarget}(${idVariable})`;
        switch (prop.value.v) {
          case ValueKind.Read: {
            const signal = signalReadName(this.module, prop.value.expr);
            this.imports.add(QwikWord.RenderSsrAttr);
            this.pushStep(
              pass,
              step,
              [signal],
              `${QwikWord.RenderSsrAttr}(${target}, ${JSON.stringify(prop.name)}, ${signal})`
            );
            break;
          }
          case ValueKind.Computed: {
            if (prop.value.resume.r !== ResumeKind.Qrl) {
              throw new UnsupportedError('a non-QRL computed prop');
            }
            const { qrl, ref, args } = this.useQrl(pass, prop.value.resume.qrl, true);
            this.imports.add(QwikWord.RenderSsrAttrExpression);
            this.pushStep(
              pass,
              step,
              rootArgs(qrl, args),
              `${QwikWord.RenderSsrAttrExpression}(${target}, ${JSON.stringify(prop.name)}, [${args.join(', ')}], ${ref})`
            );
            break;
          }
          default:
            throw new UnsupportedError(`the dynamic prop value "${prop.value.v}"`);
        }
        // the open-tag part — attr semantics: null = absent, '' = bare, else quoted+escaped
        this.imports.add(QwikWord.EscapeHTML);
        parts.push(
          `${step} === null ? '' : ' ${prop.name}' + (${step} === '' ? '' : '="' + ${QwikWord.EscapeHTML}(${step}) + '"')`
        );
        return;
      }
      case PropKind.Event: {
        const values = prop.handlers.map((handler) => {
          if (handler.h !== HandlerKind.Value || handler.value.v !== ValueKind.Qrl) {
            throw new UnsupportedError('a non-QRL event handler');
          }
          return this.useQrl(pass, handler.value.use, false).ref;
        });
        const value = values.length === 1 ? values[0] : `[${values.join(', ')}]`;
        pass.usedCtx = true;
        parts.push(`${pass.names.ctx}.eventAttrParts(${JSON.stringify(prop.name)}, ${value})`);
        return;
      }
      default:
        throw new UnsupportedError(`the prop "${prop.k}" in an SSR element record`);
    }
  }

  private qrlReference(qrl: LinkedQrl, invoked = false): string {
    const usage = this.usedQrls.get(qrl.id);
    if (usage === undefined) {
      this.usedQrls.set(qrl.id, { qrl, invoked });
    } else {
      usage.invoked = usage.invoked || invoked;
    }
    return `q_${qrl.name}`;
  }

  private flushQrlHoists(): void {
    for (const usage of this.usedQrls.values()) {
      const { qrl } = usage;
      if (usage.invoked) {
        // The server invokes render expressions in-module: mirror fn + `.s()` registration.
        const emission = this.qrlFunction(qrl);
        for (const name of emission.imports) {
          this.imports.add(name);
        }
        // The mirror's uses land on the outer module — this very flush registers them next.
        for (const use of emission.uses) {
          const existing = this.usedQrls.get(use.qrl.id);
          if (existing === undefined) {
            this.usedQrls.set(use.qrl.id, use);
          } else {
            existing.invoked = existing.invoked || use.invoked;
          }
        }
        this.hoists.push(`const ${qrl.name} = ${functionText(emission)};`);
        this.imports.add(QwikWord.NoopQrl);
        this.hoists.push(
          `const q_${qrl.name} = /*#__PURE__*/ ${QwikWord.NoopQrl}(${JSON.stringify(qrl.name)});`
        );
        this.hoists.push(`q_${qrl.name}.s(${qrl.name});`);
      } else {
        this.imports.add(QwikWord.NoopQrl);
        this.hoists.push(
          `const q_${qrl.name} = /*#__PURE__*/ ${QwikWord.NoopQrl}(${JSON.stringify(qrl.name)});`
        );
      }
    }
    this.usedQrls.clear();
  }
}

function pushMergedStatic(parts: string[], text: string): void {
  const last = parts[parts.length - 1];
  if (last !== undefined && last.startsWith('"')) {
    parts[parts.length - 1] = JSON.stringify((JSON.parse(last) as string) + text);
  } else {
    parts.push(JSON.stringify(text));
  }
}

function isInlineHole(op: Extract<Op, { op: OpKind.Hole }>): boolean {
  return op.value.v === ValueKind.Computed && op.value.resume.r === ResumeKind.Inline;
}
