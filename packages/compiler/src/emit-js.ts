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
  const component = plan.components[componentIndex];
  if (component === undefined || component.ssr === null) {
    return null;
  }
  const segments = plan.modules[component.module].segments;
  try {
    const generator = new JsComponentGenerator(segments);
    return generator.generate(component.name, component.ssr);
  } catch (error) {
    if (error === UNGENERATABLE) {
      return null;
    }
    throw error;
  }
}

const UNGENERATABLE = Symbol('js-ungeneratable');

type SegmentMeta = QwikSsrPlan['modules'][number]['segments'][number];
type PlanSsrComponent = NonNullable<QwikSsrPlan['components'][number]['ssr']>;

class JsComponentGenerator {
  private readonly imports = new Set<string>();
  private readonly chunkImports: string[] = [];
  private readonly hoists: string[] = [];
  private readonly hoistedSegments = new Set<string>();
  private readonly statements: string[] = [];
  private readonly locals = new Map<number, string>();
  private readonly usedNames = new Set<string>(['props', 'ctx', 'invokeCtx']);
  private nextTemp = 0;
  private invokeCtxDeclared = false;
  /** Pending async steps — the return value chains maybeThen over them in order. */
  private readonly asyncSteps: { name: string; expr: string }[] = [];

  constructor(private readonly segments: readonly SegmentMeta[]) {}

  generate(name: string, ssr: PlanSsrComponent): string {
    if (ssr.flushTasks) {
      throw UNGENERATABLE;
    }
    for (const entry of ssr.setup) {
      this.setupOp(entry as { op: string } & Record<string, unknown>);
    }
    const parts = this.ops(ssr.ops);
    const value =
      parts.length === 1 && isStringLiteral(parts[0]) ? parts[0] : `[${parts.join(', ')}]`;
    const returnStatement = this.wrapAsync(value);
    const header =
      (this.imports.size === 0
        ? ''
        : `import { ${[...this.imports].sort().join(', ')} } from "@qwik.dev/core";\n`) +
      this.chunkImports.map((line) => `${line}\n`).join('');
    const body = [...this.statements, returnStatement].map((line) => `  ${line}`).join('\n');
    return `${header}${this.hoists.join('\n')}${this.hoists.length > 0 ? '\n' : ''}export function ${name}(props, ctx) {\n${body}\n}\n`;
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
      default:
        throw UNGENERATABLE;
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
      default:
        throw UNGENERATABLE;
    }
  }

  private element(
    operation: Extract<PlanSsrOp, { o: SsrOpKind.Element }>,
    parts: string[],
    pushStatic: (text: string) => void
  ): void {
    if (operation.propsEffect !== null || operation.styleScopedId !== null) {
      throw UNGENERATABLE;
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
      const handled = this.prop(prop, pushOpen, open, (html) => (innerHtml = html));
      if (!handled) {
        throw UNGENERATABLE;
      }
    }
    pushOpen('>');
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
    setInnerHtml: (html: string) => void
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
      case 'event': {
        const event = prop as {
          name: string;
          handlers: readonly ({ value?: { segment?: string } } | { bind: string })[];
        };
        const [handler] = event.handlers;
        if (event.handlers.length !== 1 || handler === undefined || !('value' in handler)) {
          return false;
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
      throw UNGENERATABLE;
    }
    if (target.kind === 'range' && target.id === null) {
      throw UNGENERATABLE;
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
      const invokeCtx = this.invokeCtx();
      this.imports.add('invoke');
      this.imports.add('renderSsrTextExpression');
      const roots = captures.map((capture) => `ctx.addRoot(${capture}); `).join('');
      this.statements.push(
        `const ${step} = () => invoke(${invokeCtx}, () => { ${roots}return renderSsrTextExpression(${targetExpr}, [${captures.join(', ')}], ${this.qrlExpression(meta, false)}); });`
      );
      this.asyncSteps.push({ name: step, expr: `${step}()` });
    } else if (ir !== undefined && ir.k === 'signal-read') {
      const signal = this.local((ir as { binding: number }).binding);
      this.imports.add('renderSsrTextNode');
      this.statements.push(
        `ctx.addRoot(${signal});`,
        `const ${step} = renderSsrTextNode(${targetExpr}, ${signal});`
      );
      this.asyncSteps.push({ name: step, expr: step });
    } else {
      throw UNGENERATABLE;
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
      throw UNGENERATABLE;
    }
    return variable;
  }

  private segment(segmentId: string): SegmentMeta {
    const meta = this.segments.find((candidate) => candidate.id === segmentId);
    if (meta === undefined) {
      throw UNGENERATABLE;
    }
    return meta;
  }

  private irJs(ir: ValueIR): string {
    switch (ir.k) {
      case 'lit':
        return JSON.stringify(ir.v);
      case 'undef':
        return 'undefined';
      default:
        throw UNGENERATABLE;
    }
  }
}

function isStringLiteral(expression: string): boolean {
  return expression.startsWith('"');
}
