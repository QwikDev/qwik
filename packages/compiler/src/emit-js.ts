import type { PlanSsrOp, PlanSsrProp } from './emit-plan-ssr';
import { SsrOpKind } from './emit-plan-ssr';
import type { QwikSsrPlan } from './link-plan';
import type { ValueIR } from './expr-ir';
import { escapeAttr } from './html-utils';

/**
 * JS SSR generator — the JS projection of the wire plan, peer of the Rust `qwik-ssr-gen`
 * (specs/07): reads plan ops + IR only, never original source. Output text is generator-owned
 * (`local_<binding>` names); correctness is byte-identity of RENDERED output against the Layer-A
 * goldens, exactly how the native engines are gated. Returns null for any construct not generatable
 * yet — growing the allowlist in `js-gen.unit.ts` is the migration metric.
 */
export function emitJsModule(plan: QwikSsrPlan, componentIndex = plan.entry): string | null {
  const entry = plan.components[componentIndex];
  if (entry === undefined || entry.ssr === null) {
    return null;
  }
  const shared: ModuleState = {
    imports: new Set(),
    chunkImports: [],
    hoists: [],
    hoistedSegments: new Set(),
    componentFns: [],
    generated: new Set(),
    queue: [componentIndex],
  };
  try {
    while (shared.queue.length > 0) {
      const index = shared.queue.shift()!;
      if (shared.generated.has(index)) {
        continue;
      }
      shared.generated.add(index);
      const component = plan.components[index];
      if (component === undefined || component.ssr === null) {
        markUngeneratable();
      }
      const componentModule = plan.modules[component.module];
      const generator = new JsComponentGenerator(
        plan,
        shared,
        componentModule.segments,
        componentModule.defs,
        componentModule.contexts,
        plan.pluginFns ?? []
      );
      shared.componentFns.push(generator.generate(component));
    }
    const header =
      (shared.imports.size === 0
        ? ''
        : `import { ${[...shared.imports].sort().join(', ')} } from "@qwik.dev/core";\n`) +
      shared.chunkImports.map((line) => `${line}\n`).join('');
    return `${header}${shared.hoists.join('\n')}${shared.hoists.length > 0 ? '\n' : ''}${shared.componentFns.join('\n')}`;
  } catch (error) {
    if (error === UNGENERATABLE) {
      if (process.env.QWIK_JSGEN_DEBUG === '1') {
        // eslint-disable-next-line no-console
        console.error((error as { stack?: string } & symbol).description, UNGENERATABLE_SITE);
      }
      return null;
    }
    throw error;
  }
}

/** Per-module collections shared by every generated component fn. */
interface ModuleState {
  readonly imports: Set<string>;
  readonly chunkImports: string[];
  readonly hoists: string[];
  readonly hoistedSegments: Set<string>;
  readonly componentFns: string[];
  readonly generated: Set<number>;
  readonly queue: number[];
}

/** Debug-only: stack captured at the most recent UNGENERATABLE throw. */
let UNGENERATABLE_SITE = '';
export function markUngeneratable(): never {
  UNGENERATABLE_SITE = new Error('ungeneratable').stack ?? '';
  throw UNGENERATABLE;
}

const UNGENERATABLE = Symbol('js-ungeneratable');

type SegmentMeta = QwikSsrPlan['modules'][number]['segments'][number];
type PropsShape =
  | null
  | undefined
  | { kind: 'identifier'; binding: number }
  | { kind: 'object'; bindings: readonly { b: number; name: string }[] };
interface LocalComponentEntry {
  readonly name: string;
  readonly binding: number;
  readonly segment: string;
  readonly providesContext?: boolean;
  readonly props: PropsShape;
  readonly render: {
    readonly setup: readonly unknown[];
    readonly ops: readonly PlanSsrOp[];
  };
}
type DefMeta = QwikSsrPlan['modules'][number]['defs'][number];

class JsComponentGenerator {
  private readonly imports: Set<string>;
  private readonly chunkImports: string[];
  private readonly hoists: string[];
  private readonly hoistedSegments: Set<string>;
  private readonly statements: string[] = [];
  private locals = new Map<number, string>();
  private usedNames = new Set<string>(['props', 'ctx', 'invokeCtx']);
  private localComponents = new Map<string, LocalComponentEntry>();
  /** `_markComponent` marks flushed after the owning scope's setup completes. */
  private readonly pendingMarks: string[] = [];
  private nextTemp = 0;
  private invokeCtxDeclared = false;
  /** Bindings declared as reactive sources (signal/store/computed) — prop getters track them. */
  private sourceKinds = new Set<number>();
  /** Element id placeholders: resolved at first claiming step (eager const / lazy let). */
  private readonly idState = new Map<string, 'placeholder' | 'eager' | 'lazy'>();
  /** Pending async steps — the return value chains maybeThen over them in order. */
  private readonly asyncSteps: { name: string; expr: string }[] = [];

  constructor(
    private readonly plan: QwikSsrPlan,
    private readonly shared: ModuleState,
    private readonly segments: readonly SegmentMeta[],
    private readonly defs: readonly DefMeta[],
    private readonly contexts: QwikSsrPlan['modules'][number]['contexts'],
    private readonly pluginFns: QwikSsrPlan['pluginFns'],
    seed?: {
      readonly locals: ReadonlyMap<number, string>;
      readonly usedNames: ReadonlySet<string>;
      readonly localComponents: ReadonlyMap<string, LocalComponentEntry>;
      readonly sourceKinds: ReadonlySet<number>;
    }
  ) {
    this.imports = shared.imports;
    this.chunkImports = shared.chunkImports;
    this.hoists = shared.hoists;
    this.hoistedSegments = shared.hoistedSegments;
    if (seed !== undefined) {
      this.locals = new Map(seed.locals);
      this.usedNames = new Set(seed.usedNames);
      this.localComponents = new Map(seed.localComponents);
      this.sourceKinds = new Set(seed.sourceKinds);
    }
  }

  generate(component: QwikSsrPlan['components'][number]): string {
    for (const binding of component.propsBindings) {
      this.locals.set(binding, 'props');
    }
    return this.generateFn(
      component.name,
      component.ssr!,
      component.props as PropsShape,
      component.providesContext,
      true
    );
  }

  generateFn(
    name: string,
    ssr: {
      readonly setup: readonly unknown[];
      readonly ops: readonly PlanSsrOp[];
      readonly flushTasks?: boolean;
    },
    propsShape: PropsShape,
    providesContext: boolean,
    exported: boolean,
    signature = '(props, ctx)'
  ): string {
    // props param bindings: identifier form aliases props; object form destructures by name
    if (propsShape !== null && propsShape !== undefined) {
      if (propsShape.kind === 'identifier') {
        this.locals.set(propsShape.binding, 'props');
      } else {
        const names: string[] = [];
        for (const item of propsShape.bindings) {
          // shorthand destructure requires the declared name to be the prop name
          if (
            !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(item.name) ||
            this.declare(item.b, item.name) !== item.name
          ) {
            markUngeneratable();
          }
          names.push(item.name);
        }
        if (names.length > 0) {
          this.statements.push(`const { ${names.join(', ')} } = props;`);
        }
      }
    }
    // task flush: setup runs first, then the render replays under the captured invoke context
    if (ssr.flushTasks === true) {
      this.invokeCtx();
    }
    // local-component declarations hoist: siblings are callable before their statement
    for (const entry of ssr.setup as ({ op: string } & Record<string, unknown>)[]) {
      if (entry.op === 'local-component') {
        this.localComponents.set(entry.name as string, entry as unknown as LocalComponentEntry);
      }
    }
    // defs regenerate from IR and export under their names — chunks import them back
    for (const def of this.defs) {
      this.usedNames.add(def.name);
    }
    if (this.contexts.length > 0 && !this.shared.hoistedSegments.has('__contexts__')) {
      this.shared.hoistedSegments.add('__contexts__');
      this.imports.add('createContextId');
      for (const context of this.contexts) {
        if (context.declaredName === undefined) {
          markUngeneratable();
        }
        this.usedNames.add(context.declaredName);
        this.hoists.push(
          `const ${context.declaredName} = createContextId(${JSON.stringify(context.name)});`
        );
      }
      this.hoists.push(
        `export { ${this.contexts.map((context) => context.declaredName).join(', ')} };`
      );
    }
    if (this.defs.length > 0 && !this.shared.hoistedSegments.has('__defs__')) {
      this.shared.hoistedSegments.add('__defs__');
      for (const def of this.defs) {
        const params = new Map(def.params.map((binding, index) => [binding, `p${index}`]));
        this.hoists.push(
          `function ${def.name}(${[...params.values()].join(', ')}) { return ${this.irJs(def.body, params)}; }`
        );
      }
      this.hoists.push(`export { ${this.defs.map((def) => def.name).join(', ')} };`);
    }
    for (const entry of ssr.setup) {
      this.setupOp(entry as { op: string } & Record<string, unknown>);
    }
    for (const markName of this.pendingMarks.splice(0)) {
      const entry = this.localComponents.get(markName)!;
      this.statements.push(
        `_markComponent(${markName}, ${this.qrlExpression(this.segment(entry.segment))});`
      );
    }
    const setupStatements = this.statements.splice(0);
    let contextScope: string | null = null;
    if (providesContext) {
      contextScope = `context_scope_${this.nextTemp++}`;
      this.statements.push(`const ${contextScope} = ctx.contextScopeRef();`);
      this.imports.add('createSsrRecord');
    }
    const parts = this.ops(ssr.ops);
    if (contextScope !== null) {
      // provider output wraps in a context scope range
      parts.unshift(`createSsrRecord('<!c=', ${contextScope}, '>')`);
      const last = parts[parts.length - 1];
      if (last !== undefined && isStringLiteral(last)) {
        parts[parts.length - 1] = JSON.stringify((JSON.parse(last) as string) + '<!/c>');
      } else {
        parts.push(JSON.stringify('<!/c>'));
      }
    }
    const value =
      parts.length === 1 && isStringLiteral(parts[0]) ? parts[0] : `[${parts.join(', ')}]`;
    const returnStatement = this.wrapAsync(value);
    let bodyStatements: string[];
    const finalizedStatements = this.finalizeIds(this.statements);
    this.statements.splice(0, this.statements.length, ...finalizedStatements);
    if (ssr.flushTasks === true) {
      this.imports.add('maybeThen');
      this.imports.add('invoke');
      const inner = [...this.statements, returnStatement].map((line) => `  ${line}`).join('\n');
      bodyStatements = [
        ...setupStatements,
        `return maybeThen(ctx.scheduler.flush(), () => invoke(invokeCtx, () => {\n${inner}\n  }));`,
      ];
    } else {
      bodyStatements = [...setupStatements, ...this.statements, returnStatement];
    }
    const body = bodyStatements.map((line) => `  ${line}`).join('\n');
    return `${exported ? 'export ' : ''}function ${name}${signature} {\n${body}\n}\n`;
  }

  /** MaybeThen chain over async steps, innermost carrying the parts value. */
  private wrapAsync(value: string): string {
    if (this.asyncSteps.length === 0) {
      return `return ${value};`;
    }
    this.imports.add('maybeThen');
    return `return ${this.asyncSteps.reduceRight(
      (inner, step) => `maybeThen(${step.expr}, (${step.name}) => ${inner})`,
      value
    )};`;
  }

  /**
   * Schedules one async step matching the emitted discipline: the first step evaluates eagerly at
   * its statement (ambient context still active), every later step defers into an invoke thunk so
   * capture rooting happens in chain order.
   */
  private pushStep(
    step: string,
    roots: readonly string[],
    callExpr: string,
    thunkPrelude = ''
  ): void {
    if (this.asyncSteps.length === 0) {
      for (const root of roots) {
        this.statements.push(`ctx.addRoot(${root});`);
      }
      this.statements.push(`const ${step} = ${callExpr};`);
      this.asyncSteps.push({ name: step, expr: step });
      return;
    }
    const invokeCtx = this.invokeCtx();
    this.imports.add('invoke');
    const rootStatements = roots.map((root) => `ctx.addRoot(${root}); `).join('');
    this.statements.push(
      `const ${step} = () => invoke(${invokeCtx}, () => { ${thunkPrelude}${rootStatements}return ${callExpr}; });`
    );
    this.asyncSteps.push({ name: step, expr: `${step}()` });
  }

  /**
   * Claims an element id for a step: the first claim decides allocation — eager `const` at the
   * element's position when the step is eager, otherwise a lazy `??=` inside the thunk, so `q:id`
   * numbering follows chain order. Unclaimed ids finalize as eager.
   */
  private claimId(idVariable: string): string {
    const state = this.idState.get(idVariable);
    if (state === undefined || state === 'eager') {
      return '';
    }
    if (state === 'lazy') {
      return `${idVariable} ??= ctx.nextId(); `;
    }
    const placeholder = `__ID_DECL__${idVariable}`;
    const index = this.statements.indexOf(placeholder);
    if (this.asyncSteps.length === 0) {
      if (index >= 0) {
        this.statements[index] = `const ${idVariable} = ctx.nextId();`;
      }
      this.idState.set(idVariable, 'eager');
      return '';
    }
    if (index >= 0) {
      this.statements[index] = `let ${idVariable};`;
    }
    this.idState.set(idVariable, 'lazy');
    return `${idVariable} ??= ctx.nextId(); `;
  }

  /** Unclaimed ids allocate eagerly at their element's position. */
  private finalizeIds(statements: string[]): string[] {
    return statements.map((statement) =>
      statement.startsWith('__ID_DECL__')
        ? `const ${statement.slice('__ID_DECL__'.length)} = ctx.nextId();`
        : statement
    );
  }

  /** Ambient invoke context, captured once before any async boundary. */
  private invokeCtx(): string {
    if (!this.invokeCtxDeclared) {
      this.invokeCtxDeclared = true;
      this.imports.add('getActiveInvokeContextOrNull');
      this.statements.push('const invokeCtx = getActiveInvokeContextOrNull();');
    }
    return 'invokeCtx';
  }

  private setupOp(entry: { op: string } & Record<string, unknown>): void {
    switch (entry.op) {
      case 'signal': {
        const binding = entry.local as number;
        this.sourceKinds.add(binding);
        const variable = this.declare(binding, entry.name as string | undefined);
        this.imports.add('useSignal');
        this.statements.push(`const ${variable} = useSignal(${this.irJs(entry.init as ValueIR)});`);
        return;
      }
      case 'store': {
        if (entry.deep !== true) {
          markUngeneratable();
        }
        const binding = entry.local as number;
        this.sourceKinds.add(binding);
        const variable = this.declare(binding, entry.name as string | undefined);
        this.imports.add('useStore');
        this.statements.push(`const ${variable} = useStore(${this.irJs(entry.init as ValueIR)});`);
        return;
      }
      case 'style': {
        const css = entry.css as string | undefined;
        if (css === undefined || entry.scoped === true) {
          markUngeneratable();
        }
        this.imports.add('useStyles');
        this.statements.push(
          `useStyles(${templateLiteral(css)}, ${JSON.stringify(entry.styleId)});`
        );
        return;
      }
      case 'computed': {
        const binding = entry.local as number;
        this.sourceKinds.add(binding);
        const variable = this.declare(binding, entry.name as string | undefined);
        const meta = this.segment(entry.segment as string);
        this.imports.add('useComputedQrl');
        this.statements.push(`const ${variable} = useComputedQrl(${this.qrlExpression(meta)});`);
        return;
      }
      case 'task': {
        const meta = this.segment(entry.segment as string);
        this.imports.add('useTaskQrl');
        this.statements.push(`useTaskQrl(${this.qrlExpression(meta)});`);
        return;
      }
      case 'local-component': {
        const local = entry as unknown as LocalComponentEntry;
        const child = new JsComponentGenerator(
          this.plan,
          this.shared,
          this.segments,
          this.defs,
          this.contexts,
          this.pluginFns,
          {
            locals: this.locals,
            usedNames: this.usedNames,
            localComponents: this.localComponents,
            sourceKinds: this.sourceKinds,
          }
        );
        this.statements.push(
          child.generateFn(
            local.name,
            local.render,
            local.props,
            local.providesContext === true,
            false
          )
        );
        this.imports.add('_markComponent');
        // captures may be declared below the fn — the QRL resolves at mark-flush time
        this.pendingMarks.push(local.name);
        return;
      }
      case 'const': {
        const binding = entry.local as number;
        const variable = this.declare(binding, entry.name as string | undefined);
        this.statements.push(`const ${variable} = ${this.irJs(entry.init as ValueIR)};`);
        return;
      }
      case 'context-provider': {
        const contextVar = this.contextVar(entry.context as number);
        this.imports.add('useContextProvider');
        this.statements.push(
          `useContextProvider(${contextVar}, ${this.irJs(entry.value as ValueIR)});`
        );
        return;
      }
      case 'context-read': {
        const binding = entry.local as number;
        const variable = this.declare(binding, entry.name as string | undefined);
        this.imports.add('useContext');
        this.statements.push(
          `const ${variable} = useContext(${this.contextVar(entry.context as number)});`
        );
        return;
      }
      case 'visible-task': {
        const meta = this.segment(entry.segment as string);
        const strategy = entry.strategy as string;
        const event =
          strategy === 'document-ready'
            ? 'qinit'
            : strategy === 'document-idle'
              ? 'qidle'
              : 'qvisible';
        const useOn = strategy.startsWith('document-') ? 'useOnDocument' : 'useOn';
        this.imports.add(useOn);
        this.imports.add('createVisibleTaskHandlerQrl');
        this.statements.push(
          `${useOn}(${JSON.stringify(event)}, createVisibleTaskHandlerQrl(${this.qrlExpression(meta)}));`
        );
        return;
      }
      default:
        markUngeneratable();
    }
  }

  /** Plan ops → part expressions; adjacent statics merge at generation time. */
  private ops(operations: readonly PlanSsrOp[]): string[] {
    const parts: string[] = [];
    const pushStatic = (text: string): void => {
      if (text === '') {
        return;
      }
      const last = parts[parts.length - 1];
      if (last !== undefined && isStringLiteral(last)) {
        parts[parts.length - 1] = JSON.stringify(JSON.parse(last) + text);
      } else {
        parts.push(JSON.stringify(text));
      }
    };
    for (const operation of operations) {
      this.op(operation, parts, pushStatic);
    }
    return parts;
  }

  private op(operation: PlanSsrOp, parts: string[], pushStatic: (text: string) => void): void {
    switch (operation.o) {
      case SsrOpKind.Static:
        pushStatic(operation.html);
        return;
      case SsrOpKind.Element:
        this.element(operation, parts, pushStatic);
        return;
      case SsrOpKind.Dynamic:
        this.dynamicText(operation, parts, pushStatic);
        return;
      case SsrOpKind.Content:
        this.content(operation, parts, pushStatic);
        return;
      case SsrOpKind.Component:
        this.componentCall(operation, parts);
        return;
      case SsrOpKind.Branch: {
        if (operation.idBase !== null || operation.then.segment === undefined) {
          markUngeneratable();
        }
        const condition = this.segment(operation.condition);
        const captureName = (capture: SegmentMeta['captures'][number]): string =>
          capture.access === 'component-prop' ? 'props' : this.local(capture.binding);
        const stepRoots = condition.captures.map(captureName);
        const thenMeta = this.segment(operation.then.segment);
        const thenQrl = this.qrlExpression(thenMeta);
        // arm captures root at the branch site — captured local components serialize as QRLs
        stepRoots.push(...thenMeta.captures.map(captureName));
        let elseQrl = 'undefined';
        if (operation.else !== null) {
          if (operation.else.segment === undefined) {
            markUngeneratable();
          }
          const elseMeta = this.segment(operation.else.segment);
          elseQrl = this.qrlExpression(elseMeta);
          stepRoots.push(...elseMeta.captures.map(captureName));
        }
        const idVariable = `branch_id_${this.nextTemp}`;
        const step = `branch_${this.nextTemp++}`;
        this.imports.add('renderSsrBranch');
        this.imports.add('createSsrRecord');
        this.imports.add('createSsrNodeId');
        const deferred = this.asyncSteps.length > 0;
        this.statements.push(
          deferred ? `let ${idVariable};` : `const ${idVariable} = ctx.nextId();`
        );
        this.pushStep(
          step,
          stepRoots,
          `renderSsrBranch(ctx, ${idVariable}, ${this.qrlExpression(condition)}, ${thenQrl}, ${elseQrl}${operation.root ? ", '', true" : ''})`,
          deferred ? `${idVariable} ??= ctx.nextId(); ` : undefined
        );
        parts.push(`createSsrRecord('<!b=', createSsrNodeId(${idVariable}), '>')`);
        parts.push(step);
        pushStatic('<!/b>');
        return;
      }
      case SsrOpKind.Collection: {
        // eager position only — deferred collections have unproven statement ordering
        const row = operation.row as {
          readonly symbolName?: string;
          readonly segment?: { readonly segment?: string };
        };
        if (operation.source.kind === 'direct-array' && row.symbolName !== undefined) {
          this.inlineCollection(operation, parts);
          return;
        }
        if (
          this.asyncSteps.length > 0 ||
          operation.source.kind !== 'derived' ||
          operation.idBase !== null ||
          row.symbolName !== undefined ||
          row.segment?.segment === undefined ||
          operation.key === null
        ) {
          markUngeneratable();
        }
        const source = this.segment(operation.source.segment);
        const sourceCaptures = source.captures.map((capture) =>
          capture.access === 'component-prop' ? 'props' : this.local(capture.binding)
        );
        const idVariable = `collection_id_${this.nextTemp}`;
        const wrapped = `collection_${this.nextTemp}`;
        const step = `collection_result_${this.nextTemp++}`;
        this.imports.add('_wrapArray');
        this.imports.add('renderSsrCollection');
        this.imports.add('createSsrRecord');
        this.imports.add('createSsrNodeId');
        this.statements.push(`const ${idVariable} = ctx.nextId();`);
        for (const capture of sourceCaptures) {
          this.statements.push(`ctx.addRoot(${capture});`);
        }
        this.statements.push(
          `const ${wrapped} = _wrapArray(${this.qrlExpression(source)});`,
          `if (!Array.isArray(${wrapped})) ctx.addRoot(${wrapped});`
        );
        const keyQrl = this.qrlExpression(this.segment(operation.key));
        const renderQrl = this.qrlExpression(this.segment(row.segment.segment));
        this.statements.push(
          `const ${step} = renderSsrCollection(ctx, ${idVariable}, ${wrapped}, ${keyQrl}, ${renderQrl}, ${operation.usesIndexSignal}, '', ${operation.usesRowId}, ${operation.rowShape});`
        );
        this.asyncSteps.push({ name: step, expr: step });
        parts.push(`createSsrRecord('<!f=', createSsrNodeId(${idVariable}), '>')`);
        parts.push(step);
        pushStatic('<!/f>');
        return;
      }
      case SsrOpKind.Suspense: {
        if (operation.inOrder !== null || operation.delay !== null) {
          markUngeneratable();
        }
        if (operation.content.segment === undefined) {
          markUngeneratable();
        }
        const contentQrl = this.qrlExpression(this.segment(operation.content.segment));
        let fallbackQrl = 'undefined';
        if (operation.fallback !== null) {
          if (operation.fallback.segment === undefined) {
            markUngeneratable();
          }
          fallbackQrl = this.qrlExpression(this.segment(operation.fallback.segment));
        }
        const idVariable = `suspense_id_${this.nextTemp}`;
        const step = `suspense_${this.nextTemp++}`;
        this.imports.add('createSsrSuspense');
        const deferred = this.asyncSteps.length > 0;
        this.statements.push(
          deferred ? `let ${idVariable};` : `const ${idVariable} = ctx.nextId();`
        );
        this.pushStep(
          step,
          [],
          `createSsrSuspense(ctx, ${idVariable}, ${contentQrl}, ${fallbackQrl}, 0)`,
          deferred ? `${idVariable} ??= ctx.nextId(); ` : undefined
        );
        parts.push(step);
        return;
      }
      case SsrOpKind.Slot: {
        if (operation.idBase !== null) {
          markUngeneratable();
        }
        let fallback = 'undefined';
        if (operation.fallback !== null) {
          if (operation.fallback.segment === undefined) {
            markUngeneratable();
          }
          const meta = this.segment(operation.fallback.segment);
          // fallback captures root unconditionally, like the emitted prep
          for (const capture of meta.captures) {
            this.statements.push(
              `ctx.addRoot(${capture.access === 'component-prop' ? 'props' : this.local(capture.binding)});`
            );
          }
          fallback = this.qrlExpression(meta);
        }
        const step = `slot_${this.nextTemp++}`;
        this.imports.add('renderSsrSlot');
        this.imports.add('getActiveInvokeContextOrNull');
        this.pushStep(
          step,
          [],
          `renderSsrSlot(ctx, ${JSON.stringify(operation.name)}, ${fallback}, getActiveInvokeContextOrNull())`
        );
        parts.push(step);
        return;
      }
      default:
        markUngeneratable();
    }
  }

  /** Component call: props literal (signal sources via _props getters), child fn by reference. */
  private componentCall(
    operation: Extract<PlanSsrOp, { o: SsrOpKind.Component }>,
    parts: string[]
  ): void {
    const target = operation.target;
    if (
      operation.propsSource !== null ||
      operation.idBase !== null ||
      operation.blockingSuspense ||
      operation.returnMode !== 'maybe-promise'
    ) {
      markUngeneratable();
    }
    let childName: string;
    if (typeof target === 'string') {
      // lexical reference to a local component in scope
      if (!this.localComponents.has(target)) {
        markUngeneratable();
      }
      childName = target;
    } else {
      const child = this.plan.components[target.ref];
      if (child === undefined) {
        markUngeneratable();
      }
      this.shared.queue.push(target.ref);
      childName = child.name;
    }
    let slotScope: string | null = null;
    if (operation.slots.length > 0) {
      // slot prep is statement-level; inside a deferred step its root order is unproven
      if (this.asyncSteps.length > 0) {
        markUngeneratable();
      }
      slotScope = `slot_scope_${this.nextTemp++}`;
      this.imports.add('createSlotScope');
      this.imports.add('registerProjection');
      this.statements.push(`const ${slotScope} = createSlotScope();`, `ctx.addRoot(${slotScope});`);
      for (const slot of operation.slots) {
        if (slot.idBase !== null || slot.render.segment === undefined) {
          markUngeneratable();
        }
        const meta = this.segment(slot.render.segment);
        for (const capture of meta.captures) {
          this.statements.push(
            `ctx.addRoot(${capture.access === 'component-prop' ? 'props' : this.local(capture.binding)});`
          );
        }
        this.statements.push(
          `registerProjection(${slotScope}, ${JSON.stringify(slot.name)}, ${this.qrlExpression(meta)});`
        );
      }
    }
    // mergeProps segments: literal runs grouped between spreads, in source order
    const runSegments: string[] = [];
    let literalEntries: string[] | null = null;
    const sourceEntries: string[] = [];
    const sourceLocals: string[] = [];
    const literalRun = (): string[] => {
      if (literalEntries === null) {
        literalEntries = [];
        runSegments.push('');
      }
      return literalEntries;
    };
    const closeRun = (): void => {
      if (literalEntries !== null) {
        runSegments[runSegments.length - 1] = `{ ${literalEntries.join(', ')} }`;
        literalEntries = null;
      }
    };
    for (const prop of operation.props) {
      if (prop.p === 'static') {
        const item = prop as { name: string; value: unknown };
        literalRun().push(`${JSON.stringify(item.name)}: ${JSON.stringify(item.value)}`);
      } else if (prop.p === 'dynamic') {
        const item = prop as { name: string; value: { segment?: string; ir?: ValueIR } };
        const ir = item.value.ir;
        if (ir === undefined || (ir.k !== 'signal-read' && ir.k !== 'binding-read')) {
          markUngeneratable();
        }
        const binding = (ir as { binding: number }).binding;
        const value = this.local(binding);
        if (this.sourceKinds.has(binding)) {
          this.imports.add('readTrackedSourceValue');
          literalRun().push(
            `get ${JSON.stringify(item.name)}() { return readTrackedSourceValue(${value}); }`
          );
          sourceEntries.push(`${JSON.stringify(item.name)}: ${value}`);
          sourceLocals.push(value);
        } else {
          // plain values (row params, consts) close over the local without tracking
          literalRun().push(`get ${JSON.stringify(item.name)}() { return ${value}; }`);
        }
      } else if (prop.p === 'event') {
        const event = prop as {
          name: string;
          handlers: readonly { value?: { segment?: string } }[];
        };
        const segmentId = event.handlers[0]?.value?.segment;
        if (event.handlers.length !== 1 || segmentId === undefined) {
          markUngeneratable();
        }
        // event props pass the handler QRL as a plain prop value
        literalRun().push(
          `${JSON.stringify(event.name)}: ${this.qrlExpression(this.segment(segmentId))}`
        );
      } else if (prop.p === 'spread') {
        const item = prop as { value: { ir?: ValueIR } };
        const ir = item.value.ir;
        if (ir === undefined || ir.k !== 'binding-read') {
          markUngeneratable();
        }
        closeRun();
        runSegments.push(this.local(ir.binding));
      } else {
        markUngeneratable();
      }
    }
    closeRun();
    let propsExpr: string;
    if (runSegments.length === 0) {
      propsExpr = '{}';
    } else if (runSegments.length === 1) {
      propsExpr = runSegments[0];
    } else {
      this.imports.add('mergeProps');
      propsExpr = `mergeProps(${runSegments.join(', ')})`;
    }
    if (sourceEntries.length > 0) {
      this.imports.add('_props');
      propsExpr = `_props(${propsExpr}, { ${sourceEntries.join(', ')} })`;
    }
    const step = `component_${this.nextTemp++}`;
    this.imports.add('createComponent');
    const options = slotScope === null ? '' : `, { slotScope: ${slotScope} }`;
    this.pushStep(
      step,
      sourceLocals,
      `createComponent(${propsExpr}, (props) => ${childName}(props, ctx)${options})`
    );
    parts.push(step);
  }

  /** Direct-array collections expand their row inline: a local fn, no QRL, no fences. */
  private inlineCollection(
    operation: Extract<PlanSsrOp, { o: SsrOpKind.Collection }>,
    parts: string[]
  ): void {
    const row = operation.row as unknown as {
      readonly symbolName: string;
      readonly params: number;
      readonly paramBindings?: readonly number[];
      readonly rowRoot: boolean;
      readonly rowMarker: boolean;
      readonly slotMarker: boolean;
      readonly usesRowId: boolean;
      readonly setup: readonly unknown[];
      readonly ops: readonly PlanSsrOp[];
    };
    const sourceIr = (operation.source as { ir?: ValueIR }).ir;
    if (
      operation.key !== null ||
      operation.idBase !== null ||
      operation.usesIndexSignal ||
      row.rowRoot ||
      row.rowMarker ||
      row.slotMarker ||
      row.usesRowId ||
      sourceIr === undefined
    ) {
      markUngeneratable();
    }
    const child = new JsComponentGenerator(
      this.plan,
      this.shared,
      this.segments,
      this.defs,
      this.contexts,
      this.pluginFns,
      {
        locals: this.locals,
        usedNames: this.usedNames,
        localComponents: this.localComponents,
        sourceKinds: this.sourceKinds,
      }
    );
    const params = (row.paramBindings ?? []).slice(0, row.params);
    const paramNames = params.map((binding, index) => child.declare(binding, `row_p${index}`));
    this.statements.push(
      child.generateFn(
        row.symbolName,
        { setup: row.setup, ops: row.ops },
        null,
        false,
        false,
        `(ctx, __rangeId, __rowId${paramNames.map((name) => `, ${name}`).join('')})`
      )
    );
    const step = `collection_result_${this.nextTemp++}`;
    this.imports.add('renderSsrCollection');
    this.pushStep(
      step,
      [],
      `renderSsrCollection(ctx, undefined, ${this.irJs(sourceIr)}, undefined, ${row.symbolName}, ${operation.usesIndexSignal}, '', ${operation.usesRowId}, ${operation.rowShape})`
    );
    parts.push(step);
  }

  /** Content effect: the segment fn renders inside `<!d=N>` fences, re-runnable on resume. */
  private content(
    operation: Extract<PlanSsrOp, { o: SsrOpKind.Content }>,
    parts: string[],
    pushStatic: (text: string) => void
  ): void {
    if (operation.root) {
      markUngeneratable();
    }
    const meta = this.segment(operation.segment);
    const captures = meta.captures.map((capture) =>
      capture.access === 'component-prop' ? 'props' : this.local(capture.binding)
    );
    const idVariable = `content_id_${this.nextTemp}`;
    const step = `content_${this.nextTemp++}`;
    this.imports.add('renderSsrContent');
    this.imports.add('createSsrRecord');
    this.imports.add('createSsrNodeId');
    this.imports.add('escapeSsrContent');
    const deferred = this.asyncSteps.length > 0;
    if (deferred) {
      // deferred content allocates its id when the step runs, keeping q:id chain order
      this.statements.push(`let ${idVariable};`);
    } else {
      this.statements.push(`const ${idVariable} = ctx.nextId();`);
    }
    this.pushStep(
      step,
      captures,
      `renderSsrContent(ctx, ${idVariable}, [${captures.join(', ')}], ${this.qrlExpression(meta, false)})`,
      deferred ? `${idVariable} ??= ctx.nextId(); ` : undefined
    );
    parts.push(`createSsrRecord('<!d=', createSsrNodeId(${idVariable}), '>')`);
    parts.push(`escapeSsrContent(${step})`);
    pushStatic('<!/d>');
  }

  private element(
    operation: Extract<PlanSsrOp, { o: SsrOpKind.Element }>,
    parts: string[],
    pushStatic: (text: string) => void
  ): void {
    if (operation.propsEffect !== null || operation.styleScopedId !== null) {
      markUngeneratable();
    }
    let innerHtml: string | null = null;
    const idVariable = operation.id === null ? null : `id_${operation.id}`;
    if (idVariable !== null) {
      this.statements.push(`__ID_DECL__${idVariable}`);
      this.idState.set(idVariable, 'placeholder');
    }
    // open tag: static attrs fold at generation time; dynamic pieces become record parts
    const open: string[] = [];
    const pushOpen = (text: string): void => {
      const last = open[open.length - 1];
      if (last !== undefined && isStringLiteral(last)) {
        open[open.length - 1] = JSON.stringify(JSON.parse(last) + text);
      } else {
        open.push(JSON.stringify(text));
      }
    };
    pushOpen(`<${operation.tag}`);
    if (idVariable !== null) {
      this.imports.add('createSsrNodeId');
      pushOpen(` q:id="`);
      open.push(`createSsrNodeId(${idVariable})`);
      pushOpen(`"`);
    }
    for (const prop of operation.props) {
      const handled = this.prop(
        prop,
        pushOpen,
        open,
        (html) => (innerHtml = html),
        idVariable,
        operation.props
      );
      if (!handled) {
        markUngeneratable();
      }
    }
    if (idVariable === null && open.length === 1 && isStringLiteral(open[0])) {
      open[0] = JSON.stringify((JSON.parse(open[0]) as string) + '>');
    } else {
      open.push(JSON.stringify('>'));
    }
    if (idVariable === null && open.length === 1) {
      // fully static element folds into the surrounding run
      pushStatic(JSON.parse(open[0]) as string);
    } else {
      this.imports.add('createSsrElementRecord');
      parts.push(`createSsrElementRecord(${JSON.stringify(operation.tag)}, ${open.join(', ')})`);
    }
    if (innerHtml !== null) {
      pushStatic(innerHtml);
    } else {
      for (const child of operation.children) {
        this.op(child, parts, pushStatic);
      }
    }
    if (!operation.void) {
      pushStatic(`</${operation.tag}>`);
    }
  }

  /** Static/event props; returns false for shapes not generatable yet. */
  private prop(
    prop: PlanSsrProp,
    pushOpen: (text: string) => void,
    open: string[],
    setInnerHtml: (html: string) => void,
    idVariable: string | null,
    elementProps: readonly PlanSsrProp[]
  ): boolean {
    switch (prop.p) {
      case 'static': {
        const item = prop as { name: string; value: unknown };
        const stringifiesBooleans =
          item.name.startsWith('aria-') ||
          ['spellcheck', 'draggable', 'contenteditable'].includes(item.name);
        if (typeof item.value === 'boolean' && stringifiesBooleans) {
          pushOpen(` ${item.name}="${item.value}"`);
          return true;
        }
        if (item.value === false || item.value == null) {
          return true;
        }
        pushOpen(
          item.value === true
            ? ` ${item.name}`
            : ` ${item.name}="${escapeAttr(String(item.value))}"`
        );
        return true;
      }
      case 'inner-html': {
        const html = (prop as { html: string | number | boolean | null }).html;
        setInnerHtml(html == null ? '' : String(html));
        return true;
      }
      case 'dynamic': {
        const item = prop as {
          name: string;
          value: { segment?: string; ir?: ValueIR };
          compilerString: boolean;
        };
        const segmentId = item.value.segment;
        if (item.compilerString || idVariable === null) {
          return false;
        }
        if (segmentId === undefined) {
          // signal attr: segment-less signal/binding read subscribes the attribute directly
          const ir = item.value.ir as ValueIR | undefined;
          if (ir === undefined || (ir.k !== 'signal-read' && ir.k !== 'binding-read')) {
            return false;
          }
          const signal = this.local(ir.binding);
          const step = `attr_${this.nextTemp++}`;
          this.imports.add('createSsrElementTarget');
          this.imports.add('renderSsrAttr');
          this.imports.add('escapeHTML');
          this.pushStep(
            step,
            [signal],
            `renderSsrAttr(createSsrElementTarget(${idVariable}), ${JSON.stringify(item.name)}, ${signal})`,
            this.claimId(idVariable)
          );
          open.push(
            `(${step} === null ? '' : ${JSON.stringify(` ${item.name}`)} + (${step} === '' ? '' : '="' + escapeHTML(${step}) + '"'))`
          );
          return true;
        }
        const meta = this.segment(segmentId);
        const captures = meta.captures.map((capture) =>
          capture.access === 'component-prop' ? 'props' : this.local(capture.binding)
        );
        const step = `attr_${this.nextTemp++}`;
        this.imports.add('createSsrElementTarget');
        this.imports.add('renderSsrAttrExpression');
        this.imports.add('escapeHTML');
        this.pushStep(
          step,
          captures,
          `renderSsrAttrExpression(createSsrElementTarget(${idVariable}), ${JSON.stringify(item.name)}, [${captures.join(', ')}], ${this.qrlExpression(meta, false)})`,
          this.claimId(idVariable)
        );
        open.push(
          `(${step} === null ? '' : ${JSON.stringify(` ${item.name}`)} + (${step} === '' ? '' : '="' + escapeHTML(${step}) + '"'))`
        );
        return true;
      }
      case 'event': {
        const event = prop as {
          name: string;
          handlers: readonly ({ value?: { segment?: string } } | { bind: string })[];
        };
        const [handler] = event.handlers;
        if (event.handlers.length !== 1 || handler === undefined) {
          return false;
        }
        if ('bind' in handler) {
          // bind rides the built-in _val/_chk handler capturing the sibling prop's signal
          const bindName = event.name === 'q-e:input' ? 'value' : 'checked';
          const sibling = elementProps.find(
            (candidate) =>
              candidate.p === 'dynamic' && (candidate as { name: string }).name === bindName
          ) as { value: { ir?: ValueIR } } | undefined;
          const ir = sibling?.value.ir;
          if (ir === undefined || (ir.k !== 'signal-read' && ir.k !== 'binding-read')) {
            return false;
          }
          const symbol = bindName === 'value' ? '_val' : '_chk';
          this.imports.add('inlinedQrl');
          this.imports.add(symbol);
          open.push(
            `ctx.eventAttr(${JSON.stringify(event.name)}, inlinedQrl(${symbol}, ${JSON.stringify(symbol)}, [${this.local(ir.binding)}]))`
          );
          return true;
        }
        const segmentId = handler.value?.segment;
        if (segmentId === undefined) {
          return false;
        }
        const meta = this.segment(segmentId);
        if (meta.kind === 'expression') {
          // non-function handler (props.onClick$): evaluate via renderSsrEvent
          if (idVariable === null) {
            return false;
          }
          const captures = meta.captures.map((capture) =>
            capture.access === 'component-prop' ? 'props' : this.local(capture.binding)
          );
          const step = `event_${this.nextTemp++}`;
          this.imports.add('renderSsrEvent');
          this.imports.add('createSsrElementTarget');
          this.pushStep(
            step,
            captures,
            `renderSsrEvent(createSsrElementTarget(${idVariable}), ${JSON.stringify(event.name)}, [${captures.join(', ')}], ${this.qrlExpression(meta, false)}, ctx.eventAttr, [], [])`,
            this.claimId(idVariable)
          );
          open.push(`(${step} ?? '')`);
          return true;
        }
        if (meta.kind !== 'event') {
          return false;
        }
        open.push(`ctx.eventAttr(${JSON.stringify(event.name)}, ${this.qrlExpression(meta)})`);
        return true;
      }
      default:
        return false;
    }
  }

  private dynamicText(
    operation: Extract<PlanSsrOp, { o: SsrOpKind.Dynamic }>,
    parts: string[],
    pushStatic: (text: string) => void
  ): void {
    const target = operation.target;
    if (operation.output !== 'text' || target === null) {
      markUngeneratable();
    }
    if (target.kind === 'range' && target.id === null) {
      markUngeneratable();
    }
    const targetExpr =
      target.kind === 'element'
        ? `createSsrElementTextTarget(id_${target.id})`
        : `createSsrRangeTextTarget(id_${target.id}, ${target.marker})`;
    this.imports.add(
      target.kind === 'element' ? 'createSsrElementTextTarget' : 'createSsrRangeTextTarget'
    );
    this.imports.add('escapeHTML');
    const step = `text_${this.nextTemp++}`;
    const ir = operation.value.ir;
    const segmentId = operation.value.segment;
    const idPrelude = this.claimId(`id_${target.id}`);
    if (segmentId !== undefined) {
      // expression text: the segment fn evaluates with captures under the invoke context
      const meta = this.segment(segmentId);
      const captures = meta.captures.map((capture) =>
        capture.access === 'component-prop' ? 'props' : this.local(capture.binding)
      );
      this.imports.add('renderSsrTextExpression');
      this.pushStep(
        step,
        captures,
        `renderSsrTextExpression(${targetExpr}, [${captures.join(', ')}], ${this.qrlExpression(meta, false)})`,
        idPrelude
      );
    } else if (ir !== undefined && ir.k === 'signal-read') {
      const signal = this.local((ir as { binding: number }).binding);
      this.imports.add('renderSsrTextNode');
      this.pushStep(step, [signal], `renderSsrTextNode(${targetExpr}, ${signal})`, idPrelude);
    } else {
      markUngeneratable();
    }
    if (target.kind === 'range') {
      pushStatic('<!t>');
      parts.push(`escapeHTML(${step})`);
      pushStatic('<!/t>');
    } else {
      parts.push(`escapeHTML(${step})`);
    }
  }

  private qrlExpression(meta: SegmentMeta, withCaptures = true): string {
    const qrl = `q_${meta.symbolName}`;
    if (!this.hoistedSegments.has(meta.id)) {
      this.hoistedSegments.add(meta.id);
      this.imports.add('_qrlWithChunk');
      this.hoists.push(
        `const ${qrl} = /*#__PURE__*/ _qrlWithChunk(${JSON.stringify(meta.chunk)}, () => import(${JSON.stringify(meta.chunk)}), ${JSON.stringify(meta.symbolName)});`
      );
      if (meta.resolved) {
        // eagerly resolved segments import the symbol and settle at module load
        this.chunkImports.push(`import { ${meta.symbolName} } from ${JSON.stringify(meta.chunk)};`);
        this.hoists.push(`${qrl}.s(${meta.symbolName});`);
      }
    }
    if (!withCaptures) {
      return qrl;
    }
    const captures = meta.captures.map((capture) =>
      capture.access === 'component-prop' ? 'props' : this.local(capture.binding)
    );
    return captures.length === 0 ? qrl : `${qrl}.w([${captures.join(', ')}])`;
  }

  /** Plan binding names are reused when they are safe identifiers; `local_<id>` otherwise. */
  declare(binding: number, name: string | undefined): string {
    const preferred =
      name !== undefined && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) && !this.usedNames.has(name)
        ? name
        : `local_${binding}`;
    this.usedNames.add(preferred);
    this.locals.set(binding, preferred);
    return preferred;
  }

  private local(binding: number): string {
    const variable = this.locals.get(binding);
    if (variable !== undefined) {
      return variable;
    }
    // module-scope context ids are referencable like locals
    const context = this.contexts.find((candidate) => candidate.binding === binding);
    if (context?.declaredName !== undefined) {
      return context.declaredName;
    }
    // local components captured as values reference their fn name
    for (const [name, entry] of this.localComponents) {
      if (entry.binding === binding) {
        return name;
      }
    }
    markUngeneratable();
  }

  private contextVar(binding: number): string {
    const context = this.contexts.find((candidate) => candidate.binding === binding);
    if (context === undefined || context.declaredName === undefined) {
      markUngeneratable();
    }
    return context.declaredName;
  }

  private segment(segmentId: string): SegmentMeta {
    const meta = this.segments.find((candidate) => candidate.id === segmentId);
    if (meta === undefined) {
      markUngeneratable();
    }
    return meta;
  }

  private irJs(ir: ValueIR, scope?: ReadonlyMap<number, string>): string {
    switch (ir.k) {
      case 'lit':
        return JSON.stringify(ir.v);
      case 'undef':
        return 'undefined';
      case 'binding-read': {
        const scoped = scope?.get(ir.binding) ?? this.locals.get(ir.binding);
        if (scoped === undefined) {
          markUngeneratable();
        }
        return scoped;
      }
      case 'bin':
        return `(${this.irJs(ir.a, scope)} ${ir.op} ${this.irJs(ir.b, scope)})`;
      case 'template': {
        const chunks = ir.parts.map((part) =>
          typeof part === 'string'
            ? part.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
            : `\${${this.irJs(part, scope)}}`
        );
        return `\`${chunks.join('')}\``;
      }
      case 'call': {
        // qwik: namespaced ops are plain JS calls — method on the receiver or a global
        const args = ir.args.map((argument) => {
          if ((argument as { kind?: string }).kind === 'lambda') {
            markUngeneratable();
          }
          return this.irJs(argument as ValueIR, scope);
        });
        const method = ir.fn.slice(ir.fn.lastIndexOf('.') + 1);
        if (ir.recv !== null) {
          return `${this.irJs(ir.recv, scope)}.${method}(${args.join(', ')})`;
        }
        const namespace = ir.fn.slice(ir.fn.indexOf(':') + 1, ir.fn.lastIndexOf('.'));
        const globals: Record<string, string> = {
          math: 'Math',
          object: 'Object',
          json: 'JSON',
          array: 'Array',
          number: 'Number',
          date: 'Date',
        };
        const owner = globals[namespace];
        if (owner === undefined) {
          markUngeneratable();
        }
        return `${owner}.${method}(${args.join(', ')})`;
      }
      case 'def-call': {
        const def = this.defs[ir.def];
        if (def === undefined) {
          markUngeneratable();
        }
        const args = ir.args.map((argument) => this.irJs(argument, scope));
        return `${def.name}(${args.join(', ')})`;
      }
      case 'array':
        return `[${ir.items.map((item) => this.irJs(item, scope)).join(', ')}]`;
      case 'object': {
        const entries = ir.entries.map(([key, item]) => {
          const safeKey = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
          return `${safeKey}: ${this.irJs(item, scope)}`;
        });
        return `{ ${entries.join(', ')} }`;
      }
      case 'plugin-call': {
        // the claimed import is the JS implementation — import it back and call it
        const pluginFn = this.pluginFns.find((candidate) => candidate.fnId === ir.fnId);
        if (pluginFn === undefined) {
          markUngeneratable();
        }
        const importLine = `import { ${pluginFn.exportName} } from ${JSON.stringify(pluginFn.module)};`;
        if (!this.chunkImports.includes(importLine)) {
          this.chunkImports.push(importLine);
        }
        const args = ir.args.map((argument) => this.irJs(argument, scope));
        return `${pluginFn.exportName}(${args.join(', ')})`;
      }
      default:
        markUngeneratable();
    }
  }
}

function isStringLiteral(expression: string): boolean {
  return expression.startsWith('"');
}

function templateLiteral(text: string): string {
  return `\`${text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')}\``;
}
