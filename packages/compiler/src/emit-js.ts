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
type DefMeta = QwikSsrPlan['modules'][number]['defs'][number];

class JsComponentGenerator {
  private readonly imports: Set<string>;
  private readonly chunkImports: string[];
  private readonly hoists: string[];
  private readonly hoistedSegments: Set<string>;
  private readonly statements: string[] = [];
  private readonly locals = new Map<number, string>();
  private readonly usedNames = new Set<string>(['props', 'ctx', 'invokeCtx']);
  private nextTemp = 0;
  private invokeCtxDeclared = false;
  /** Pending async steps — the return value chains maybeThen over them in order. */
  private readonly asyncSteps: { name: string; expr: string }[] = [];

  constructor(
    private readonly plan: QwikSsrPlan,
    private readonly shared: ModuleState,
    private readonly segments: readonly SegmentMeta[],
    private readonly defs: readonly DefMeta[],
    private readonly pluginFns: QwikSsrPlan['pluginFns']
  ) {
    this.imports = shared.imports;
    this.chunkImports = shared.chunkImports;
    this.hoists = shared.hoists;
    this.hoistedSegments = shared.hoistedSegments;
  }

  generate(component: QwikSsrPlan['components'][number]): string {
    const name = component.name;
    const ssr = component.ssr!;
    // props param bindings: identifier form aliases props; object form destructures by name
    for (const binding of component.propsBindings) {
      this.locals.set(binding, 'props');
    }
    const propsShape = component.props as
      | null
      | { kind: 'identifier'; binding: number }
      | { kind: 'object'; bindings: readonly { b: number; name: string }[] };
    if (propsShape !== null && propsShape !== undefined) {
      if (propsShape.kind === 'identifier') {
        this.locals.set(propsShape.binding, 'props');
      } else {
        const names: string[] = [];
        for (const item of propsShape.bindings) {
          if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(item.name)) {
            markUngeneratable();
          }
          this.declare(item.b, item.name);
          names.push(item.name);
        }
        if (names.length > 0) {
          this.statements.push(`const { ${names.join(', ')} } = props;`);
        }
      }
    }
    // task flush: setup runs first, then the render replays under the captured invoke context
    if (ssr.flushTasks) {
      this.invokeCtx();
    }
    // defs regenerate from IR and export under their names — chunks import them back
    for (const def of this.defs) {
      this.usedNames.add(def.name);
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
    const setupStatements = this.statements.splice(0);
    const parts = this.ops(ssr.ops);
    const value =
      parts.length === 1 && isStringLiteral(parts[0]) ? parts[0] : `[${parts.join(', ')}]`;
    const returnStatement = this.wrapAsync(value);
    let bodyStatements: string[];
    if (ssr.flushTasks) {
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
    return `export function ${name}(props, ctx) {\n${body}\n}\n`;
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
  private pushStep(step: string, roots: readonly string[], callExpr: string): void {
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
      `const ${step} = () => invoke(${invokeCtx}, () => { ${rootStatements}return ${callExpr}; });`
    );
    this.asyncSteps.push({ name: step, expr: `${step}()` });
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
      typeof target === 'string' ||
      operation.propsSource !== null ||
      operation.idBase !== null ||
      operation.blockingSuspense ||
      operation.slots.length > 0 ||
      operation.returnMode !== 'maybe-promise'
    ) {
      markUngeneratable();
    }
    const child = this.plan.components[target.ref];
    if (child === undefined) {
      markUngeneratable();
    }
    this.shared.queue.push(target.ref);
    const literalEntries: string[] = [];
    const sourceEntries: string[] = [];
    const sourceLocals: string[] = [];
    for (const prop of operation.props) {
      if (prop.p === 'static') {
        const item = prop as { name: string; value: unknown };
        literalEntries.push(`${JSON.stringify(item.name)}: ${JSON.stringify(item.value)}`);
      } else if (prop.p === 'dynamic') {
        const item = prop as { name: string; value: { segment?: string; ir?: ValueIR } };
        const ir = item.value.ir;
        if (ir === undefined || (ir.k !== 'signal-read' && ir.k !== 'binding-read')) {
          markUngeneratable();
        }
        const signal = this.local((ir as { binding: number }).binding);
        this.imports.add('readTrackedSourceValue');
        literalEntries.push(
          `get ${JSON.stringify(item.name)}() { return readTrackedSourceValue(${signal}); }`
        );
        sourceEntries.push(`${JSON.stringify(item.name)}: ${signal}`);
        sourceLocals.push(signal);
      } else {
        markUngeneratable();
      }
    }
    const literal = `{ ${literalEntries.join(', ')} }`;
    let propsExpr = literal;
    if (sourceEntries.length > 0) {
      this.imports.add('_props');
      propsExpr = `_props(${literal}, { ${sourceEntries.join(', ')} })`;
    }
    const step = `component_${this.nextTemp++}`;
    this.imports.add('createComponent');
    this.pushStep(
      step,
      sourceLocals,
      `createComponent(${propsExpr}, (props) => ${child.name}(props, ctx))`
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
    this.statements.push(`const ${idVariable} = ctx.nextId();`);
    this.pushStep(
      step,
      captures,
      `renderSsrContent(ctx, ${idVariable}, [${captures.join(', ')}], ${this.qrlExpression(meta, false)})`
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
      this.statements.push(`const ${idVariable} = ctx.nextId();`);
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
            `renderSsrAttr(createSsrElementTarget(${idVariable}), ${JSON.stringify(item.name)}, ${signal})`
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
          `renderSsrAttrExpression(createSsrElementTarget(${idVariable}), ${JSON.stringify(item.name)}, [${captures.join(', ')}], ${this.qrlExpression(meta, false)})`
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
        `renderSsrTextExpression(${targetExpr}, [${captures.join(', ')}], ${this.qrlExpression(meta, false)})`
      );
    } else if (ir !== undefined && ir.k === 'signal-read') {
      const signal = this.local((ir as { binding: number }).binding);
      this.imports.add('renderSsrTextNode');
      this.pushStep(step, [signal], `renderSsrTextNode(${targetExpr}, ${signal})`);
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
  private declare(binding: number, name: string | undefined): string {
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
    if (variable === undefined) {
      markUngeneratable();
    }
    return variable;
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
