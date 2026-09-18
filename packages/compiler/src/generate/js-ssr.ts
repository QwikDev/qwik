/** `generateJsSsr(serverLinkedPlan, options)` — the baseline generator over the server LinkedPlan. */
import {
  BoundaryKind,
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
  type LinkedOp,
  type Prop,
  type HookDecl,
  type QrlUse,
  type Value,
} from '../schema';
import { QwikAttr, QwikDirective, QwikGenWord, QwikWord, SegmentContext } from '../words';
import { escapeAttr, NEWLINE_EATING_ELEMENTS, serializeAttrValue } from '../html';
import { UnsupportedError } from '../errors';
import { generateQwikModule, type QwikModuleEmitter } from './assemble-module';
import {
  captureNames,
  boundReference,
  capturePrelude,
  functionPrelude,
  rootArgs,
  usedParamPrefix,
  qrlPropsName,
} from './captures';
import {
  dynamicSlotEmission,
  programKind,
  ProgramKind,
  rowShapeCode,
  emptyFunctionEmission,
  type FunctionEmission,
} from './emit-function';
import { extractPayloadJs, bindHandlerJs, inlineValueJs, functionText } from './print-js';
import {
  chunkCanonicalFilename,
  createQrlResolver,
  type QrlResolver,
  syncQrlHoists,
} from './qrl-chunks';
import {
  deferRenderAfterTasks,
  emitJsSetup,
  emitHookBody,
  mayBe,
  parameterDefaults,
  readSource,
  withMarkerEmitter,
} from './emit-setup';
import { sourceFunctionEmission, contentFunctionEmission } from './emit-function';
import { requestBindingImport } from './emit-import';
import { emitCollectionSource } from './emit-collection';
import { foldStaticOp } from './fold-static';
import { inlineStringValue, isFullyStaticSubtree } from '../static-subtree';
import {
  allocateGeneratedNames,
  emitComponentCall,
  type ComponentEmission,
  type GeneratedNames,
  inlineComponentText,
} from './emit-component';
import { createNameAllocator } from '../names';
import { generateForeignModule } from './foreign';
import {
  createFailedModule,
  makeOutput,
  type GenerateOutput,
  type PresentationOptions,
} from './output';

export async function generateJsSsr(
  plan: LinkedPlan,
  options: PresentationOptions
): Promise<GenerateOutput> {
  if (plan.specialization.environment !== Environment.Server) {
    throw new Error('generateJsSsr requires a server LinkedPlan');
  }
  const modules: GenerateOutput['modules'] = [];
  for (const module of plan.modules) {
    try {
      modules.push(...(await generateModule(module, options)));
    } catch (error) {
      // A refusal names its module, so a whole-app build failure points at the source.
      if (error instanceof Error && !error.message.includes(module.path)) {
        error.message = `${error.message} (in ${module.path})`;
      }
      throw error;
    }
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
      return generateQwikModule(module, new SsrModuleEmitter(module), options);
    case ModuleKind.Failed:
      return [createFailedModule(module.path)];
    case ModuleKind.ExportsOnly:
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
  /** Names already rooted in this pass — repeat effects skip the addRoot call. */
  rooted: Set<string>;
  propSources: Map<string, string>;
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
  /**
   * Brackets the output in `<!r=id>` (rows with no single element root) or `<!s=id>` (slot
   * content).
   */
  fence?: 'r' | 's';
}

class SsrModuleEmitter implements QwikModuleEmitter {
  readonly isServer = true;
  readonly imports = new Set<string>();
  readonly chunkImports: string[] = [];
  readonly hoists: string[] = [];
  private readonly usedQrls = new Map<string, QrlUsage>();

  private readonly resolveQrlUse: QrlResolver;

  constructor(private readonly module: LinkedModule) {
    this.resolveQrlUse = createQrlResolver(module);
  }

  emitHook(hook: HookDecl, names: GeneratedNames): string {
    const source = emitHookBody(
      this.module,
      hook,
      this.imports,
      withMarkerEmitter(
        this.module,
        (use) => this.useQrl({ names }, use, true).ref,
        this.chunkImports
      ),
      names,
      {
        isServer: true,
        localFunction: (use) => this.localFunctionReference({ names }, use),
        chunkImports: this.chunkImports,
      }
    );
    this.flushQrlHoists();
    return source;
  }

  /** A nested component prints inline; every other use is a reference to its chunk. */
  private inlineComponentOrRef(
    use: QrlUse,
    names: GeneratedNames,
    reference: (use: QrlUse) => string
  ): string {
    const { qrl } = this.resolveQrlUse(use, names.props);
    if (qrl.boundary.kind !== BoundaryKind.Component || qrl.declaration !== undefined) {
      return reference(use);
    }
    return inlineComponentText(
      this.emitProgram(qrl, allocateGeneratedNames(this.module)),
      allocateGeneratedNames(this.module)
    );
  }

  emitPayload(payload: number, names: GeneratedNames): string {
    const source = extractPayloadJs(
      this.module,
      payload,
      undefined,
      undefined,
      [],
      withMarkerEmitter(
        this.module,
        (use) =>
          this.inlineComponentOrRef(use, names, (use) => this.useQrl({ names }, use, true).ref),
        this.chunkImports
      )
    );
    this.flushQrlHoists();
    return source;
  }

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
      statements: [],
      asyncSteps: [],
      next: createNameAllocator(this.module),
      usedCtx: false,
      rooted: new Set(),
      propSources: new Map(),
    };
    const emitQrl = withMarkerEmitter(
      this.module,
      (use) => this.useQrl(pass, use, true).ref,
      this.chunkImports
    );
    pass.statements.push(
      ...emitJsSetup(
        this.module,
        program,
        this.imports,
        emitQrl,
        (nested, localNames = names) => this.renderProgramById(nested, localNames),
        names,
        {
          isServer: true,
          localFunction: (use) => this.localFunctionReference({ names }, use),
          chunkImports: this.chunkImports,
        }
      )
    );
    const setupCount = pass.statements.length;
    const ownRange =
      !options.rootRange && options.fence !== 'r' && body.ops.some((op) => op.op === OpKind.Hole)
        ? pass.next(QwikGenWord.RangeId)
        : null;
    if (ownRange !== null) {
      pass.statements.push(`const ${ownRange} = ${names.ctx}.nextId();`);
      this.imports.add(QwikWord.CreateSsrNodeId);
    }
    const rootRange: SsrRootRange | null =
      ownRange !== null
        ? { idParam: ownRange, markerIndex: 0 }
        : options.rootRange
          ? { idParam: null, markerIndex: 0 }
          : options.fence === 'r'
            ? // Root holes in a fenced row target the row's own marker range.
              { idParam: RowIdParam, markerIndex: 0 }
            : null;
    const parts: string[] = [];
    // Descendants resumed later locate the provided scope through this marker pair.
    // Only a known provider is marked: an unknown hook body does not imply a provided context.
    const { providesContextEffective } = program.facts;
    const contextScope =
      providesContextEffective.ok && providesContextEffective.value
        ? pass.next(QwikGenWord.ContextScope)
        : null;
    if (contextScope !== null) {
      pass.statements.push(`const ${contextScope} = ${names.ctx}.contextScopeRef();`);
      pushMergedStatic(parts, '<!c=');
      parts.push(contextScope);
      pushMergedStatic(parts, '>');
    }
    if (ownRange !== null) {
      pushMergedStatic(parts, '<!b=');
      parts.push(`${QwikWord.CreateSsrNodeId}(${ownRange})`);
      pushMergedStatic(parts, '>');
    }
    if (options.fence !== undefined) {
      this.imports.add(QwikWord.CreateSsrNodeId);
      pushMergedStatic(parts, `<!${options.fence}=`);
      parts.push(
        `${QwikWord.CreateSsrNodeId}(${options.fence === 'r' ? RowIdParam : RangeIdParam})`
      );
      pushMergedStatic(parts, '>');
    }
    // The runtime splices `useOn*` registrations into the first open-tag record after the render.
    const { registersEvents } = program.facts;
    const hookEvents =
      body.ops[0]?.op === OpKind.Element && (!registersEvents.ok || registersEvents.value);
    body.ops.forEach((op, index) =>
      this.op(pass, op, parts, rootRange, options.rootMarker ?? null, index === 0 && hookEvents)
    );
    if (options.fence !== undefined) {
      pushMergedStatic(parts, `<!/${options.fence}>`);
    }
    if (ownRange !== null) {
      pushMergedStatic(parts, '<!/b>');
    }
    if (contextScope !== null) {
      pushMergedStatic(parts, '<!/c>');
    }
    let value = parts.length === 0 ? "''" : parts.length === 1 ? parts[0] : `[${parts.join(', ')}]`;
    const lastStep = pass.asyncSteps[pass.asyncSteps.length - 1];
    const stepsToSequence = value === lastStep ? pass.asyncSteps.slice(0, -1) : pass.asyncSteps;
    if (stepsToSequence.length > 0) {
      this.imports.add(QwikWord.MaybeThen);
      value = stepsToSequence.reduceRight(
        (inner, step) => `${QwikWord.MaybeThen}(${step}, (${step}) => ${inner})`,
        value
      );
    }
    let statements = pass.statements;
    if (mayBe(program.facts.waitForTasks)) {
      ({ statements, value } = deferRenderAfterTasks(
        this.imports,
        pass.next,
        () => `${names.ctx}.scheduler.flush()`,
        statements,
        setupCount,
        value
      ));
    }
    return {
      statements,
      value,
      params: parameterDefaults(this.module, program, this.imports, emitQrl),
      rangeIdParam: ownRange === null ? (rootRange?.idParam ?? null) : null,
      needsContext: pass.usedCtx || pass.statements.length > 0,
    };
  }

  /** One context-neutral producer per QRL — its `uses` are satisfied by the placement. */
  qrlFunction(qrl: LinkedQrl): FunctionEmission {
    if (qrl.ctxName === SegmentContext.SlotContent) {
      return dynamicSlotEmission(QwikWord.RenderSsrSlotContent);
    }
    switch (qrl.body.b) {
      case QrlBodyKind.Js:
      case QrlBodyKind.Expr:
        return contentFunctionEmission(
          this.module,
          qrl,
          this.resolveQrlUse,
          QwikWord.RenderSsrDynamicContent
        );
      case QrlBodyKind.Task:
        throw new UnsupportedError('a task QRL body');
      case QrlBodyKind.Program:
        if (this.module.programs[qrl.body.program].body.kind === ProgramBodyKind.Expr) {
          return sourceFunctionEmission(this.module, qrl, this.resolveQrlUse);
        }
        switch (programKind(qrl)) {
          case ProgramKind.BranchArm:
            return this.armEmission(qrl);
          case ProgramKind.CollectionRow:
            return this.rowEmission(qrl);
          case ProgramKind.Content:
            return this.contentEmission(qrl);
          case ProgramKind.Projection:
          case ProgramKind.SlotFallback:
            return this.slotContentEmission(qrl);
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
      elementRoot ? { rootMarker: QwikAttr.Row } : { fence: 'r' }
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

  /** Slot content chunks own their resume-time marker range. */
  private slotContentEmission(qrl: LinkedQrl): FunctionEmission {
    const { emission, names } = this.renderEmission(qrl, { fence: 's' });
    emission.params = [names.ctx, RangeIdParam];
    return emission;
  }

  /** Content programs render inside the caller-owned range. */
  private contentEmission(qrl: LinkedQrl): FunctionEmission {
    const { emission, names } = this.renderEmission(qrl, {});
    emission.params = [names.ctx];
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
      ctx: allocateGeneratedNames(this.module).ctx,
    };
    const core = emitter.renderProgram(qrl, names, options);
    const captures = captureNames(this.module, qrl);
    const emission = emptyFunctionEmission();
    emission.statements = [
      ...capturePrelude(this.module, qrl),
      ...functionPrelude(this.module, qrl, (use) => emitter.localFunctionReference({ names }, use)),
      ...core.statements,
    ];
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

  private programOps(qrl: LinkedQrl): readonly LinkedOp[] {
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
      if (this.hoistSyncQrl(nested, emission)) {
        continue;
      }
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
    op: LinkedOp,
    parts: string[],
    rootRange: SsrRootRange | null,
    rootMarker: string | null = null,
    hookEvents = false
  ): void {
    switch (op.op) {
      case OpKind.Static:
        // SSR streams raw text; adjacent static runs merge into one string part.
        pushMergedStatic(parts, foldStaticOp(op));
        return;
      case OpKind.Element:
        // A marked root always renders through element() so the marker lands in its open tag.
        if (rootMarker === null && !hookEvents && isFullyStaticSubtree(op)) {
          pushMergedStatic(parts, foldStaticOp(op));
          return;
        }
        this.element(pass, op, parts, rootMarker, hookEvents);
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
      case OpKind.Component:
        this.component(pass, op, parts);
        return;
      case OpKind.Slot:
        this.slot(pass, op, parts);
        return;
      case OpKind.Content:
        this.content(pass, op, parts);
        return;
      case OpKind.Suspense:
        this.suspense(pass, op, parts);
        return;
      case OpKind.Branch:
        this.branch(pass, op, parts);
        return;
      case OpKind.Each:
        this.each(pass, op, parts);
        return;
      default:
        throw new Error(`pipeline.generateJsSsr: op "${(op as LinkedOp).op}" not implemented yet`);
    }
  }

  private component(
    pass: RenderPass,
    op: Extract<LinkedOp, { op: OpKind.Component }>,
    parts: string[]
  ): void {
    const component = pass.next(QwikGenWord.Component);
    const call = emitComponentCall(
      this.module,
      op,
      pass,
      this.imports,
      (use, invoked) => {
        const { qrl, args } = this.resolveQrlUse(use, pass.names.props);
        return { qrl, reference: this.qrlReference(qrl, invoked), args };
      },
      QwikWord.RenderSsrDynamicTag
    );
    pass.statements.push(...call.rootDeclarations);
    this.pushStep(pass, component, call.roots, call.expression, call.statements);
    parts.push(component);
  }

  private element(
    pass: RenderPass,
    op: Extract<LinkedOp, { op: OpKind.Element }>,
    parts: string[],
    /** Stamped into this element's open tag — a row root's `q:row`. */
    rootMarker: string | null = null,
    /** The open tag ships as a record so the runtime can splice `useOn*` events into it. */
    hookEvents = false
  ): void {
    const holes = op.children.filter((child) => child.op === OpKind.Hole && !isInlineHole(child));
    const innerHtml = op.props.find((prop) => prop.k === PropKind.InnerHtml) ?? null;
    const hasDynamicProps =
      op.propsEffect !== null ||
      op.props.some(
        (prop) =>
          ((prop.k === PropKind.Dynamic || prop.k === PropKind.InnerHtml) &&
            !isInlineValue(prop.value)) ||
          prop.k === PropKind.Ref ||
          isDynamicEvent(prop)
      );
    const idVariable = holes.length > 0 || hasDynamicProps ? pass.next(QwikGenWord.Id) : null;
    if (idVariable !== null) {
      pass.statements.push(`const ${idVariable} = ${pass.names.ctx}.nextId();`);
    }
    // A runtime props object splices its attributes into the open-tag record, like hook events.
    const propsStep = op.propsEffect === null ? null : this.propsEffect(pass, op, idVariable!);
    const record = hookEvents || propsStep !== null;
    const openTag: string[] = record ? [] : parts;
    pushMergedStatic(openTag, `<${op.tag}`);
    if (idVariable !== null) {
      this.imports.add(QwikWord.CreateSsrNodeId);
      pushMergedStatic(openTag, ` ${QwikAttr.Id}="`);
      openTag.push(`${QwikWord.CreateSsrNodeId}(${idVariable})`);
      pushMergedStatic(openTag, `"`);
    }
    if (rootMarker !== null) {
      pushMergedStatic(openTag, ` ${rootMarker}`);
    }
    for (const prop of op.props) {
      if (prop !== innerHtml) {
        this.prop(
          pass,
          prop,
          openTag,
          idVariable,
          prop.k === PropKind.Dynamic && prop.name === 'class' ? op.styleScopedId : null,
          record
        );
      }
    }
    if (propsStep !== null) {
      openTag.push(`...${propsStep}.attrs`);
      // A `ref` in the object binds the element id; the part itself renders nothing.
      parts.push(
        `(${propsStep}.ref === undefined || ${pass.names.ctx}.setRef(${propsStep}.ref, ${idVariable}), '')`
      );
    }
    if (record) {
      // The runtime splices hook events before the record's last part, so `>` stays separate.
      openTag.push(JSON.stringify('>'));
      this.imports.add(QwikWord.CreateSsrOpenTag);
      parts.push(`${QwikWord.CreateSsrOpenTag}(${openTag.join(', ')})`);
    } else {
      pushMergedStatic(openTag, '>');
    }
    // The props object may carry innerHTML, which replaces the authored children.
    const children: string[] = propsStep === null ? parts : [];
    if (innerHtml !== null) {
      // innerHTML is the element's content; a literal folds, a live value is a serialized step.
      const literal = inlineStringValue(innerHtml.value);
      if (literal !== null) {
        pushMergedStatic(children, literal);
      } else {
        children.push(`${this.attrStep(pass, innerHtml, idVariable!, null)} ?? ''`);
      }
    }

    let textRangeCount = 0;
    for (const child of innerHtml === null ? op.children : []) {
      switch (child.op) {
        case OpKind.Static: {
          pushMergedStatic(children, foldStaticOp(child));
          break;
        }
        case OpKind.Hole: {
          const keepsNewline = NEWLINE_EATING_ELEMENTS.has(op.tag) && child === op.children[0];
          if (isInlineHole(child)) {
            this.inlineText(child, children, keepsNewline);
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
            children,
            keepsNewline
          );
          break;
        }
        case OpKind.Element: {
          if (isFullyStaticSubtree(child)) {
            pushMergedStatic(children, foldStaticOp(child));
          } else {
            this.element(pass, child, children);
          }
          break;
        }
        case OpKind.Branch: {
          this.branch(pass, child, children);
          break;
        }
        case OpKind.Each: {
          this.each(pass, child, children);
          break;
        }
        case OpKind.Component: {
          this.component(pass, child, children);
          break;
        }
        case OpKind.Slot: {
          this.slot(pass, child, children);
          break;
        }
        case OpKind.Content: {
          this.content(pass, child, children);
          break;
        }
        case OpKind.Suspense: {
          this.suspense(pass, child, children);
          break;
        }
        default: {
          if (!isFullyStaticSubtree(child)) {
            throw new UnsupportedError('a dynamic child inside an element record');
          }
          pushMergedStatic(children, foldStaticOp(child));
        }
      }
    }
    if (propsStep !== null && children.length > 0) {
      parts.push(`${propsStep}.innerHTML ?? [${children.join(', ')}]`);
    }
    if (!op.void) {
      pushMergedStatic(parts, `</${op.tag}>`);
    }
  }

  /** Renders the element's runtime props object; the step resolves before the parts assemble. */
  private propsEffect(
    pass: RenderPass,
    op: Extract<LinkedOp, { op: OpKind.Element }>,
    idVariable: string
  ): string {
    const { qrl, ref, args } = this.useQrl(pass, op.propsEffect!, true);
    const step = pass.next(QwikGenWord.DomProps);
    const scope =
      op.styleScopedId === null ? '' : `, undefined, ${JSON.stringify(op.styleScopedId)}`;
    this.imports.add(QwikWord.RenderSsrProps);
    this.pushStep(
      pass,
      step,
      rootArgs(qrl, args),
      `${QwikWord.RenderSsrProps}(${idVariable}, [${args.join(', ')}], ${ref}, ${pass.names.ctx}.eventAttr${scope})`
    );
    return step;
  }

  /** Serializes one attribute value into a step; the name decides how the runtime applies it. */
  private attrStep(
    pass: RenderPass,
    prop: Extract<Prop, { k: PropKind.Dynamic | PropKind.InnerHtml }>,
    idVariable: string | null,
    styleScope: string | null
  ): string {
    const name = prop.k === PropKind.Dynamic ? prop.name : QwikDirective.InnerHtml;
    const scope = styleScope === null ? '' : `, undefined, ${JSON.stringify(styleScope)}`;
    const step = pass.next(QwikGenWord.Attribute);
    switch (prop.value.v) {
      case ValueKind.Read: {
        const signal = readSource(
          this.module,
          prop.value.expr,
          pass,
          pass.statements,
          this.imports,
          pass.names.ctx
        );
        this.imports.add(QwikWord.RenderSsrAttr);
        this.pushStep(
          pass,
          step,
          [signal],
          `${QwikWord.RenderSsrAttr}(${idVariable}, ${JSON.stringify(name)}, ${signal}${scope})`
        );
        break;
      }
      case ValueKind.Computed: {
        if (isInlineValue(prop.value)) {
          // A row constant never changes: serialize it once, no subscription.
          this.imports.add(QwikWord.SerializeAttrExpressionValue);
          const rowScope = styleScope === null ? '' : `, ${JSON.stringify(styleScope)}`;
          pass.statements.push(
            `const ${step} = ${QwikWord.SerializeAttrExpressionValue}(${JSON.stringify(name)}, ${inlineValueJs(this.module, prop.value)}${rowScope});`
          );
          break;
        }
        if (prop.value.resume.r !== ResumeKind.Qrl) {
          throw new UnsupportedError('a non-QRL computed prop');
        }
        const { qrl, ref, args } = this.useQrl(pass, prop.value.resume.qrl, true);
        this.imports.add(QwikWord.RenderSsrAttrExpression);
        this.pushStep(
          pass,
          step,
          rootArgs(qrl, args),
          `${QwikWord.RenderSsrAttrExpression}(${idVariable}, ${JSON.stringify(name)}, [${args.join(', ')}], ${ref}${scope})`
        );
        break;
      }
      default:
        throw new UnsupportedError(`the dynamic prop value "${prop.value.v}"`);
    }
    return step;
  }

  private slot(
    pass: RenderPass,
    op: Extract<LinkedOp, { op: OpKind.Slot }>,
    parts: string[]
  ): void {
    const slot = pass.next(QwikGenWord.Slot);
    let name = op.name === '' ? '' : JSON.stringify(op.name);
    if (op.nameValue !== undefined) {
      name = pass.next(QwikGenWord.SlotName);
      pass.statements.push(`const ${name} = ${inlineValueJs(this.module, op.nameValue)};`);
    }
    this.imports.add(QwikWord.RenderSsrSlot);
    let fallback = 'undefined';
    let roots: string[] = [];
    if (op.fallback !== null) {
      const { qrl, args } = this.resolveQrlUse(op.fallback, pass.names.props);
      const reference = this.qrlReference(qrl, true);
      fallback = args.length === 0 ? reference : `${reference}.w([${args.join(', ')}])`;
      roots = rootArgs(qrl, args);
    }
    const call =
      op.fallback === null
        ? `${QwikWord.RenderSsrSlot}(${pass.names.ctx}${name === '' ? '' : `, ${name}`})`
        : `${QwikWord.RenderSsrSlot}(${pass.names.ctx}, ${name === '' ? "''" : name}, ${fallback})`;
    this.pushStep(pass, slot, roots, call);
    parts.push(slot);
  }

  private content(
    pass: RenderPass,
    op: Extract<LinkedOp, { op: OpKind.Content }>,
    parts: string[]
  ): void {
    const id = pass.next(QwikGenWord.Id);
    pass.statements.push(`const ${id} = ${pass.names.ctx}.nextId();`);
    const render = this.useQrl(pass, op.render, true);
    const content = pass.next(QwikGenWord.Content);
    this.imports.add(QwikWord.RenderSsrContent);
    this.pushStep(
      pass,
      content,
      rootArgs(render.qrl, render.args),
      `${QwikWord.RenderSsrContent}(${pass.names.ctx}, ${id}, [], ${render.ref}, false, true)`
    );
    this.imports.add(QwikWord.CreateSsrNodeId);
    pushMergedStatic(parts, '<!d=');
    parts.push(`${QwikWord.CreateSsrNodeId}(${id})`);
    pushMergedStatic(parts, '>');
    parts.push(content);
    pushMergedStatic(parts, '<!/d>');
  }

  /** The runtime races content against the fallback on its own lane and wraps the range itself. */
  private suspense(
    pass: RenderPass,
    op: Extract<LinkedOp, { op: OpKind.Suspense }>,
    parts: string[]
  ): void {
    const id = pass.next(QwikGenWord.Id);
    pass.statements.push(`const ${id} = ${pass.names.ctx}.nextId();`);
    const content = this.useQrl(pass, op.content, true);
    const fallback = op.fallback === null ? null : this.useQrl(pass, op.fallback, true);
    const delay = op.delay === null ? '0' : inlineValueJs(this.module, op.delay);
    const step = pass.next(QwikGenWord.Content);
    this.imports.add(QwikWord.CreateSsrSuspense);
    this.pushStep(
      pass,
      step,
      [
        ...rootArgs(content.qrl, content.args),
        ...(fallback === null ? [] : rootArgs(fallback.qrl, fallback.args)),
      ],
      `${QwikWord.CreateSsrSuspense}(${pass.names.ctx}, ${id}, ${content.ref}, ${fallback === null ? 'undefined' : fallback.ref}, ${delay})`
    );
    parts.push(step);
  }

  /** A collection renders between `<!f=N>`…`<!/f>` markers; rows reconcile by key. */
  private each(
    pass: RenderPass,
    op: Extract<LinkedOp, { op: OpKind.Each }>,
    parts: string[]
  ): void {
    const source = emitCollectionSource(
      this.module,
      op,
      pass,
      this.imports,
      (use) => this.useQrl(pass, use, true).ref,
      pass.names.ctx
    );
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
          `${QwikWord.RenderSsrCollection}(${pass.names.ctx}, ${idVariable}, ${source}, ${key?.ref ?? 'undefined'}, ${render.ref}, ${op.index}, ${usesRowId}, ${rowShapeCode(op.shape)})`
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
        this.pushStep(
          pass,
          step,
          [],
          `${QwikWord.RenderSsrCollection}(${pass.names.ctx}, undefined, ${source}, undefined, ${rowFn}, ${op.index}, false, ${rowShapeCode(op.shape)})`
        );
        parts.push(step);
        break;
      }
    }
  }

  /** Inline row: a function declared in the component; renderId links declaration and call. */
  private inlineRowFunction(pass: RenderPass, row: { program: number; renderId: string }): string {
    // Rendered on THIS emitter: hole QRLs hoist to the module scope the function nests in.
    const names = {
      props: QwikGenWord.ComponentProps,
      ctx: allocateGeneratedNames(this.module).ctx,
    };
    const core = this.renderProgramById(row.program, names);
    const loopParams = this.module.programs[row.program].params
      .map((binding) => `, ${this.module.bindings[binding].name}`)
      .join('');
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
  private branch(
    pass: RenderPass,
    op: Extract<LinkedOp, { op: OpKind.Branch }>,
    parts: string[]
  ): void {
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
  private inlineText(
    op: Extract<LinkedOp, { op: OpKind.Hole }>,
    parts: string[],
    keepsNewline = false
  ): void {
    this.imports.add(QwikWord.EscapeHTML);
    this.imports.add(QwikWord.TextValue);
    parts.push(
      this.escapedText(
        `${QwikWord.TextValue}(${inlineValueJs(this.module, op.value)})`,
        keepsNewline
      )
    );
  }

  /** The parser eats one newline after `<pre>`/`<textarea>`, so a leading one is doubled. */
  private escapedText(value: string, keepsNewline: boolean): string {
    const text = keepsNewline ? `${value}.replace(/^\\n/, '\\n\\n')` : value;
    return `${QwikWord.EscapeHTML}(${text})`;
  }

  private textHole(
    pass: RenderPass,
    op: Extract<LinkedOp, { op: OpKind.Hole }>,
    target: SsrTextTarget,
    parts: string[],
    keepsNewline = false
  ): void {
    const targetArgs = `${target.id}, ${target.kind === 'range' ? target.markerIndex : 'null'}`;
    this.imports.add(QwikWord.EscapeHTML);
    const step = pass.next(QwikGenWord.Text);

    if (target.kind === 'range') {
      pushMergedStatic(parts, '<!t>');
    }

    switch (op.value.v) {
      case ValueKind.Read: {
        // Signal and prop reads subscribe directly — no QRL involved.
        const signal = readSource(
          this.module,
          op.value.expr,
          pass,
          pass.statements,
          this.imports,
          pass.names.ctx
        );
        this.imports.add(QwikWord.RenderSsrTextNode);
        this.pushStep(
          pass,
          step,
          [signal],
          `${QwikWord.RenderSsrTextNode}(${targetArgs}, ${signal}${op.stringify ? ', undefined, true' : ''})`
        );
        parts.push(this.escapedText(step, keepsNewline));
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
          `${QwikWord.RenderSsrTextExpression}(${targetArgs}, [${args.join(', ')}], ${ref})`
        );
        parts.push(this.escapedText(step, keepsNewline));
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
    callExpr: string,
    statements: readonly string[] = []
  ): void {
    // A root may be declared by the step's own statements, so those come first.
    pass.statements.push(...statements);
    for (const root of roots) {
      // One addRoot per name and pass — the runtime dedupes too, this keeps the output clean.
      if (!pass.rooted.has(root)) {
        pass.rooted.add(root);
        pass.statements.push(`${pass.names.ctx}.addRoot(${root});`);
      }
    }
    pass.statements.push(`const ${step} = ${callExpr};`);
    pass.asyncSteps.push(step);
  }

  /**
   * Emission-side use of a QRL: the reference text with its actual arguments baked in. Function
   * payloads wear `.w([args])`; Value payloads keep a bare reference and receive args separately.
   */
  /** The server mirrors an invoked segment in-module, so a lifted function binds to that mirror. */
  localFunctionReference(pass: Pick<RenderPass, 'names'>, use: QrlUse): string {
    const { qrl, args } = this.resolveQrlUse(use, pass.names.props);
    this.qrlReference(qrl, true);
    return boundReference(qrl.name, args, this.imports);
  }

  private useQrl(pass: Pick<RenderPass, 'names'>, use: QrlUse, invoked: boolean) {
    const { qrl, args } = this.resolveQrlUse(use, pass.names.props);
    let ref = this.qrlReference(qrl, invoked);
    if (qrl.payloadKind === QrlPayloadKind.Function && args.length > 0) {
      ref = `${ref}.w([${args.join(', ')}])`;
      if (invoked) {
        this.imports.add(QwikWord.Captures);
      }
    }
    return { qrl, ref, args };
  }

  /** The handler or handler list of a static event prop, as one expression. */
  private staticEventValue(pass: RenderPass, prop: Extract<Prop, { k: PropKind.Event }>): string {
    const values = prop.handlers.map((handler) => {
      if (handler.h === HandlerKind.Bind) {
        return bindHandlerJs(this.module, handler, this.imports);
      }
      return handler.value.v === ValueKind.Qrl
        ? this.useQrl(pass, handler.value.use, false).ref
        : inlineValueJs(this.module, handler.value);
    });
    return values.length === 1 ? values[0] : `[${values.join(', ')}]`;
  }

  private prop(
    pass: RenderPass,
    prop: Prop,
    parts: string[],
    idVariable: string | null,
    styleScope: string | null,
    /** Events print as event-attr chunks so the runtime can join hook handlers by name. */
    record = false
  ): void {
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
      case PropKind.Ref: {
        // The element id stands in for the node; the runtime resolves it on resume.
        pass.statements.push(
          `${pass.names.ctx}.setRef(${inlineValueJs(this.module, prop.value)}, ${idVariable});`
        );
        return;
      }
      case PropKind.Dynamic: {
        const step = this.attrStep(pass, prop, idVariable, styleScope);
        // the open-tag part — attr semantics: null = absent, '' = bare, else quoted+escaped
        this.imports.add(QwikWord.EscapeHTML);
        parts.push(
          `${step} === null ? '' : ' ${prop.name}' + (${step} === '' ? '' : '="' + ${QwikWord.EscapeHTML}(${step}) + '"')`
        );
        return;
      }
      case PropKind.Event: {
        const singleHandler = prop.handlers.length === 1 ? prop.handlers[0] : null;
        const value = singleHandler?.h === HandlerKind.Value ? singleHandler.value : null;
        if (value?.v === ValueKind.Computed && value.resume.r !== ResumeKind.Inline) {
          if (value.resume.r !== ResumeKind.Qrl) {
            throw new UnsupportedError('a non-QRL computed event handler');
          }
          if (idVariable === null) {
            throw new Error('pipeline: a dynamic event requires an element id');
          }
          const { qrl, ref, args } = this.useQrl(pass, value.resume.qrl, true);
          if (qrl.payloadKind !== QrlPayloadKind.Value) {
            throw new UnsupportedError('a non-value computed event QRL');
          }
          const step = pass.next(QwikGenWord.Effect);
          this.imports.add(QwikWord.RenderSsrEvent);
          this.imports.add(QwikWord.CreateSsrMarkup);
          pass.usedCtx = true;
          this.pushStep(
            pass,
            step,
            rootArgs(qrl, args),
            `${QwikWord.RenderSsrEvent}(${idVariable}, ${JSON.stringify(prop.name)}, [${args.join(', ')}], ${ref}, ${pass.names.ctx}.eventAttr)`
          );
          parts.push(record ? step : `${QwikWord.CreateSsrMarkup}(${step})`);
          return;
        }
        pass.usedCtx = true;
        const eventAttr = record ? 'eventAttr' : 'eventAttrParts';
        parts.push(
          `${pass.names.ctx}.${eventAttr}(${JSON.stringify(prop.name)}, ${this.staticEventValue(pass, prop)})`
        );
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

  /** A `sync$` QRL is its inline function; nothing to load. */
  private hoistSyncQrl(qrl: LinkedQrl, target: Pick<FunctionEmission, 'imports' | 'hoists'>) {
    if (qrl.boundary.kind !== BoundaryKind.Sync) {
      return false;
    }
    target.imports.add(QwikWord.QrlSync);
    target.hoists.push(...syncQrlHoists(qrl, functionText(this.qrlFunction(qrl))));
    return true;
  }

  private flushQrlHoists(): void {
    for (const usage of this.usedQrls.values()) {
      const { qrl } = usage;
      if (this.hoistSyncQrl(qrl, this)) {
        continue;
      }
      // A nested component already printed inline where its call stood.
      if (qrl.boundary.kind === BoundaryKind.Component && qrl.declaration === undefined) {
        continue;
      }
      if (usage.invoked) {
        // The server invokes render expressions in-module: mirror fn + `.s()` registration.
        const emission = this.qrlFunction(qrl);
        for (const binding of qrl.dependencies.bindings) {
          requestBindingImport(this.module, binding, this.imports);
        }
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

function isInlineValue(value: Value): boolean {
  return value.v === ValueKind.Computed && value.resume.r === ResumeKind.Inline;
}

function isInlineHole(op: Extract<LinkedOp, { op: OpKind.Hole }>): boolean {
  return isInlineValue(op.value);
}

function isDynamicEvent(prop: Prop): boolean {
  return (
    prop.k === PropKind.Event &&
    prop.handlers.some(
      (handler) =>
        handler.h === HandlerKind.Value &&
        handler.value.v === ValueKind.Computed &&
        !isInlineValue(handler.value)
    )
  );
}
