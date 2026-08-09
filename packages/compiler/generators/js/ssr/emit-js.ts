import type { PlanSsrOp, PlanSsrProp } from '../../../src/emit-plan-ssr';
import { SsrOpKind } from '../../../src/emit-plan-ssr';
import type { QwikSsrPlan } from '../../../src/link-plan';
import type { ValueIR } from '../../../src/expr-ir';
import { escapeAttr } from '../../../src/html-utils';

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

/**
 * Production render pieces for one component, consumed by the legacy module assembly in `emit-ssr`
 * (which owns imports rewriting, q_ QRL hoists, and the component fn head).
 */
export interface JsRenderPieces {
  readonly imports: string[];
  readonly setupStatements: string[];
  readonly statements: string[];
  readonly value: string;
  readonly flushTasks: boolean;
}

/**
 * Generates one component's render body from its wire plan for in-place production emission: q_ QRL
 * constants, defs, contexts, plugin imports, and sibling components resolve to names the
 * surrounding module already provides. Null when any construct is not generatable.
 */
export function emitJsProductionRender(
  wire: PlanSsrComponent,
  component: {
    readonly name: string;
    readonly propsBindings: readonly number[];
    readonly props: unknown;
    readonly providesContext: boolean;
    readonly captures?: readonly { readonly bindingId: number; readonly name: string }[];
  },
  segments: readonly SegmentMeta[],
  defs: readonly DefMeta[],
  contexts: QwikSsrPlan['modules'][number]['contexts'],
  pluginFns: QwikSsrPlan['pluginFns'],
  names: { props: string; ctx: string; invokeCtx: string },
  moduleBindingName?: (binding: number) => string | null,
  coreAlias?: (importedName: string) => string | null,
  sourceBindingName?: (binding: number) => string | null,
  importLocalName?: (module: string, exportName: string) => string | null
): JsRenderPieces | null {
  const shared: ModuleState = {
    imports: new Set(),
    chunkImports: [],
    hoists: [],
    hoistedSegments: new Set(),
    componentFns: [],
    generated: new Set(),
    queue: [],
    production: true,
  };
  try {
    const generator = new JsComponentGenerator(
      // production emission is module-local: cross-component references stay name-based
      { components: [], modules: [], pluginFns } as unknown as QwikSsrPlan,
      shared,
      segments,
      defs,
      contexts,
      pluginFns,
      names,
      undefined,
      moduleBindingName,
      coreAlias,
      sourceBindingName,
      importLocalName
    );
    for (const binding of component.propsBindings) {
      generator.bindProps(binding);
    }
    // the component fn head declares `const <name> = _captures[i];` for each capture
    for (const capture of component.captures ?? []) {
      generator.declare(capture.bindingId, capture.name);
    }
    return generator.generateProduction(
      component.name,
      wire,
      component.props as PropsShape,
      component.providesContext
    );
  } catch (error) {
    if (error === UNGENERATABLE) {
      if (process.env.QWIK_JSGEN_DEBUG === '1') {
        // eslint-disable-next-line no-console
        console.error('production', UNGENERATABLE_SITE);
      }
      return null;
    }
    throw error;
  }
}

/**
 * Chunk body for a segment-backed render block: statements + value with chunk-local QRL hoists and
 * imports. Heads, capture preludes, and module wrappers stay in `emit-segment`.
 */
export function emitJsSegmentBlock(
  block: PlanSsrComponent,
  segments: readonly SegmentMeta[],
  defs: readonly DefMeta[],
  contexts: QwikSsrPlan['modules'][number]['contexts'],
  pluginFns: QwikSsrPlan['pluginFns'],
  names: { props: string; ctx: string; invokeCtx: string },
  captureSeeds: readonly { readonly binding: number; readonly name: string }[],
  paramSeeds: readonly { readonly binding: number; readonly name: string }[] = [],
  moduleBindingName?: (binding: number) => string | null,
  sourceBindingName?: (binding: number) => string | null,
  importLocalName?: (module: string, exportName: string) => string | null,
  rootAttribute: string | null = null,
  blockMarkers: readonly { readonly open: string; readonly close: string }[] = [],
  propsShape: unknown = null,
  providesContext = false,
  rootRangeName: string | null = null
): {
  imports: string[];
  chunkImports: string[];
  hoists: string[];
  statements: string[];
  value: string;
} | null {
  const shared: ModuleState = {
    imports: new Set(),
    chunkImports: [],
    hoists: [],
    hoistedSegments: new Set(),
    componentFns: [],
    generated: new Set(),
    queue: [],
    // the chunk wrapper owns q_ hoists and child imports — reference names only
    production: true,
  };
  try {
    const generator = new JsComponentGenerator(
      { components: [], modules: [], pluginFns } as unknown as QwikSsrPlan,
      shared,
      segments,
      defs,
      contexts,
      pluginFns,
      names,
      undefined,
      moduleBindingName,
      undefined,
      sourceBindingName,
      importLocalName
    );
    for (const seed of [...captureSeeds, ...paramSeeds]) {
      generator.declare(seed.binding, seed.name);
    }
    generator.rootAttribute = rootAttribute;
    generator.blockMarkers = blockMarkers;
    generator.rootRangeName = rootRangeName;
    // the emitted chunk head owns the props destructure; bind locals only
    const pieces = generator.generateProduction(
      '',
      block,
      propsShape as PropsShape,
      providesContext
    );
    // captures arrive pre-rooted through the QRL capture table — their addRoot calls drop
    const dropCaptureRoots = (text: string): string => {
      for (const seed of captureSeeds) {
        text = text.split(`${names.ctx}.addRoot(${seed.name}); `).join('');
      }
      return text;
    };
    const statements = [...pieces.setupStatements, ...pieces.statements]
      .map((statement) => {
        for (const seed of captureSeeds) {
          if (statement === `${names.ctx}.addRoot(${seed.name});`) {
            return null;
          }
        }
        return dropCaptureRoots(statement);
      })
      .filter((statement): statement is string => statement !== null);
    return {
      imports: [...shared.imports, ...pieces.imports],
      chunkImports: shared.chunkImports,
      hoists: shared.hoists,
      statements,
      value: dropCaptureRoots(pieces.value),
    };
  } catch (error) {
    if (error === UNGENERATABLE) {
      if (process.env.QWIK_JSGEN_DEBUG === '1') {
        // eslint-disable-next-line no-console
        console.error('chunk', UNGENERATABLE_SITE);
      }
      return null;
    }
    throw error;
  }
}

type PlanSsrComponent = {
  readonly setup: readonly unknown[];
  readonly ops: readonly PlanSsrOp[];
  /** Component blocks group annotations under `ssr`; nested RenderFns stay flat (for now). */
  readonly ssr?: {
    readonly syncRender?: boolean;
    readonly staticRoot?: boolean;
    readonly flushTasks?: boolean;
    readonly runtimeScope?: true;
  };
};

function blockAnnotations(ssr: PlanSsrComponent): {
  syncRender: boolean;
  staticRoot: boolean;
  flushTasks: boolean;
  runtimeScope: boolean;
} {
  const grouped = ssr.ssr;
  const flat = ssr as {
    synchronous?: boolean;
    staticRoot?: boolean;
    runtimeScope?: true;
  };
  return {
    syncRender: grouped?.syncRender === true || flat.synchronous === true,
    staticRoot: grouped?.staticRoot === true || flat.staticRoot === true,
    flushTasks: grouped?.flushTasks === true,
    runtimeScope: grouped?.runtimeScope === true || flat.runtimeScope === true,
  };
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
  /** In-place production emission: skip hoists and child queueing. */
  readonly production?: boolean;
}

/** Debug-only: stack captured at the most recent UNGENERATABLE throw. */
let UNGENERATABLE_SITE = '';
let UNGENERATABLE_DETAIL = '';
export function markUngeneratable(detail?: unknown): never {
  UNGENERATABLE_SITE = new Error('ungeneratable').stack ?? '';
  UNGENERATABLE_DETAIL = detail === undefined ? '' : JSON.stringify(detail);
  throw UNGENERATABLE;
}

/** Detail recorded by the most recent `markUngeneratable`, for compile diagnostics. */
export function lastUngeneratableDetail(): string {
  return UNGENERATABLE_DETAIL;
}

/** Tagged PlanValue form accessors — see emit-plan `PlanValue`. */
type WireValue =
  | { readonly kind: 'ir'; readonly ir: ValueIR; readonly segment?: string }
  | { readonly kind: 'segment'; readonly segment: string }
  | { readonly kind: 'js'; readonly src: string; readonly pure?: true };

function valueIr(value: unknown): ValueIR | undefined {
  const wire = value as WireValue;
  return wire.kind === 'ir' ? wire.ir : undefined;
}

function valueSegment(value: unknown): string | undefined {
  const wire = value as WireValue;
  return wire.kind === 'ir' || wire.kind === 'segment' ? wire.segment : undefined;
}

function valueJs(value: unknown): { src: string; pure: boolean } | undefined {
  const wire = value as WireValue;
  return wire.kind === 'js' ? { src: wire.src, pure: wire.pure === true } : undefined;
}

const UNGENERATABLE = Symbol('js-ungeneratable');

type SegmentMeta = QwikSsrPlan['modules'][number]['segments'][number];
type PropsShape =
  | null
  | undefined
  | { kind: 'identifier'; binding: number }
  | { kind: 'object'; bindings: readonly { binding: number; name: string }[] };
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
  private usedNames: Set<string>;
  private localComponents = new Map<string, LocalComponentEntry>();
  /** `_markComponent` marks flushed after the owning scope's setup completes. */
  private readonly pendingMarks: string[] = [];
  private nextTemp = 0;
  private invokeCtxDeclared = false;
  /** Wire-proven synchronous render: steps stay eager and the value skips maybeThen. */
  private synchronous = false;
  /** Wire staticRoot: the whole render folds to strings; otherwise top-level ops keep parts. */
  private staticRoot = false;
  /** Pending element attrs (useOn/visible tasks) need the first element kept as a record. */
  private pendingAttrAnchor = false;
  /** Runtime style scope local (custom-hook components); null when the render has none. */
  private runtimeScopeName: string | null = null;
  /** Only the first element of a structured render keeps the tagged element record. */
  private didEmitRoot = false;
  /** Chunk-only: attribute text appended to the root element's open record (` q:row`). */
  rootAttribute: string | null = null;
  /** Chunk-only: marker ranges bracketing the block's parts, innermost first. */
  blockMarkers: readonly { readonly open: string; readonly close: string }[] = [];
  /** Chunk-only: runtime id name for range targets anchored on the block's own range. */
  rootRangeName: string | null = null;
  /** Sync handlers referenced by this block: key → source, emitted as a table script. */
  private readonly syncFns = new Map<string, string>();
  /** Bindings declared as reactive sources (signal/store/computed) — prop getters track them. */
  private sourceKinds = new Set<number>();
  /** Use-id locals — reads of these are compile-time-proven stable strings. */
  private useIdBindings = new Set<number>();
  /** Element id placeholders: resolved at first claiming step (eager const / lazy let). */
  private readonly idState = new Map<string, 'placeholder' | 'eager' | 'lazy'>();
  /** Pending async steps — the return value chains maybeThen over them in order. */
  private readonly asyncSteps: { name: string; expr: string; after?: string }[] = [];

  constructor(
    private readonly plan: QwikSsrPlan,
    private readonly shared: ModuleState,
    private readonly segments: readonly SegmentMeta[],
    private readonly defs: readonly DefMeta[],
    private readonly contexts: QwikSsrPlan['modules'][number]['contexts'],
    private readonly pluginFns: QwikSsrPlan['pluginFns'],
    private readonly names: { props: string; ctx: string; invokeCtx: string } = {
      props: 'props',
      ctx: 'ctx',
      invokeCtx: 'invokeCtx',
    },
    seed?: {
      readonly locals: ReadonlyMap<number, string>;
      readonly usedNames: ReadonlySet<string>;
      readonly localComponents: ReadonlyMap<string, LocalComponentEntry>;
      readonly sourceKinds: ReadonlySet<number>;
    },
    /** Production only: module-scope bindings resolve to their surviving source names. */
    private readonly moduleBindingName?: (binding: number) => string | null,
    /** Production only: aliased core imports keep the module's local name. */
    private readonly coreAlias?: (importedName: string) => string | null,
    /** Production only: js-statement-declared locals keep their source names verbatim. */
    private readonly sourceBindingName?: (binding: number) => string | null,
    /** Production only: local name of an import by (module, export) — plugin-call resolution. */
    private readonly importLocalName?: (module: string, exportName: string) => string | null
  ) {
    this.imports = shared.imports;
    this.chunkImports = shared.chunkImports;
    this.hoists = shared.hoists;
    this.hoistedSegments = shared.hoistedSegments;
    this.usedNames = new Set([this.names.props, this.names.ctx, this.names.invokeCtx, '_id']);
    if (seed !== undefined) {
      this.locals = new Map(seed.locals);
      this.usedNames = new Set(seed.usedNames);
      this.localComponents = new Map(seed.localComponents);
      this.sourceKinds = new Set(seed.sourceKinds);
    }
  }

  bindProps(binding: number): void {
    this.locals.set(binding, this.names.props);
  }

  /** Production body pieces: like generateFn but without the head — emitComponent adds it. */

  /** Mirrors the legacy scope-only class emission (static id literal / runtime conditional). */
  private pushScopeOnlyClass(
    scope: JsStyleScope,
    pushOpen: (text: string) => void,
    open: string[]
  ): void {
    if (scope.runtimeName === null && scope.staticId !== null) {
      pushOpen(` class="${escapeAttr(scope.staticId)}"`);
      return;
    }
    this.imports.add('escapeHTML');
    if (scope.staticId === null && scope.runtimeName !== null) {
      open.push(
        `(${scope.runtimeName} ? ' class="' + escapeHTML(${scope.runtimeName}) + '"' : '')`
      );
      return;
    }
    pushOpen(' class="');
    open.push(`escapeHTML(${scopeClassExpression(scope, null)})`);
    pushOpen('"');
  }

  /** Expression text for a value: IR preferred; pure js src embeds verbatim; null otherwise. */
  private valueExpression(value: unknown): string | null {
    const ir = valueIr(value);
    if (ir !== undefined) {
      return this.irJs(ir);
    }
    const js = valueJs(value);
    return js !== undefined && js.pure ? `(${js.src})` : null;
  }

  /** Plugin-call argument: plain IR, pure expression lambda, or a render-bodied callback. */
  private pluginArgJs(argument: unknown, scope?: ReadonlyMap<number, string>): string {
    const tagged = argument as { kind?: string };
    if (tagged.kind === 'lambda') {
      const lambda = argument as {
        params: readonly { name: string; binding: number | null }[];
        body: ValueIR;
      };
      const lambdaScope = new Map(scope);
      const names = lambda.params.map((param) => {
        if (param.binding !== null) {
          lambdaScope.set(param.binding, param.name);
        }
        return param.name;
      });
      return `(${names.join(', ')}) => ${this.irJs(lambda.body, lambdaScope)}`;
    }
    if (tagged.kind === 'qrl-arg') {
      // the dollar-rewritten call takes the QRL itself
      return this.qrlExpression(this.segment((argument as { segment: string }).segment));
    }
    if (tagged.kind === 'fn-arg') {
      const meta = this.segment((argument as { segment: string }).segment);
      if (!meta.resolved) {
        markUngeneratable(meta.id); // the callback runs during render — it must resolve eagerly
      }
      // register the qrl (and its eager chunk import) so the symbol is in scope
      this.qrlExpression(meta, false);
      const captures = meta.captures.map((capture) =>
        capture.access === 'component-prop' ? this.names.props : this.local(capture.binding)
      );
      if (captures.length === 0) {
        return meta.symbolName;
      }
      this.imports.add('_withCaptures');
      return `_withCaptures(${meta.symbolName}, [${captures.join(', ')}])`;
    }
    if (tagged.kind === 'render-arg') {
      const renderArg = argument as {
        params: readonly { name: string; binding: number | null }[];
        render?: LocalComponentEntry['render'];
      };
      if (renderArg.render === undefined) {
        markUngeneratable('unresolved render-arg');
      }
      // the callback re-enters the captured invoke context when its host eventually calls it
      const invokeCtx = this.invokeCtx();
      this.imports.add('invoke');
      const seedLocals = new Map(this.locals);
      const paramNames = renderArg.params.map((param) => {
        if (param.binding !== null) {
          seedLocals.set(param.binding, param.name);
        }
        return param.name;
      });
      const child = new JsComponentGenerator(
        this.plan,
        this.shared,
        this.segments,
        this.defs,
        this.contexts,
        this.pluginFns,
        this.names,
        {
          locals: seedLocals,
          usedNames: this.usedNames,
          localComponents: this.localComponents,
          sourceKinds: this.sourceKinds,
        },
        this.moduleBindingName,
        this.coreAlias,
        this.sourceBindingName,
        this.importLocalName
      );
      const fn = child.generateFn('__render_arg', renderArg.render, null, false, false, '()');
      const body = fn.slice(fn.indexOf('{') + 1, fn.lastIndexOf('}'));
      return `(${paramNames.join(', ')}) => invoke(${invokeCtx}, () => (() => {${body}})())`;
    }
    return this.irJs(argument as ValueIR, scope as Map<number, string> | undefined);
  }

  /** Core helper reference: reuses the module's import alias when one exists. */
  private coreName(importedName: string): string {
    const alias = this.coreAlias?.(importedName);
    if (alias != null) {
      return alias;
    }
    this.imports.add(importedName);
    return importedName;
  }

  /** Custom-hook renders resolve the ambient style scope once, before any parts. */
  private beginRuntimeScope(ssr: PlanSsrComponent): void {
    if (!blockAnnotations(ssr).runtimeScope) {
      return;
    }
    this.runtimeScopeName = `style_scope_${this.nextTemp++}`;
    this.imports.add('getActiveInvokeContext');
    this.statements.push(
      `const ${this.runtimeScopeName} = getActiveInvokeContext().styleScopes?.join(' ');`
    );
  }

  generateProduction(
    name: string,
    ssr: PlanSsrComponent,
    propsShape: PropsShape,
    providesContext: boolean,
    destructureProps = false
  ): JsRenderPieces {
    void name;
    const annotations = blockAnnotations(ssr as PlanSsrComponent);
    this.synchronous = annotations.syncRender;
    this.staticRoot = annotations.staticRoot;
    // component heads own the param destructure; chunk bodies emit it themselves
    this.bindPropsShape(propsShape, destructureProps);
    if (blockAnnotations(ssr as PlanSsrComponent).flushTasks) {
      this.invokeCtx();
    }
    for (const entry of ssr.setup as ({ kind: string } & Record<string, unknown>)[]) {
      if (entry.kind === 'render-fn' && entry.component === true) {
        this.localComponents.set(entry.name as string, entry as unknown as LocalComponentEntry);
      }
    }
    for (const entry of ssr.setup) {
      this.setupOp(entry as { kind: string } & Record<string, unknown>);
    }
    for (const markName of this.pendingMarks.splice(0)) {
      const entry = this.localComponents.get(markName)!;
      this.statements.push(
        `_markComponent(${markName}, ${this.qrlExpression(this.segment(entry.segment))});`
      );
    }
    const setupStatements = this.finalizeIds(this.statements.splice(0));
    this.beginRuntimeScope(ssr);
    let contextScope: string | null = null;
    if (providesContext) {
      contextScope = `context_scope_${this.nextTemp++}`;
      this.statements.push(`const ${contextScope} = ${this.names.ctx}.contextScopeRef();`);
      this.imports.add('createSsrRecord');
    }
    const parts = this.ops(ssr.ops);
    if (contextScope !== null) {
      parts.unshift(`createSsrRecord('<!c=', ${contextScope}, '>')`);
      const last = parts[parts.length - 1];
      if (last !== undefined && isStringLiteral(last)) {
        parts[parts.length - 1] = JSON.stringify((JSON.parse(last) as string) + '<!/c>');
      } else {
        parts.push(JSON.stringify('<!/c>'));
      }
    }
    // sync handlers define themselves ahead of the HTML that references them; source holes
    // never reach qrlExpression, so every sync segment in scope registers here
    for (const candidate of this.segments) {
      if (candidate.qrl?.kind === 'sync' && candidate.syncSource !== undefined) {
        this.syncFns.set(candidate.symbolName, candidate.syncSource);
      }
    }
    for (const [key, source] of this.syncFns) {
      parts.unshift(`${this.names.ctx}.syncFn(${JSON.stringify(key)}, ${JSON.stringify(source)})`);
    }
    // chunk markers bracket the parts, innermost first; closers merge into trailing statics
    for (const marker of this.blockMarkers) {
      this.imports.add('createSsrRecord');
      this.imports.add('createSsrNodeId');
      parts.unshift(marker.open);
      const last = parts[parts.length - 1];
      if (last !== undefined && isStringLiteral(last)) {
        parts[parts.length - 1] = JSON.stringify((JSON.parse(last) as string) + marker.close);
      } else {
        parts.push(JSON.stringify(marker.close));
      }
    }
    const value = parts.length === 1 ? parts[0] : `[${parts.join(', ')}]`;
    const statements = this.finalizeIds(this.statements.splice(0));
    const chainValue = this.wrapAsyncValue(value);
    if (blockAnnotations(ssr as PlanSsrComponent).flushTasks) {
      this.imports.add('maybeThen');
      this.imports.add('invoke');
    }
    return {
      imports: [...this.imports],
      setupStatements,
      statements,
      value: chainValue,
      flushTasks: blockAnnotations(ssr as PlanSsrComponent).flushTasks,
    };
  }

  generate(component: QwikSsrPlan['components'][number]): string {
    for (const binding of component.propsBindings) {
      this.locals.set(binding, this.names.props);
    }
    // standalone heads mirror emitComponentFunction: needsId components take the _id param
    const signature = component.needsId
      ? `(${this.names.props}, ${this.names.ctx}, _id = ${JSON.stringify(component.idBase)})`
      : undefined;
    return this.generateFn(
      component.name,
      component.ssr!,
      component.props as PropsShape,
      component.providesContext,
      true,
      signature,
      component.async === true
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
    signature?: string,
    isAsync = false
  ): string {
    signature ??= `(${this.names.props}, ${this.names.ctx})`;
    const annotations = blockAnnotations(ssr as PlanSsrComponent);
    this.synchronous = annotations.syncRender;
    this.staticRoot = annotations.staticRoot;
    this.bindPropsShape(propsShape);
    // task flush: setup runs first, then the render replays under the captured invoke context
    if (blockAnnotations(ssr as PlanSsrComponent).flushTasks) {
      this.invokeCtx();
    }
    // local-component declarations hoist: siblings are callable before their statement
    for (const entry of ssr.setup as ({ kind: string } & Record<string, unknown>)[]) {
      if (entry.kind === 'render-fn' && entry.component === true) {
        this.localComponents.set(entry.name as string, entry as unknown as LocalComponentEntry);
      }
    }
    // defs regenerate from IR and export under their names — chunks import them back
    for (const def of this.defs) {
      this.usedNames.add(def.name);
    }
    if (
      !this.shared.production &&
      this.contexts.length > 0 &&
      !this.shared.hoistedSegments.has('__contexts__')
    ) {
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
    if (
      !this.shared.production &&
      this.defs.length > 0 &&
      !this.shared.hoistedSegments.has('__defs__')
    ) {
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
      this.setupOp(entry as { kind: string } & Record<string, unknown>);
    }
    for (const markName of this.pendingMarks.splice(0)) {
      const entry = this.localComponents.get(markName)!;
      this.statements.push(
        `_markComponent(${markName}, ${this.qrlExpression(this.segment(entry.segment))});`
      );
    }
    const setupStatements = this.statements.splice(0);
    this.beginRuntimeScope(ssr as PlanSsrComponent);
    let contextScope: string | null = null;
    if (providesContext) {
      contextScope = `context_scope_${this.nextTemp++}`;
      this.statements.push(`const ${contextScope} = ${this.names.ctx}.contextScopeRef();`);
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
    for (const [key, source] of this.syncFns) {
      parts.unshift(`${this.names.ctx}.syncFn(${JSON.stringify(key)}, ${JSON.stringify(source)})`);
    }
    const value = parts.length === 1 ? parts[0] : `[${parts.join(', ')}]`;
    const returnStatement = this.wrapAsync(value);
    let bodyStatements: string[];
    const finalizedStatements = this.finalizeIds(this.statements);
    this.statements.splice(0, this.statements.length, ...finalizedStatements);
    if (blockAnnotations(ssr as PlanSsrComponent).flushTasks) {
      this.imports.add('maybeThen');
      this.imports.add('invoke');
      const inner = [...this.statements, returnStatement].map((line) => `  ${line}`).join('\n');
      bodyStatements = [
        ...setupStatements,
        `return maybeThen(${this.names.ctx}.scheduler.flush(), () => invoke(invokeCtx, () => {\n${inner}\n  }));`,
      ];
    } else {
      bodyStatements = [...setupStatements, ...this.statements, returnStatement];
    }
    const body = bodyStatements.map((line) => `  ${line}`).join('\n');
    return `${exported ? 'export ' : ''}${isAsync ? 'async ' : ''}function ${name}${signature} {\n${body}\n}\n`;
  }

  /** Props param bindings: identifier form aliases props; object form destructures by name. */
  private bindPropsShape(propsShape: PropsShape, emitDestructure = true): void {
    if (propsShape === null || propsShape === undefined) {
      return;
    }
    if (propsShape.kind === 'identifier') {
      this.locals.set(propsShape.binding, this.names.props);
      return;
    }
    const names: string[] = [];
    for (const item of propsShape.bindings) {
      // shorthand destructure requires the declared name to be the prop name
      if (
        !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(item.name) ||
        // a capture may already bind this prop under its own name — that binding stands
        (this.locals.get(item.binding) === item.name
          ? item.name
          : this.declare(item.binding, item.name)) !== item.name
      ) {
        markUngeneratable();
      }
      names.push(item.name);
    }
    if (emitDestructure && names.length > 0) {
      this.statements.push(`const { ${names.join(', ')} } = ${this.names.props};`);
    }
  }

  /** MaybeThen chain over async steps, innermost carrying the parts value. */
  private wrapAsync(value: string): string {
    return `return ${this.wrapAsyncValue(value)};`;
  }

  /** The chain expression alone — production emission returns it as the render value. */
  private wrapAsyncValue(value: string): string {
    if (this.asyncSteps.length === 0 || this.synchronous) {
      return value;
    }
    this.imports.add('maybeThen');
    return this.asyncSteps.reduceRight(
      (inner, step) =>
        step.after === undefined
          ? `maybeThen(${step.expr}, (${step.name}) => ${inner})`
          : `maybeThen(${step.expr}, (${step.name}) => {\n  ${step.after}\n  return ${inner};\n})`,
      value
    );
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
    thunkPrelude = '',
    after?: string
  ): void {
    if (this.asyncSteps.length === 0 || this.synchronous) {
      for (const root of roots) {
        this.statements.push(`${this.names.ctx}.addRoot(${root});`);
      }
      this.statements.push(`const ${step} = ${callExpr};`);
      if (after !== undefined && this.synchronous) {
        // no chain in sync renders: the side effect runs as a plain statement
        this.statements.push(after);
        this.asyncSteps.push({ name: step, expr: step });
        return;
      }
      this.asyncSteps.push({ name: step, expr: step, ...(after === undefined ? {} : { after }) });
      return;
    }
    const invokeCtx = this.invokeCtx();
    this.imports.add('invoke');
    const rootStatements = roots.map((root) => `${this.names.ctx}.addRoot(${root}); `).join('');
    this.statements.push(
      `const ${step} = () => invoke(${invokeCtx}, () => { ${thunkPrelude}${rootStatements}return ${callExpr}; });`
    );
    this.asyncSteps.push({
      name: step,
      expr: `${step}()`,
      ...(after === undefined ? {} : { after }),
    });
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
      return `${idVariable} ??= ${this.names.ctx}.nextId(); `;
    }
    const placeholder = `__ID_DECL__${idVariable}`;
    const index = this.statements.indexOf(placeholder);
    if (this.asyncSteps.length === 0) {
      if (index >= 0) {
        this.statements[index] = `const ${idVariable} = ${this.names.ctx}.nextId();`;
      }
      this.idState.set(idVariable, 'eager');
      return '';
    }
    if (index >= 0) {
      this.statements[index] = `let ${idVariable};`;
    }
    this.idState.set(idVariable, 'lazy');
    return `${idVariable} ??= ${this.names.ctx}.nextId(); `;
  }

  /** Unclaimed ids allocate eagerly at their element's position. */
  private finalizeIds(statements: string[]): string[] {
    return statements.map((statement) =>
      statement.startsWith('__ID_DECL__')
        ? `const ${statement.slice('__ID_DECL__'.length)} = ${this.names.ctx}.nextId();`
        : statement
    );
  }

  /** Ambient invoke context, captured once before any async boundary. */
  private invokeCtx(): string {
    if (!this.invokeCtxDeclared) {
      this.invokeCtxDeclared = true;
      this.imports.add('getActiveInvokeContextOrNull');
      this.statements.push(`const ${this.names.invokeCtx} = getActiveInvokeContextOrNull();`);
    }
    return this.names.invokeCtx;
  }

  private setupOp(entry: { kind: string } & Record<string, unknown>): void {
    switch (entry.kind) {
      case 'signal': {
        const binding = entry.binding as number;
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
        const binding = entry.binding as number;
        this.sourceKinds.add(binding);
        const variable = this.declare(binding, entry.name as string | undefined);
        this.imports.add('useStore');
        this.statements.push(`const ${variable} = useStore(${this.irJs(entry.init as ValueIR)});`);
        return;
      }
      case 'style': {
        const css = entry.css as string | undefined;
        const helper = entry.scoped === true ? 'useStylesScoped' : 'useStyles';
        if (css === undefined || entry.resultUsed === true) {
          const src = entry.src as string | undefined;
          if (src === undefined) {
            markUngeneratable();
          }
          this.imports.add(helper);
          this.statements.push(src);
          return;
        }
        this.imports.add(helper);
        this.statements.push(
          `${helper}(${templateLiteral(css)}, ${JSON.stringify(entry.styleId)});`
        );
        return;
      }
      case 'computed': {
        const binding = entry.binding as number;
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
      case 'render-fn': {
        if (entry.component !== true) {
          const item = entry as unknown as {
            name: string;
            binding: number;
            render: LocalComponentEntry['render'];
          };
          const name = this.declare(item.binding, item.name);
          const child = new JsComponentGenerator(
            this.plan,
            this.shared,
            this.segments,
            this.defs,
            this.contexts,
            this.pluginFns,
            this.names,
            {
              locals: this.locals,
              usedNames: this.usedNames,
              localComponents: this.localComponents,
              sourceKinds: this.sourceKinds,
            },
            this.moduleBindingName,
            this.coreAlias,
            this.sourceBindingName,
            this.importLocalName
          );
          // zero-arg render fn: `const view = () => { ...; return parts; }`
          const fn = child.generateFn(name, item.render, null, false, false, '()');
          this.statements.push(
            fn.replace(`function ${name}()`, `const ${name} = () =>`).replace(/\}\n$/, '};')
          );
          return;
        }
        const local = entry as unknown as LocalComponentEntry;
        const child = new JsComponentGenerator(
          this.plan,
          this.shared,
          this.segments,
          this.defs,
          this.contexts,
          this.pluginFns,
          this.names,
          {
            locals: this.locals,
            usedNames: this.usedNames,
            localComponents: this.localComponents,
            sourceKinds: this.sourceKinds,
          },
          this.moduleBindingName,
          this.coreAlias,
          this.sourceBindingName,
          this.importLocalName
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
      case 'js': {
        // only seam-rewritten statements are emittable; raw src still gates generation
        if (entry.final !== true) {
          markUngeneratable();
        }
        for (const name of (entry.imports as readonly string[] | undefined) ?? []) {
          this.imports.add(name);
        }
        this.statements.push(entry.src as string);
        return;
      }
      case 'use-id': {
        this.useIdBindings.add(entry.binding as number);
        const variable = this.declare(entry.binding as number, entry.name as string | undefined);
        this.statements.push(
          `const ${variable} = (_id + 'u${(entry.ordinal as number | undefined) ?? 0}');`
        );
        return;
      }
      case 'qrl-const': {
        const variable = this.declare(entry.binding as number, entry.name as string | undefined);
        const meta = this.segment(entry.segment as string);
        this.statements.push(`const ${variable} = ${this.qrlExpression(meta)};`);
        return;
      }
      case 'server-data': {
        const variable = this.declare(entry.binding as number, entry.name as string | undefined);
        const callee = this.coreName('useServerData');
        const key = this.irJs(entry.key as ValueIR);
        const fallback = entry.fallback == null ? '' : `, ${this.irJs(entry.fallback as ValueIR)}`;
        this.statements.push(`const ${variable} = ${callee}(${key}${fallback});`);
        return;
      }
      case 'const': {
        const binding = entry.binding as number;
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
        const binding = entry.binding as number;
        const variable = this.declare(binding, entry.name as string | undefined);
        this.imports.add('useContext');
        this.statements.push(
          `const ${variable} = useContext(${this.contextVar(entry.context as number)});`
        );
        return;
      }
      case 'statement': {
        // evaluate-and-discard; the async head comes from the component flag
        const prefix = entry.await === true ? 'await ' : '';
        this.statements.push(`${prefix}${this.irJs(entry.value as ValueIR)};`);
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
        this.pendingAttrAnchor = true;
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
      this.op(operation, parts, pushStatic, true);
    }
    return parts;
  }

  private op(
    operation: PlanSsrOp,
    parts: string[],
    pushStatic: (text: string) => void,
    topLevel = false
  ): void {
    switch (operation.kind) {
      case SsrOpKind.Static:
        pushStatic(operation.html);
        return;
      case SsrOpKind.Element:
        this.element(operation, parts, pushStatic, topLevel);
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
        if (operation.ssr.idBase !== null || operation.then.segment === undefined) {
          markUngeneratable();
        }
        const condition = this.segment(operation.condition);
        const captureName = (capture: SegmentMeta['captures'][number]): string =>
          capture.access === 'component-prop' ? this.names.props : this.local(capture.binding);
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
          deferred ? `let ${idVariable};` : `const ${idVariable} = ${this.names.ctx}.nextId();`
        );
        this.pushStep(
          step,
          stepRoots,
          `renderSsrBranch(${this.names.ctx}, ${idVariable}, ${this.qrlExpression(condition)}, ${thenQrl}, ${elseQrl}${operation.ssr.root ? ", '', true" : ''})`,
          deferred ? `${idVariable} ??= ${this.names.ctx}.nextId(); ` : undefined
        );
        parts.push(`createSsrRecord('<!b=', createSsrNodeId(${idVariable}), '>')`);
        parts.push(step);
        pushStatic('<!/b>');
        return;
      }
      case SsrOpKind.Collection: {
        const row = operation.row as {
          readonly symbolName?: string;
          readonly segment?: { readonly segment?: string };
        };
        if (operation.source.kind === 'direct-array' && row.symbolName !== undefined) {
          this.inlineCollection(operation, parts);
          return;
        }
        if (
          operation.source.kind === 'direct-array' ||
          row.symbolName !== undefined ||
          row.segment?.segment === undefined
        ) {
          markUngeneratable({
            steps: this.asyncSteps.length,
            source: operation.source.kind,
            symbolName: row.symbolName,
            rowSegment: row.segment?.segment,
          });
        }
        const rootCaptures = (meta: SegmentMeta): void => {
          for (const capture of meta.captures) {
            this.statements.push(
              `${this.names.ctx}.addRoot(${capture.access === 'component-prop' ? this.names.props : this.local(capture.binding)});`
            );
          }
        };
        const idVariable = `collection_id_${this.nextTemp}`;
        const wrapped = `collection_${this.nextTemp}`;
        const step = `collection_result_${this.nextTemp++}`;
        const keyMeta = operation.key === null ? null : this.segment(operation.key);
        const rowMeta = this.segment(row.segment.segment);
        this.imports.add('renderSsrCollection');
        this.imports.add('createSsrRecord');
        this.imports.add('createSsrNodeId');
        // deferred position: the whole render runs in a chained thunk with a lazy id claim
        if (this.asyncSteps.length > 0 && operation.source.kind === 'derived') {
          const source = this.segment(operation.source.segment);
          const deferredKeyMeta = operation.key === null ? null : this.segment(operation.key);
          const deferredRowMeta = this.segment(row.segment.segment);
          const inner: string[] = [`${idVariable} ??= ${this.names.ctx}.nextId();`];
          const rootCapturesInner = (meta: SegmentMeta): void => {
            for (const capture of meta.captures) {
              const name =
                capture.access === 'component-prop'
                  ? this.names.props
                  : this.local(capture.binding);
              inner.push(`${this.names.ctx}.addRoot(${name});`);
            }
          };
          rootCapturesInner(source);
          if (deferredKeyMeta !== null) {
            rootCapturesInner(deferredKeyMeta);
          }
          rootCapturesInner(deferredRowMeta);
          this.imports.add('_wrapArray');
          inner.push(
            `const ${wrapped} = _wrapArray(${this.qrlExpression(source)}${operation.source.keepSource === true ? ', true' : ''});`,
            `if (!Array.isArray(${wrapped})) ${this.names.ctx}.addRoot(${wrapped});`,
            `return renderSsrCollection(${this.names.ctx}, ${idVariable}, ${wrapped}, ${operation.key === null ? 'undefined' : this.qrlExpression(deferredKeyMeta!)}, ${this.qrlExpression(deferredRowMeta)}, ${operation.usesIndexSignal}, ${operation.ssr.idBase === null ? "''" : operation.ssr.idBase}, ${operation.ssr.usesRowId}, ${operation.ssr.rowShape});`
          );
          const invokeCtx = this.invokeCtx();
          this.imports.add('invoke');
          this.imports.add('renderSsrCollection');
          this.statements.push(`let ${idVariable};`);
          this.statements.push(
            `const ${step} = () => invoke(${invokeCtx}, () => { ${inner.join(' ')} });`
          );
          this.asyncSteps.push({ name: step, expr: `${step}()` });
          parts.push(`createSsrRecord('<!f=', createSsrNodeId(${idVariable}), '>')`);
          parts.push(step);
          pushStatic('<!/f>');
          return;
        }
        if (this.asyncSteps.length > 0) {
          const ir = operation.source.ir;
          if (ir === undefined) {
            markUngeneratable(operation.source);
          }
          this.statements.push(`let ${idVariable};`);
          const sourceValue = this.irJs(ir);
          const roots = [sourceValue];
          const addCaptureRoots = (meta: SegmentMeta): void => {
            for (const capture of meta.captures) {
              const name =
                capture.access === 'component-prop'
                  ? this.names.props
                  : this.local(capture.binding);
              if (!roots.includes(name)) {
                roots.push(name);
              }
            }
          };
          const deferredKeyMeta = operation.key === null ? null : this.segment(operation.key);
          const deferredRowMeta = this.segment(row.segment.segment);
          if (deferredKeyMeta !== null) {
            addCaptureRoots(deferredKeyMeta);
          }
          addCaptureRoots(deferredRowMeta);
          const keyQrl =
            deferredKeyMeta === null ? 'undefined' : this.qrlExpression(deferredKeyMeta);
          const renderQrl = this.qrlExpression(deferredRowMeta);
          this.pushStep(
            step,
            roots,
            `renderSsrCollection(${this.names.ctx}, ${idVariable}, ${sourceValue}, ${keyQrl}, ${renderQrl}, ${operation.usesIndexSignal}, ${operation.ssr.idBase === null ? "''" : operation.ssr.idBase}, ${operation.ssr.usesRowId}, ${operation.ssr.rowShape})`,
            `${idVariable} ??= ${this.names.ctx}.nextId(); `
          );
          parts.push(`createSsrRecord('<!f=', createSsrNodeId(${idVariable}), '>')`);
          parts.push(step);
          pushStatic('<!/f>');
          return;
        }
        this.statements.push(`const ${idVariable} = ${this.names.ctx}.nextId();`);
        let collectionValue: string;
        if (operation.source.kind === 'derived') {
          const source = this.segment(operation.source.segment);
          rootCaptures(source);
          if (keyMeta !== null) {
            rootCaptures(keyMeta);
          }
          rootCaptures(rowMeta);
          this.imports.add('_wrapArray');
          this.statements.push(
            `const ${wrapped} = _wrapArray(${this.qrlExpression(source)}${operation.source.keepSource === true ? ', true' : ''});`,
            `if (!Array.isArray(${wrapped})) ${this.names.ctx}.addRoot(${wrapped});`
          );
          collectionValue = wrapped;
        } else {
          // direct-reactive: the source expression roots and streams as-is
          const ir = operation.source.ir;
          if (ir === undefined) {
            markUngeneratable(operation.source);
          }
          collectionValue = this.irJs(ir);
          this.statements.push(`${this.names.ctx}.addRoot(${collectionValue});`);
          if (keyMeta !== null) {
            rootCaptures(keyMeta);
          }
          rootCaptures(rowMeta);
        }
        const keyQrl = keyMeta === null ? 'undefined' : this.qrlExpression(keyMeta);
        const renderQrl = this.qrlExpression(rowMeta);
        this.statements.push(
          `const ${step} = renderSsrCollection(${this.names.ctx}, ${idVariable}, ${collectionValue}, ${keyQrl}, ${renderQrl}, ${operation.usesIndexSignal}, ${operation.ssr.idBase === null ? "''" : operation.ssr.idBase}, ${operation.ssr.usesRowId}, ${operation.ssr.rowShape});`
        );
        this.asyncSteps.push({ name: step, expr: step });
        parts.push(`createSsrRecord('<!f=', createSsrNodeId(${idVariable}), '>')`);
        parts.push(step);
        pushStatic('<!/f>');
        return;
      }
      case SsrOpKind.Suspense: {
        if (operation.inOrder !== null) {
          // in-order suspense renders its content inline, no suspense machinery
          for (const inner of operation.inOrder) {
            this.op(inner, parts, pushStatic, topLevel);
          }
          return;
        }
        if (operation.content.segment === undefined) {
          markUngeneratable();
        }
        const contentQrl = this.qrlExpression(this.segment(operation.content.segment));
        let fallbackQrl = 'undefined';
        if (operation.fallback !== null) {
          // fallback is a renderable QRL: its segment resumes it, ops (if any) serve native
          if (operation.fallback.segment === undefined) {
            markUngeneratable(operation);
          }
          fallbackQrl = this.qrlExpression(this.segment(operation.fallback.segment));
        } else if (operation.fallbackValue !== undefined) {
          // runtime-selected fallback: proven-QRL IR evaluates in place
          const ir = valueIr(operation.fallbackValue);
          if (ir === undefined) {
            markUngeneratable(operation);
          }
          fallbackQrl = this.irJs(ir);
        }
        let delayExpr = '0';
        if (operation.delay !== null) {
          const expression = this.valueExpression(operation.delay);
          if (expression === null) {
            markUngeneratable(operation);
          }
          delayExpr = expression;
        }
        const contentMeta = this.segment(operation.content.segment);
        const contentRoots = contentMeta.captures.map((capture) =>
          capture.access === 'component-prop' ? this.names.props : this.local(capture.binding)
        );
        const idVariable = `suspense_id_${this.nextTemp}`;
        const step = `suspense_${this.nextTemp++}`;
        this.imports.add('createSsrSuspense');
        const deferred = this.asyncSteps.length > 0;
        this.statements.push(
          deferred ? `let ${idVariable};` : `const ${idVariable} = ${this.names.ctx}.nextId();`
        );
        this.pushStep(
          step,
          contentRoots,
          `createSsrSuspense(ctx, ${idVariable}, ${contentQrl}, ${fallbackQrl}, ${delayExpr})`,
          deferred ? `${idVariable} ??= ${this.names.ctx}.nextId(); ` : undefined
        );
        parts.push(step);
        return;
      }
      case SsrOpKind.Slot: {
        if (operation.ssr.idBase !== null) {
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
              `${this.names.ctx}.addRoot(${capture.access === 'component-prop' ? this.names.props : this.local(capture.binding)});`
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
          `renderSsrSlot(${this.names.ctx}, ${JSON.stringify(operation.name)}, ${fallback}, getActiveInvokeContextOrNull())`
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
    operation: Extract<PlanSsrOp, { kind: SsrOpKind.Component }>,
    parts: string[]
  ): void {
    const target = operation.target;
    if (operation.ssr.returnMode !== 'maybe-promise' && operation.ssr.returnMode !== 'sync') {
      markUngeneratable(operation.ssr.returnMode);
    }
    let childName: string;
    if (typeof target === 'string') {
      // lexical local component, else a module/imported component in scope by name
      if (this.localComponents.has(target)) {
        childName = target;
      } else if (this.shared.production && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(target)) {
        childName = target;
      } else {
        markUngeneratable();
      }
    } else {
      const child = this.plan.components[target.ref];
      if (child === undefined) {
        markUngeneratable();
      }
      this.shared.queue.push(target.ref);
      childName = child.name;
    }
    let slotScope: string | null = null;
    const slotPrep: string[] = [];
    if (operation.slots.length > 0) {
      slotScope = `slot_scope_${this.nextTemp++}`;
      this.imports.add('createSlotScope');
      this.imports.add('registerProjection');
      slotPrep.push(
        `const ${slotScope} = createSlotScope();`,
        `${this.names.ctx}.addRoot(${slotScope});`
      );
      for (const slot of operation.slots) {
        if (slot.render.segment === undefined) {
          markUngeneratable();
        }
        const meta = this.segment(slot.render.segment);
        for (const capture of meta.captures) {
          slotPrep.push(
            `${this.names.ctx}.addRoot(${capture.access === 'component-prop' ? this.names.props : this.local(capture.binding)});`
          );
        }
        slotPrep.push(
          `registerProjection(${slotScope}, ${JSON.stringify(slot.name)}, ${this.qrlExpression(meta)}${slot.idBase === null ? '' : `, undefined, ${slot.idBase}`});`
        );
      }
    }
    // mergeProps segments: literal runs grouped between spreads, in source order
    const runSegments: string[] = [];
    let literalEntries: string[] | null = null;
    const sourceEntries: string[] = [];
    const sourceLocals: string[] = [];
    const prepStatements: string[] = [];
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
      if (prop.kind === 'static') {
        const item = prop as { name: string; value: unknown };
        literalRun().push(`${JSON.stringify(item.name)}: ${JSON.stringify(item.value)}`);
      } else if (prop.kind === 'dynamic') {
        const item = prop as { name: string; value: { segment?: string; ir?: ValueIR } };
        const segmentId = valueSegment(item.value);
        const ir = valueIr(item.value);
        // composite reactive expressions need the QRL so resume rebuilds the subscription
        const reactiveComposite =
          ir !== undefined && ir.kind !== 'signal-read' && irReadsSignal(ir);
        if (
          segmentId !== undefined &&
          (ir === undefined || ir.kind === 'call' || reactiveComposite)
        ) {
          const meta = this.segment(segmentId);
          if (meta.kind === 'qrl') {
            // the prop value IS the QRL — pass it through, rooting its captures
            for (const capture of meta.captures) {
              const captured =
                capture.access === 'component-prop'
                  ? this.names.props
                  : this.local(capture.binding);
              prepStatements.push(`${this.names.ctx}.addRoot(${captured});`);
            }
            literalRun().push(
              `get ${JSON.stringify(item.name)}() { return ${this.qrlExpression(meta)}; }`
            );
            continue;
          }
          // derived prop: the QRL rides the sources map so resume rebuilds the getter
          const qrlName = `prop_qrl_${this.nextTemp++}`;
          for (const capture of meta.captures) {
            const captured =
              capture.access === 'component-prop' ? this.names.props : this.local(capture.binding);
            prepStatements.push(`${this.names.ctx}.addRoot(${captured});`);
          }
          prepStatements.push(`const ${qrlName} = ${this.qrlExpression(meta)};`);
          this.imports.add('readExpression');
          literalRun().push(
            `get ${JSON.stringify(item.name)}() { return readExpression(${qrlName}); }`
          );
          sourceEntries.push(`${JSON.stringify(item.name)}: ${qrlName}`);
          continue;
        }
        if (ir === undefined) {
          markUngeneratable();
        }
        if (ir.kind !== 'signal-read' && ir.kind !== 'binding-read') {
          if (reactiveComposite) {
            markUngeneratable(); // reactive expression without a backing segment
          }
          // segment-backed args root their captures before the component call (walker parity)
          for (const segmentId of collectSegmentArgIds(ir)) {
            for (const capture of this.segment(segmentId).captures) {
              const captured =
                capture.access === 'component-prop'
                  ? this.names.props
                  : this.local(capture.binding);
              prepStatements.push(`${this.names.ctx}.addRoot(${captured});`);
            }
          }
          // non-reactive expressions read through a plain getter
          literalRun().push(`get ${JSON.stringify(item.name)}() { return ${this.irJs(ir)}; }`);
          continue;
        }
        const binding = (ir as { binding: number }).binding;
        const value = this.local(binding);
        // binding-read passes the local raw — a signal prop keeps its identity
        // signal-read is proof by construction — chunk captures have no sourceKinds entry
        if (ir.kind === 'signal-read') {
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
      } else if (prop.kind === 'event') {
        const event = prop as {
          name: string;
          handlers: readonly { value?: unknown }[];
        };
        // event props pass the handler QRL — or an array of them — as a plain prop value
        const qrls = event.handlers.map((handler) => {
          const segmentId = handler.value === undefined ? undefined : valueSegment(handler.value);
          if (segmentId !== undefined) {
            return this.qrlExpression(this.segment(segmentId));
          }
          // consumer-provided handlers arrive as a plain value (props.onClick$)
          const ir = handler.value === undefined ? undefined : valueIr(handler.value);
          if (ir === undefined) {
            markUngeneratable(prop);
          }
          return this.irJs(ir);
        });
        if (qrls.length === 0) {
          markUngeneratable(prop);
        }
        literalRun().push(
          `${JSON.stringify(event.name)}: ${qrls.length === 1 ? qrls[0] : `[${qrls.join(', ')}]`}`
        );
      } else if (prop.kind === 'spread') {
        const item = prop as { value: { ir?: ValueIR } };
        const ir = valueIr(item.value);
        if (ir === undefined) {
          markUngeneratable();
        }
        closeRun();
        runSegments.push(
          ir.kind === 'binding-read' ? this.local(ir.binding) : `(${this.irJs(ir)})`
        );
      } else {
        markUngeneratable();
      }
    }
    closeRun();
    let propsExpr: string;
    if (operation.propsSource !== null) {
      // whole-object computed props resume through their QRL-backed proxy
      const meta = this.segment(operation.propsSource);
      for (const capture of meta.captures) {
        const captured =
          capture.access === 'component-prop' ? this.names.props : this.local(capture.binding);
        prepStatements.push(`${this.names.ctx}.addRoot(${captured});`);
      }
      this.imports.add('createPropsProxy');
      this.imports.add('useComputedQrl');
      propsExpr = `createPropsProxy(useComputedQrl(${this.qrlExpression(meta)}))`;
    } else if (runSegments.length === 0) {
      propsExpr = '{}';
    } else if (runSegments.length === 1) {
      propsExpr = runSegments[0];
    } else {
      this.imports.add('mergeProps');
      propsExpr = `mergeProps(${runSegments.join(', ')})`;
    }
    if (operation.propsSource === null && sourceEntries.length > 0) {
      this.imports.add('_props');
      propsExpr = `_props(${propsExpr}, { ${sourceEntries.join(', ')} })`;
    }
    this.imports.add('createComponent');
    const options = slotScope === null ? '' : `, { slotScope: ${slotScope} }`;
    const childContext = operation.ssr.blockingSuspense
      ? `${this.names.ctx}.inOrder()`
      : this.names.ctx;
    const childArgs = `props, ${childContext}${operation.ssr.idBase === null ? '' : `, ${operation.ssr.idBase}`}`;
    const call = `createComponent(${propsExpr}, (props) => ${childName}(${childArgs})${options})`;
    prepStatements.unshift(...slotPrep);
    if (operation.ssr.returnMode === 'sync' && this.synchronous) {
      // sync child in a sync block renders inline, matching the legacy direct path
      this.statements.push(...prepStatements);
      for (const local of sourceLocals) {
        this.statements.push(`${this.names.ctx}.addRoot(${local});`);
      }
      parts.push(call);
      return;
    }
    const step = `component_${this.nextTemp++}`;
    if (this.asyncSteps.length === 0 || this.synchronous) {
      this.statements.push(...prepStatements);
      this.pushStep(step, sourceLocals, call);
    } else {
      this.pushStep(step, sourceLocals, call, prepStatements.join(' '));
    }
    parts.push(step);
  }

  /** Direct-array collections expand their row inline: a local fn, no QRL, no fences. */
  private inlineCollection(
    operation: Extract<PlanSsrOp, { kind: SsrOpKind.Collection }>,
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
      this.names,
      {
        locals: this.locals,
        usedNames: this.usedNames,
        localComponents: this.localComponents,
        sourceKinds: this.sourceKinds,
      }
    );
    const params = (row.paramBindings ?? []).slice(0, row.params);
    const paramNames = params.map((binding, index) => child.declare(binding, `row_p${index}`));
    // rows that derive ids take the runtime-provided index and id base as trailing params
    const idBaseParams = operation.ssr.idBase === null ? '' : ', __qwikIndex, _id';
    this.statements.push(
      child.generateFn(
        row.symbolName,
        { setup: row.setup, ops: row.ops },
        null,
        false,
        false,
        `(${this.names.ctx}, __rangeId, __rowId${paramNames.map((name) => `, ${name}`).join('')}${idBaseParams})`
      )
    );
    const step = `collection_result_${this.nextTemp++}`;
    this.imports.add('renderSsrCollection');
    this.pushStep(
      step,
      [],
      `renderSsrCollection(${this.names.ctx}, undefined, ${this.irJs(sourceIr)}, undefined, ${row.symbolName}, ${operation.usesIndexSignal}, ${operation.ssr.idBase ?? "''"}, ${operation.ssr.usesRowId}, ${operation.ssr.rowShape})`
    );
    parts.push(step);
  }

  /** Content effect: the segment fn renders inside `<!d=N>` fences, re-runnable on resume. */
  private content(
    operation: Extract<PlanSsrOp, { kind: SsrOpKind.Content }>,
    parts: string[],
    pushStatic: (text: string) => void
  ): void {
    const contentSegment = valueSegment(operation.value);
    if (contentSegment === undefined) {
      markUngeneratable(operation);
    }
    const meta = this.segment(contentSegment);
    const captures = meta.captures.map((capture) =>
      capture.access === 'component-prop' ? this.names.props : this.local(capture.binding)
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
      this.statements.push(`const ${idVariable} = ${this.names.ctx}.nextId();`);
    }
    this.pushStep(
      step,
      captures,
      `renderSsrContent(${this.names.ctx}, ${idVariable}, [${captures.join(', ')}], ${this.qrlExpression(meta, false)}${operation.ssr.root ? ', true' : ''})`,
      deferred ? `${idVariable} ??= ${this.names.ctx}.nextId(); ` : undefined
    );
    parts.push(`createSsrRecord('<!d=', createSsrNodeId(${idVariable}), '>')`);
    parts.push(`escapeSsrContent(${step})`);
    pushStatic('<!/d>');
  }

  /** Fully static, id-less, effect-free subtrees are the only fold candidates. */
  private isFoldableStatic(operation: PlanSsrOp): boolean {
    if (operation.kind === SsrOpKind.Static) {
      return true;
    }
    if (operation.kind !== SsrOpKind.Element) {
      return false;
    }
    if (
      operation.ssr.id !== null ||
      operation.propsEffect !== null ||
      operation.styleScopedId !== null ||
      operation.ssr.runtimeScope === true
    ) {
      return false;
    }
    for (const prop of operation.props) {
      if (prop.kind !== 'static' && prop.kind !== 'inner-html') {
        return false;
      }
    }
    return operation.children.every((child) => this.isFoldableStatic(child));
  }

  private element(
    operation: Extract<PlanSsrOp, { kind: SsrOpKind.Element }>,
    parts: string[],
    pushStatic: (text: string) => void,
    topLevel = false
  ): void {
    let innerHtml: string | null = null;
    let innerHtmlExpr: string | null = null;
    const idVariable = operation.ssr.id === null ? null : `id_${operation.ssr.id}`;
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
    // the first element after a useOn registration anchors the pending attr injection
    const anchorsPendingAttrs = this.pendingAttrAnchor;
    this.pendingAttrAnchor = false;
    const isRootElement = !this.didEmitRoot && !this.staticRoot;
    const isStaticRoot = !this.didEmitRoot && this.staticRoot;
    this.didEmitRoot = true;
    // legacy part boundaries are chunk boundaries in streaming: only child subtrees fold,
    // unless the wire proves the whole render static
    const foldable =
      (this.staticRoot || !topLevel) && !anchorsPendingAttrs && this.isFoldableStatic(operation);
    pushOpen(`<${operation.tag}`);
    if (idVariable !== null) {
      this.imports.add('createSsrNodeId');
      pushOpen(` q:id="`);
      open.push(`createSsrNodeId(${idVariable})`);
      pushOpen(`"`);
    }
    const scope: JsStyleScope = {
      staticId: operation.styleScopedId,
      runtimeName: operation.ssr.runtimeScope === true ? this.runtimeScopeName : null,
    };
    if (operation.propsEffect !== null) {
      // whole-element props effect: attrs, ref, and innerHTML ride one renderSsrProps step
      if (idVariable === null) {
        markUngeneratable(operation);
      }
      const meta = this.segment(operation.propsEffect);
      const captures = meta.captures.map((capture) =>
        capture.access === 'component-prop' ? this.names.props : this.local(capture.binding)
      );
      const step = `props_${this.nextTemp++}`;
      const scopeArgs =
        scope.staticId === null && scope.runtimeName === null
          ? ''
          : `, undefined, ${scopeClassExpression(scope, null)}`;
      this.imports.add('renderSsrProps');
      this.imports.add('createSsrElementTarget');
      this.pushStep(
        step,
        captures,
        `renderSsrProps(createSsrElementTarget(${idVariable}), [${captures.join(', ')}], ${this.qrlExpression(meta, false)}, ${this.names.ctx}.eventAttr${scopeArgs})`,
        this.claimId(idVariable),
        operation.propsEffectRef === true
          ? `${step}.ref !== undefined && ${this.names.ctx}.setRef(${step}.ref, ${idVariable});`
          : undefined
      );
      open.push(`...${step}.attrs`);
      innerHtmlExpr = `${step}.innerHTML`;
    } else {
      const hasClassProp = operation.props.some(
        (prop) => prop.kind === 'spread' || (prop as { name?: string }).name === 'class'
      );
      if ((scope.staticId !== null || scope.runtimeName !== null) && !hasClassProp) {
        this.pushScopeOnlyClass(scope, pushOpen, open);
      }
    }
    for (const prop of operation.propsEffect === null ? operation.props : []) {
      const handled = this.prop(
        prop,
        pushOpen,
        open,
        (html) => (innerHtml = html),
        idVariable,
        operation.props,
        scope,
        (expr) => (innerHtmlExpr = expr)
      );
      if (!handled) {
        markUngeneratable(prop);
      }
    }
    if (isRootElement && this.rootAttribute !== null) {
      // row roots carry their marker attribute after every attr part, before the bracket
      open.push(JSON.stringify(this.rootAttribute));
    } else if (isStaticRoot && this.rootAttribute !== null) {
      // fully static rows keep the marker inside the folded open tag
      pushOpen(this.rootAttribute);
    }
    if (isRootElement || anchorsPendingAttrs) {
      // injectable element records keep the closing bracket as its own part
      open.push(JSON.stringify('>'));
    } else {
      pushOpen('>');
    }
    if (foldable && open.length === 1 && isStringLiteral(open[0])) {
      // fully static element folds into the surrounding run
      pushStatic(JSON.parse(open[0]) as string);
    } else if (isRootElement || anchorsPendingAttrs) {
      this.imports.add('createSsrElementRecord');
      parts.push(`createSsrElementRecord(${JSON.stringify(operation.tag)}, ${open.join(', ')})`);
    } else if (open.length === 1 && isStringLiteral(open[0])) {
      // non-root static open tags fold like any literal run
      pushStatic(JSON.parse(open[0]) as string);
    } else {
      this.imports.add('createSsrRecord');
      parts.push(`createSsrRecord(${open.join(', ')})`);
    }
    if (innerHtmlExpr !== null) {
      // spread innerHTML falls back to the static children when absent
      const childParts: string[] = [];
      const pushChildStatic = (text: string): void => {
        const last = childParts[childParts.length - 1];
        if (last !== undefined && isStringLiteral(last)) {
          childParts[childParts.length - 1] = JSON.stringify(JSON.parse(last) + text);
        } else {
          childParts.push(JSON.stringify(text));
        }
      };
      for (const child of operation.children) {
        this.op(child, childParts, pushChildStatic);
      }
      const fallback =
        childParts.length === 0
          ? "''"
          : childParts.length === 1
            ? childParts[0]
            : `[${childParts.join(', ')}]`;
      parts.push(`${innerHtmlExpr} ?? ${fallback}`);
    } else if (innerHtml !== null) {
      pushStatic(innerHtml);
    } else {
      for (const child of operation.children) {
        this.op(child, parts, pushStatic);
      }
    }
    if (!operation.voidTag) {
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
    elementProps: readonly PlanSsrProp[],
    scope: JsStyleScope = { staticId: null, runtimeName: null },
    setInnerHtmlExpr?: (expr: string) => void
  ): boolean {
    switch (prop.kind) {
      case 'spread': {
        const item = prop as { value: { segment?: string; ir?: ValueIR } };
        if (idVariable === null || setInnerHtmlExpr === undefined) {
          return false;
        }
        const segmentId = valueSegment(item.value);
        const step = `props_${this.nextTemp++}`;
        const scopeArgs =
          scope.staticId === null && scope.runtimeName === null
            ? ''
            : `, undefined, ${scopeClassExpression(scope, null)}`;
        const after = `${step}.ref !== undefined && ${this.names.ctx}.setRef(${step}.ref, ${idVariable});`;
        if (segmentId !== undefined) {
          const meta = this.segment(segmentId);
          const captures = meta.captures.map((capture) =>
            capture.access === 'component-prop' ? this.names.props : this.local(capture.binding)
          );
          this.imports.add('renderSsrProps');
          this.imports.add('createSsrElementTarget');
          this.pushStep(
            step,
            captures,
            `renderSsrProps(createSsrElementTarget(${idVariable}), [${captures.join(', ')}], ${this.qrlExpression(meta, false)}, ${this.names.ctx}.eventAttr${scopeArgs})`,
            this.claimId(idVariable),
            after
          );
        } else {
          const ir = valueIr(item.value);
          if (ir === undefined) {
            return false;
          }
          this.imports.add('renderDomPropsToString');
          const scopeValue =
            scope.staticId === null && scope.runtimeName === null
              ? 'undefined'
              : scopeClassExpression(scope, null);
          this.pushStep(
            step,
            [],
            `renderDomPropsToString(${this.irJs(ir)}, ${this.names.ctx}.eventAttr, ${scopeValue})`,
            this.claimId(idVariable),
            after
          );
        }
        open.push(`...${step}.attrs`);
        setInnerHtmlExpr(`${step}.innerHTML`);
        return true;
      }
      case 'ref': {
        const refValue = this.valueExpression((prop as { value: unknown }).value);
        if (idVariable === null || refValue === null) {
          return false;
        }
        const expression = `${this.names.ctx}.setRef(${refValue}, ${idVariable})`;
        if (this.asyncSteps.length === 0) {
          this.statements.push(`${this.claimId(idVariable)}${expression};`);
          return true;
        }
        const step = `ref_${this.nextTemp++}`;
        this.pushStep(step, [], `(${expression}, '')`, this.claimId(idVariable));
        open.push(step);
        return true;
      }
      case 'static': {
        const item = prop as { name: string; value: unknown };
        const stringifiesBooleans =
          item.name.startsWith('aria-') ||
          ['spellcheck', 'draggable', 'contenteditable'].includes(item.name);
        if (typeof item.value === 'boolean' && stringifiesBooleans) {
          pushOpen(` ${item.name}="${item.value}"`);
          return true;
        }
        if (item.name === 'class' && scope.runtimeName !== null) {
          const serialized = item.value === false || item.value == null ? null : String(item.value);
          if (serialized === null && scope.staticId === null) {
            this.pushScopeOnlyClass(scope, pushOpen, open);
            return true;
          }
          this.imports.add('escapeHTML');
          pushOpen(' class="');
          open.push(`escapeHTML(${scopeClassExpression(scope, serialized)})`);
          pushOpen('"');
          return true;
        }
        if (item.value === false || item.value == null) {
          return true;
        }
        const merged =
          item.name === 'class' && scope.staticId !== null
            ? `${scope.staticId} ${String(item.value)}`
            : item.value;
        pushOpen(
          merged === true ? ` ${item.name}` : ` ${item.name}="${escapeAttr(String(merged))}"`
        );
        return true;
      }
      case 'inner-html': {
        const html = (prop as { html: string | number | boolean | null }).html;
        setInnerHtml(html == null ? '' : String(html));
        return true;
      }
      case 'dynamic': {
        const item = prop as { name: string; value: unknown };
        const segmentId = valueSegment(item.value);
        const propIr = valueIr(item.value);
        // proven stable string: a bare read of a use-id local — derived, not a wire flag
        const isProvenString =
          propIr !== undefined &&
          propIr.kind === 'binding-read' &&
          this.useIdBindings.has((propIr as { binding: number }).binding);
        if (isProvenString) {
          const ir = propIr;
          if (ir === undefined) {
            return false;
          }
          if (idVariable !== null) {
            // targeted elements serialize through a plain value step, null-guarded
            const step = `attr_${this.nextTemp++}`;
            this.imports.add('escapeHTML');
            this.pushStep(step, [], this.irJs(ir), this.claimId(idVariable));
            open.push(
              `(${step} === null ? '' : ${JSON.stringify(` ${item.name}`)} + (${step} === '' ? '' : '="' + escapeHTML(${step}) + '"'))`
            );
            return true;
          }
          this.imports.add('escapeHTML');
          pushOpen(` ${item.name}="`);
          open.push(`escapeHTML(${this.irJs(ir)})`);
          pushOpen('"');
          return true;
        }
        if (idVariable === null) {
          const ir = valueIr(item.value);
          if (ir === undefined || segmentId !== undefined) {
            return false;
          }
          // initial-only plain values normalize through the DOM-props renderer
          this.imports.add('renderDomPropsToString');
          const scopeArg = attrScopeArgs(scope);
          open.push(
            `...renderDomPropsToString({ ${JSON.stringify(item.name)}: ${this.irJs(ir)} }${scopeArg}).attrs`
          );
          return true;
        }
        if (segmentId === undefined) {
          // signal attr: segment-less signal/binding read subscribes the attribute directly
          const ir = valueIr(item.value);
          if (ir === undefined || (ir.kind !== 'signal-read' && ir.kind !== 'binding-read')) {
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
            `renderSsrAttr(createSsrElementTarget(${idVariable}), ${JSON.stringify(item.name)}, ${signal}${attrScopeArgs(scope)})`,
            this.claimId(idVariable)
          );
          open.push(
            `(${step} === null ? '' : ${JSON.stringify(` ${item.name}`)} + (${step} === '' ? '' : '="' + escapeHTML(${step}) + '"'))`
          );
          return true;
        }
        const meta = this.segment(segmentId);
        const captures = meta.captures.map((capture) =>
          capture.access === 'component-prop' ? this.names.props : this.local(capture.binding)
        );
        const step = `attr_${this.nextTemp++}`;
        this.imports.add('createSsrElementTarget');
        this.imports.add('renderSsrAttrExpression');
        this.imports.add('escapeHTML');
        this.pushStep(
          step,
          captures,
          `renderSsrAttrExpression(createSsrElementTarget(${idVariable}), ${JSON.stringify(item.name)}, [${captures.join(', ')}], ${this.qrlExpression(meta, false)}${attrScopeArgs(scope)})`,
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
          handlers: readonly (
            | { value?: { segment?: string; ir?: ValueIR } }
            | { bind: string; checked?: true }
          )[];
        };
        const handlerValue = (handler: (typeof event.handlers)[number]): string | null => {
          if ('bind' in handler) {
            // bind rides the built-in _val/_chk handler capturing the bound signal
            const symbol = handler.checked === true ? '_chk' : '_val';
            this.imports.add('inlinedQrl');
            this.imports.add(symbol);
            return `inlinedQrl(${symbol}, ${JSON.stringify(symbol)}, [${handler.bind}])`;
          }
          const segmentId = handler.value === undefined ? undefined : valueSegment(handler.value);
          if (segmentId !== undefined) {
            const meta = this.segment(segmentId);
            return meta.kind === 'expression' ? null : this.qrlExpression(meta);
          }
          const ir = handler.value === undefined ? undefined : valueIr(handler.value);
          return ir === undefined ? null : this.irJs(ir);
        };
        const dynamicIndex = event.handlers.findIndex(
          (handler) =>
            !('bind' in handler) &&
            (handler.value === undefined ? undefined : valueSegment(handler.value)) !== undefined &&
            this.segment(valueSegment(handler.value)!).kind === 'expression'
        );
        if (dynamicIndex !== -1) {
          // non-function handler (props.onClick$): evaluate via renderSsrEvent
          if (idVariable === null) {
            return false;
          }
          const dynamic = event.handlers[dynamicIndex] as { value: unknown };
          const meta = this.segment(valueSegment(dynamic.value)!);
          const captures = meta.captures.map((capture) =>
            capture.access === 'component-prop' ? this.names.props : this.local(capture.binding)
          );
          const before = event.handlers.slice(0, dynamicIndex).map(handlerValue);
          const afterHandlers = event.handlers.slice(dynamicIndex + 1).map(handlerValue);
          if (
            before.some((value) => value === null) ||
            afterHandlers.some((value) => value === null)
          ) {
            return false;
          }
          const step = `event_${this.nextTemp++}`;
          this.imports.add('renderSsrEvent');
          this.imports.add('createSsrElementTarget');
          this.pushStep(
            step,
            captures,
            `renderSsrEvent(createSsrElementTarget(${idVariable}), ${JSON.stringify(event.name)}, [${captures.join(', ')}], ${this.qrlExpression(meta, false)}, ${this.names.ctx}.eventAttr, [${before.join(', ')}], [${afterHandlers.join(', ')}])`,
            this.claimId(idVariable)
          );
          open.push(`(${step} ?? '')`);
          return true;
        }
        const values: string[] = [];
        for (const handler of event.handlers) {
          const value = handlerValue(handler);
          if (value === null) {
            return false;
          }
          values.push(value);
        }
        const value = values.length === 1 ? values[0] : `[${values.join(', ')}]`;
        open.push(`${this.names.ctx}.eventAttr(${JSON.stringify(event.name)}, ${value})`);
        return true;
      }
      default:
        return false;
    }
  }

  private dynamicText(
    operation: Extract<PlanSsrOp, { kind: SsrOpKind.Dynamic }>,
    parts: string[],
    pushStatic: (text: string) => void
  ): void {
    const target = operation.ssr.target;
    if (target === null) {
      this.targetlessDynamic(operation, parts);
      return;
    }
    if (operation.output !== 'text') {
      markUngeneratable(operation);
    }
    if (target.kind === 'range' && target.id === null && this.rootRangeName === null) {
      markUngeneratable();
    }
    // a null range id anchors on the block's own surrounding range
    const targetIdName =
      target.kind === 'range' && target.id === null ? this.rootRangeName! : `id_${target.id}`;
    const targetExpr =
      target.kind === 'element'
        ? `createSsrElementTextTarget(${targetIdName})`
        : `createSsrRangeTextTarget(${targetIdName}, ${target.marker})`;
    this.imports.add(
      target.kind === 'element' ? 'createSsrElementTextTarget' : 'createSsrRangeTextTarget'
    );
    this.imports.add('escapeHTML');
    const step = `text_${this.nextTemp++}`;
    const ir = valueIr(operation.value);
    const segmentId = valueSegment(operation.value);
    const idPrelude = target.id === null ? '' : this.claimId(`id_${target.id}`);
    if (segmentId !== undefined) {
      // expression text: the segment fn evaluates with captures under the invoke context
      const meta = this.segment(segmentId);
      const captures = meta.captures.map((capture) =>
        capture.access === 'component-prop' ? this.names.props : this.local(capture.binding)
      );
      this.imports.add('renderSsrTextExpression');
      this.pushStep(
        step,
        captures,
        `renderSsrTextExpression(${targetExpr}, [${captures.join(', ')}], ${this.qrlExpression(meta, false)})`,
        idPrelude
      );
    } else if (ir !== undefined && ir.kind === 'signal-read') {
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

  /** Target-less dynamic values render inline: plain text escapes, content flows as parts. */
  private targetlessDynamic(
    operation: Extract<PlanSsrOp, { kind: SsrOpKind.Dynamic }>,
    parts: string[]
  ): void {
    const ir = valueIr(operation.value);
    if (operation.output === 'text') {
      if (ir === undefined) {
        markUngeneratable(operation);
      }
      this.imports.add('escapeHTML');
      parts.push(`escapeHTML(String((${this.irJs(ir)}) ?? ''))`);
      return;
    }
    if (operation.ssr.synchronous) {
      const expression = this.valueExpression(operation.value);
      if (expression === null) {
        markUngeneratable(operation);
      }
      parts.push(`(${expression})`);
      return;
    }
    // deferred content: the render segment fn is called directly with its captures
    const segmentId = valueSegment(operation.value);
    if (segmentId === undefined) {
      const expression = this.valueExpression(operation.value);
      if (expression === null) {
        markUngeneratable(operation);
      }
      // no segment: the expression evaluates as its own step
      const step = `content_${this.nextTemp++}`;
      this.pushStep(step, [], expression);
      parts.push(step);
      return;
    }
    const meta = this.segment(segmentId);
    const captures = meta.captures.map((capture) =>
      capture.access === 'component-prop' ? this.names.props : this.local(capture.binding)
    );
    const step = `content_${this.nextTemp++}`;
    this.pushStep(
      step,
      meta.initialOnly === true ? [] : captures,
      `${meta.symbolName}(${captures.join(', ')})`
    );
    parts.push(step);
  }

  private qrlExpression(meta: SegmentMeta, withCaptures = true): string {
    if (meta.qrl?.kind === 'sync') {
      // sync QRLs are inlined source, never chunks — the runtime holds the function itself
      if (meta.syncSource === undefined) {
        markUngeneratable(meta.id);
      }
      this.imports.add('_qrlSync');
      this.syncFns.set(meta.symbolName, meta.syncSource);
      return `_qrlSync(${meta.syncSource}, ${JSON.stringify(meta.symbolName)})`;
    }
    const qrl = `q_${meta.symbolName}`;
    if (!this.shared.production && !this.hoistedSegments.has(meta.id)) {
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
      capture.access === 'component-prop' ? this.names.props : this.local(capture.binding)
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
    const moduleName = this.moduleBindingName?.(binding);
    if (moduleName != null) {
      return moduleName;
    }
    // locals declared inside verbatim js statements exist under their source names
    const sourceName = this.sourceBindingName?.(binding);
    if (sourceName != null && !this.usedNames.has(sourceName)) {
      this.usedNames.add(sourceName);
      this.locals.set(binding, sourceName);
      return sourceName;
    }
    markUngeneratable();
  }

  private contextVar(binding: number): string {
    const context = this.contexts.find((candidate) => candidate.binding === binding);
    if (context === undefined || context.declaredName === undefined) {
      // imported or aliased contexts keep their module-scope name in production
      const moduleName = this.moduleBindingName?.(binding);
      if (moduleName != null) {
        return moduleName;
      }
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
    switch (ir.kind) {
      case 'lit':
        return JSON.stringify(ir.value);
      case 'undef':
        return 'undefined';
      case 'binding-read': {
        // lambda scope wins; local() covers locals, contexts, and module-scope bindings
        return scope?.get(ir.binding) ?? this.local(ir.binding);
      }
      // proven signal binding: the current value reads as `<local>.value`
      case 'signal-read':
        return `${scope?.get(ir.binding) ?? this.local(ir.binding)}.value`;
      case 'bin':
      case 'logic':
        return `(${this.irJs(ir.left, scope)} ${ir.op} ${this.irJs(ir.right, scope)})`;
      case 'cond':
        return `(${this.irJs(ir.test, scope)} ? ${this.irJs(ir.then, scope)} : ${this.irJs(ir.else, scope)})`;
      case 'unary': {
        const operand = this.irJs(ir.operand, scope);
        return ir.op === 'typeof' ? `(typeof ${operand})` : `(${ir.op}${operand})`;
      }
      case 'index':
        return `${this.irJs(ir.obj, scope)}${ir.optional === true ? '?.' : ''}[${this.irJs(ir.key, scope)}]`;
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
        const args = ir.args.map((argument) => this.pluginArgJs(argument, scope));
        const method = ir.fn.slice(ir.fn.lastIndexOf('.') + 1);
        if (ir.receiver !== null) {
          return `${this.irJs(ir.receiver, scope)}.${method}(${args.join(', ')})`;
        }
        const namespace = ir.fn.slice(ir.fn.indexOf(':') + 1, ir.fn.lastIndexOf('.'));
        const globals: Record<string, string> = {
          promise: 'Promise',
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
      case 'member': {
        const item = ir as unknown as { obj: ValueIR; name: string };
        const objExpr = this.irJs(item.obj, scope);
        return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(item.name)
          ? `${objExpr}.${item.name}`
          : `${objExpr}[${JSON.stringify(item.name)}]`;
      }
      case 'plugin-call': {
        // the source import IS the JS implementation, claimed or not — import it and call it
        const match = /^plugin:(.*):([^:]+)$/.exec(ir.fnId);
        if (match === null) {
          markUngeneratable(ir.fnId);
        }
        const [, , exportName] = match;
        // the identity is canonical; the import has to stay relative to this module
        const module = ir.source;
        const args = ir.args.map((argument) => this.pluginArgJs(argument, scope));
        if (this.shared.production) {
          // production modules keep the user's own import — reference it by local name
          const localName = this.importLocalName?.(module, exportName);
          if (localName == null) {
            markUngeneratable(ir.fnId);
          }
          return `${localName}(${args.join(', ')})`;
        }
        const importLine = `import { ${exportName} } from ${JSON.stringify(module)};`;
        if (!this.chunkImports.includes(importLine)) {
          this.chunkImports.push(importLine);
        }
        return `${exportName}(${args.join(', ')})`;
      }
      default:
        markUngeneratable(ir);
    }
  }
}

function isStringLiteral(expression: string): boolean {
  return expression.startsWith('"');
}

function templateLiteral(text: string): string {
  return `\`${text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')}\``;
}

interface JsStyleScope {
  readonly staticId: string | null;
  readonly runtimeName: string | null;
}

/** Segment ids of qrl-arg/fn-arg records anywhere in this IR, in traversal order. */
function collectSegmentArgIds(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) {
    node.forEach((item) => collectSegmentArgIds(item, found));
  } else if (typeof node === 'object' && node !== null) {
    const record = node as { kind?: string; segment?: string };
    if ((record.kind === 'qrl-arg' || record.kind === 'fn-arg') && record.segment !== undefined) {
      found.push(record.segment);
    }
    Object.values(record).forEach((value) => collectSegmentArgIds(value, found));
  }
  return found;
}

/** Deep check: does this IR read any signal source? Reactive values need tracked emission. */
function irReadsSignal(node: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some(irReadsSignal);
  }
  if (typeof node !== 'object' || node === null) {
    return false;
  }
  const record = node as Record<string, unknown>;
  return record.kind === 'signal-read' || Object.values(record).some(irReadsSignal);
}

/** Trailing `, undefined, <scope>` args for attr render calls; empty when unscoped. */
function attrScopeArgs(scope: JsStyleScope): string {
  return scope.staticId === null && scope.runtimeName === null
    ? ''
    : `, undefined, ${scopeClassExpression(scope, null)}`;
}

/** Mirrors legacy scopeExpression: merges static scope id, runtime scope, and class value. */
function scopeClassExpression(scope: JsStyleScope, className: string | null): string {
  const staticId = scope.staticId;
  const fallback = [staticId, className]
    .filter((value) => value !== null && value !== '')
    .join(' ');
  const runtime = scope.runtimeName;
  if (runtime === null) {
    return JSON.stringify(fallback);
  }
  if (staticId === null && (className === null || className === '')) {
    return `(${runtime} ?? '')`;
  }
  return `${runtime} ? ${
    staticId === null ? '' : `${JSON.stringify(`${staticId} `)} + `
  }${runtime}${className === null || className === '' ? '' : ` + ${JSON.stringify(` ${className}`)}`} : ${JSON.stringify(fallback)}`;
}
