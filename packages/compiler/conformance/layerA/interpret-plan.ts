import {
  createComponent,
  createContextId,
  useContext,
  useContextProvider,
  createSsrRootRef,
  createSlotScope,
  createSsrSuspense,
  createSsrElementRecord,
  createSsrElementTarget,
  createSsrElementTextTarget,
  createSsrNodeId,
  createSsrRangeTextTarget,
  createSsrRecord,
  escapeHTML,
  getActiveInvokeContextOrNull,
  invoke,
  maybeThen,
  renderSsrAttr,
  renderSsrAttrExpression,
  renderSsrEvent,
  renderSsrBranch,
  renderSsrCollection,
  renderSsrContent,
  renderSsrDynamicTag,
  renderSsrDynamicContent,
  renderSsrTextExpression,
  renderSsrSlot,
  renderSsrTextNode,
  readTrackedSourceValue,
  registerProjection,
  useComputedQrl,
  useSignal,
  useStore,
  useTaskQrl,
  useStyles,
  useOn,
  createVisibleTaskHandlerQrl,
  inlinedQrl,
  _markComponent,
  mergeProps,
  _chk,
  _props,
  _withCaptures,
  _wrapArray,
  _noopQrl,
  _val,
} from '@qwik.dev/core';
import type { PlanSsrOp, PlanSsrProp, PlanSsrRenderFn, PlanSsrRow } from '../../src/emit-plan-ssr';
import type { PlanRenderFnEntry } from '../../src/emit-plan';
import type { QwikSsrPlan } from '../../src/link-plan';
import type { ValueIR } from '../../src/expr-ir';
import type { SetupOp } from '../../src/setup-ir';
import type { SsrRenderRoot } from '../../../qwik/src/server/ssr-render';

/**
 * Reference plan interpreter (spec 08, Phase 4 seed): renders directly from a linked plan against
 * the same runtime ABI the emitted modules call, mirroring their shapes exactly — invoke context
 * captured before the task flush, lazy id allocation inside a maybeThen-sequenced part chain,
 * addRoot before each dynamic use, `.w(captures)` arrays, `.s()` for direct segments. Testing tool
 * only; unsupported constructs throw so gaps stay loud.
 */

type WireValue =
  | { readonly kind: 'ir'; readonly ir: ValueIR; readonly segment?: string }
  | { readonly kind: 'segment'; readonly segment: string }
  | { readonly kind: 'js'; readonly src: string; readonly pure?: true };

function valueIr(value: unknown): ValueIR | undefined {
  const wire = value as WireValue;
  return wire.kind === 'ir' ? wire.ir : undefined;
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

/** Deep check mirroring the generator's irReadsSignal: reactive values need tracked emission. */
function irContainsSourceRead(node: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some(irContainsSourceRead);
  }
  if (typeof node !== 'object' || node === null) {
    return false;
  }
  const record = node as Record<string, unknown>;
  return (
    record.kind === 'signal-read' ||
    record.kind === 'store-read' ||
    Object.values(record).some(irContainsSourceRead)
  );
}

function valueSegment(value: unknown): string | undefined {
  const wire = value as WireValue;
  return wire.kind === 'ir' || wire.kind === 'segment' ? wire.segment : undefined;
}

export interface SegmentModuleLoader {
  (chunkFile: string): Promise<Record<string, unknown>>;
}

type QrlLike = {
  w(captures: unknown[]): unknown;
  s(resolved: unknown): void;
};

export async function buildInterpretedRoot(
  plan: QwikSsrPlan,
  loadSegment: SegmentModuleLoader
): Promise<SsrRenderRoot> {
  const component = plan.components[plan.entry];
  const ssr = component.ssr;
  if (ssr === null) {
    throw new Error(`entry component "${component.name}" has no ssr plan`);
  }

  // fixture modules load by relative specifier with the compiled extension candidates
  const loadFixtureModule = async (module: string): Promise<Record<string, unknown>> => {
    const spec = module.replace(/^\.\//, '');
    for (const candidate of [`${spec}.tsx`, `${spec}.ts`, `${spec}.js`, spec]) {
      try {
        return await loadSegment(candidate);
      } catch {
        // try the next extension
      }
    }
    throw new Error(`fixture module "${module}" not loadable`);
  };

  // segment ids are module-scoped — each component resolves qrls in its own module's table
  const moduleQrls: Map<string, QrlLike>[] = [];
  const moduleCaptureLists: Map<string, number[]>[] = [];
  const moduleBindingsByName: Map<string, number[]>[] = [];
  const moduleSegmentKinds: Map<string, string>[] = [];
  const moduleImportValues: Map<number, unknown>[] = [];
  for (const linkedModule of plan.modules) {
    const qrls = new Map<string, QrlLike>();
    for (const segment of linkedModule.segments) {
      const chunkFile = `${segment.chunk.slice(2)}.js`;
      // v2-parity: server qrls are chunkless; resolved ones bind their fn via `.s()`
      const qrl = _noopQrl(segment.symbolName) as unknown as QrlLike;
      qrls.set(segment.id, qrl);
      // only `.s()` what the emitted module resolves at load — resolution timing is
      // byte-observable in streaming output (lazy QRLs settle later than eager ones)
      if (segment.resolved) {
        const module = await loadSegment(chunkFile);
        qrl.s(module[segment.symbolName]);
      }
    }
    moduleQrls.push(qrls);
    moduleCaptureLists.push(
      new Map(
        linkedModule.segments.map((segment) => [
          segment.id,
          segment.captures.map((capture) => capture.binding),
        ])
      )
    );
    moduleSegmentKinds.push(
      new Map(linkedModule.segments.map((segment) => [segment.id, segment.kind]))
    );
    {
      // js setup ops declare locals by name; capture metadata maps those names back to ids
      const byName = new Map<string, number[]>();
      for (const segment of linkedModule.segments) {
        for (const capture of segment.captures) {
          const ids = byName.get(capture.name) ?? [];
          if (!ids.includes(capture.binding)) {
            ids.push(capture.binding);
          }
          byName.set(capture.name, ids);
        }
      }
      moduleBindingsByName.push(byName);
    }
    // module-scope import values: IR binding-reads of imports resolve to the real export
    const importValues = new Map<number, unknown>();
    for (const importMeta of linkedModule.imports ?? []) {
      if (!importMeta.module.startsWith('.')) {
        continue;
      }
      const loaded = await loadFixtureModule(importMeta.module);
      importValues.set(importMeta.binding, loaded[importMeta.export]);
    }
    moduleImportValues.push(importValues);
  }

  // plugin fns run their real JS implementation — the authored module is the JS target,
  // whether or not a native$ registration exists
  const pluginImpls = new Map<string, (...args: unknown[]) => unknown>();
  const loadPluginImpl = async (module: string, exportName: string): Promise<void> => {
    // plugin ids are canonical input paths; the loader adds the src/ prefix itself
    const loaded = await loadFixtureModule(module.replace(/^src\//, '')).catch(() => null);
    const impl = loaded?.[exportName];
    if (typeof impl !== 'function') {
      throw new Error(`plugin module "${module}" has no ${exportName} export`);
    }
    pluginImpls.set(`plugin:${module}:${exportName}`, impl as (...args: unknown[]) => unknown);
  };
  for (const pluginFn of plan.pluginFns ?? []) {
    await loadPluginImpl(pluginFn.module, pluginFn.exportName);
  }
  // unclaimed plugin-calls: preload every import-addressable fn referenced by any module plan
  const referencedFnIds = new Set<string>();
  const collectFnIds = (node: unknown): void => {
    if (node === null || typeof node !== 'object') {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(collectFnIds);
      return;
    }
    const record = node as Record<string, unknown>;
    if (record.kind === 'plugin-call' && typeof record.fnId === 'string') {
      referencedFnIds.add(record.fnId);
    }
    Object.values(record).forEach(collectFnIds);
  };
  collectFnIds(plan.components);
  for (const fnId of referencedFnIds) {
    if (pluginImpls.has(fnId)) {
      continue;
    }
    const match = /^plugin:(.*):([^:]+)$/.exec(fnId);
    if (match !== null) {
      await loadPluginImpl(match[1], match[2]);
    }
  }

  // module-scoped context objects keyed by (module, binding)
  const moduleContexts: Map<number, unknown>[] = plan.modules.map(
    (linkedModule) =>
      new Map(
        linkedModule.contexts.map((entry) => [entry.binding, createContextId(entry.name)] as const)
      )
  );

  return function InterpretedApp(rootProps, ctx) {
    return interpretComponent(plan.entry, rootProps, ctx);
  };

  /** Local-component blocks interpret like components, in the owner's module with a scope copy. */
  interface NestedBlockOptions {
    readonly block: PlanSsrRenderFn;
    readonly initialLocals: Map<number, unknown>;
    readonly initialLocalComponentBindings: Map<string, number>;
    readonly propsPlan: PlanRenderFnEntry['props'];
    /** Positional values for `paramBindings` (inline collection rows). */
    readonly paramValues?: readonly unknown[];
    /** The block wraps its output in a context-scope range, like a provider component. */
    readonly providesContext?: boolean;
  }

  function interpretComponent(
    componentIndex: number,
    componentProps: unknown,
    ctx: Parameters<SsrRenderRoot>[1],
    nested?: NestedBlockOptions
  ): unknown {
    const interpreted = plan.components[componentIndex];
    const ssr = nested?.block ?? interpreted.ssr;
    if (ssr === null) {
      throw new Error(`component "${interpreted.name}" has no ssr plan`);
    }
    const qrls = moduleQrls[interpreted.module];
    const captureLists = moduleCaptureLists[interpreted.module];
    const bindingsByName = moduleBindingsByName[interpreted.module];
    const segmentKinds = moduleSegmentKinds[interpreted.module];
    const importValues = moduleImportValues[interpreted.module];
    const invokeCtx = getActiveInvokeContextOrNull();
    const locals = nested === undefined ? new Map<number, unknown>() : nested.initialLocals;
    /** Setup values by source name, the scope a `js` setup op runs over. */
    const namedLocals = new Map<string, unknown>();
    const propsObject = componentProps;
    const localComponentBindings = new Map<string, number>(
      nested?.initialLocalComponentBindings ?? []
    );
    // render-site reads of destructured props capture the props object (expression segments),
    // but setup IR reads the alias's read-once value, like the emitted destructure const
    const destructuredPropValues = new Map<number, unknown>();
    if (nested === undefined) {
      for (const propsBinding of interpreted.propsBindings) {
        locals.set(propsBinding, componentProps);
      }
      if (interpreted.props?.kind === 'object') {
        for (const prop of interpreted.props.bindings) {
          destructuredPropValues.set(
            prop.binding,
            (componentProps as Record<string, unknown>)[prop.name]
          );
        }
      }
    } else if (nested.propsPlan !== null) {
      // destructure reads each prop getter once at function start, like the emitted const
      if (nested.propsPlan.kind === 'identifier') {
        locals.set(nested.propsPlan.binding, componentProps);
      } else {
        for (const prop of nested.propsPlan.bindings) {
          locals.set(prop.binding, (componentProps as Record<string, unknown>)[prop.name]);
        }
      }
    }
    if (nested?.paramValues !== undefined) {
      const paramBindings = nested.block.paramBindings ?? [];
      paramBindings.forEach((binding, index) => locals.set(binding, nested.paramValues![index]));
    }

    const evalIr = (ir: ValueIR): unknown => {
      switch (ir.kind) {
        case 'lit':
          return ir.value;
        case 'undef':
          return undefined;
        case 'array':
          return ir.items.map(evalIr);
        case 'object': {
          const value: Record<string, unknown> = {};
          for (const [key, item] of ir.entries) {
            value[key] = evalIr(item);
          }
          return value;
        }
        case 'binding-read': {
          if (destructuredPropValues.has(ir.binding)) {
            return destructuredPropValues.get(ir.binding);
          }
          if (locals.has(ir.binding)) {
            return locals.get(ir.binding);
          }
          if (importValues.has(ir.binding)) {
            return importValues.get(ir.binding);
          }
          throw new Error(`setup ir reads unknown binding ${ir.binding}`);
        }
        // proven signal binding: the emitted JS reads `<local>.value`
        case 'signal-read':
          return (
            evalIr({ kind: 'binding-read', binding: ir.binding } as ValueIR) as {
              value: unknown;
            }
          ).value;
        // proven store binding: the path walks back the member chain it came from
        case 'store-read': {
          let value = evalIr({ kind: 'binding-read', binding: ir.binding } as ValueIR);
          for (const step of ir.path) {
            const key = typeof step === 'string' ? step : (evalIr(step) as string);
            value = (value as Record<string, unknown>)[key];
          }
          return value;
        }
        case 'plugin-call': {
          const impl = pluginImpls.get(ir.fnId);
          if (impl === undefined) {
            throw new Error(`plugin fn ${ir.fnId} has no implementation`);
          }
          const argValues = ir.args.map((argument) => {
            if ((argument as { kind?: string }).kind === 'qrl-arg') {
              // the dollar-rewritten call takes the QRL itself
              return qrlWithCaptures((argument as { segment: string }).segment);
            }
            if ((argument as { kind?: string }).kind === 'fn-arg') {
              // qrl-backed callback: the eagerly resolved segment fn with captures bound
              const segmentId = (argument as { segment: string }).segment;
              const resolved = (qrls.get(segmentId) as { resolved?: unknown } | undefined)
                ?.resolved;
              if (typeof resolved !== 'function') {
                throw new Error(`fn-arg segment "${segmentId}" is not eagerly resolved`);
              }
              const captures = captureLists.get(segmentId) ?? [];
              if (captures.length === 0) {
                return resolved;
              }
              return _withCaptures(
                resolved as (...fnArgs: unknown[]) => unknown,
                captures.map((binding) =>
                  destructuredPropValues.has(binding)
                    ? destructuredPropValues.get(binding)
                    : locals.get(binding)
                )
              );
            }
            return evalIr(argument as ValueIR);
          });
          return impl(...argValues);
        }
        case 'member': {
          const obj = evalIr(ir.obj) as Record<string, unknown> | null | undefined;
          return ir.optional === true ? obj?.[ir.name] : obj![ir.name];
        }
        case 'cond':
          return evalIr(ir.test) ? evalIr(ir.then) : evalIr(ir.else);
        case 'logic': {
          // short-circuit, so the right arm only evaluates when the emitted operator would
          const left = evalIr(ir.left);
          if (ir.op === '&&') {
            return left && evalIr(ir.right);
          }
          if (ir.op === '||') {
            return left || evalIr(ir.right);
          }
          return left ?? evalIr(ir.right);
        }
        case 'call': {
          // mirror the emitted call exactly — method on the receiver or a true global
          const args = ir.args.map((argument) => {
            if ((argument as { kind?: string }).kind === 'lambda') {
              throw new Error('interpreter cannot evaluate lambda args in setup yet');
            }
            return evalIr(argument as ValueIR);
          });
          const method = ir.fn.slice(ir.fn.lastIndexOf('.') + 1);
          if (ir.receiver !== null) {
            const receiver = evalIr(ir.receiver) as Record<string, (...a: unknown[]) => unknown>;
            return receiver[method](...args);
          }
          const namespace = ir.fn.slice(ir.fn.indexOf(':') + 1, ir.fn.lastIndexOf('.'));
          // global functions have no owner object: `String(x)`, not `Global.String(x)`
          if (namespace === 'global') {
            const fn = (globalThis as Record<string, unknown>)[method];
            if (typeof fn !== 'function') {
              throw new Error(`interpreter has no global ${method}`);
            }
            return (fn as (...a: unknown[]) => unknown)(...args);
          }
          const globalOwners: Record<string, object> = {
            promise: Promise,
            math: Math,
            object: Object,
            json: JSON,
            array: Array,
            number: Number,
            date: Date,
          };
          const owner = globalOwners[namespace] as
            | Record<string, (...a: unknown[]) => unknown>
            | undefined;
          if (owner === undefined) {
            throw new Error(`interpreter cannot evaluate call op "${ir.fn}" in setup yet`);
          }
          return owner[method](...args);
        }
        default:
          throw new Error(`interpreter cannot evaluate ir kind "${ir.kind}" in setup yet`);
      }
    };

    const qrlWithCaptures = (segmentId: string) => {
      const qrl = qrls.get(segmentId);
      const captures = captureLists.get(segmentId);
      if (qrl === undefined || captures === undefined) {
        throw new Error(`segment "${segmentId}" missing from the plan`);
      }
      if (captures.length === 0) {
        return qrl;
      }
      return qrl.w(
        captures.map((binding) => {
          if (destructuredPropValues.has(binding)) {
            return destructuredPropValues.get(binding);
          }
          if (!locals.has(binding)) {
            throw new Error(`capture binding ${binding} has no interpreted local`);
          }
          return locals.get(binding);
        })
      );
    };

    // maps copy per call, so the block sees consts defined after the declaration, like a closure
    const makeLocalComponent =
      (entry: PlanRenderFnEntry) => (props: unknown, childCtx: Parameters<SsrRenderRoot>[1]) =>
        interpretComponent(componentIndex, props, childCtx, {
          block: entry.render,
          initialLocals: new Map(locals),
          initialLocalComponentBindings: new Map(localComponentBindings),
          propsPlan: entry.props,
          providesContext: entry.providesContext === true,
        });
    // function declarations hoist above the setup consts in the emitted module
    for (const entry of ssr.setup as readonly (SetupOp | PlanRenderFnEntry)[]) {
      if (entry.kind === 'render-fn' && (entry as { component?: true }).component === true) {
        locals.set(entry.binding, makeLocalComponent(entry));
        localComponentBindings.set(entry.name, entry.binding);
      }
    }

    for (const entry of ssr.setup as readonly (SetupOp | { op: string; src?: string })[]) {
      switch (entry.kind) {
        case 'render-fn':
          break;
        case 'signal': {
          const op = entry as Extract<SetupOp, { op: 'signal' }>;
          const signal = useSignal(evalIr(op.init));
          locals.set(op.binding, signal);
          const name = (entry as { name?: string }).name;
          if (name !== undefined) {
            namedLocals.set(name, signal);
          }
          break;
        }
        case 'const': {
          const op = entry as Extract<SetupOp, { op: 'const' }>;
          locals.set(op.binding, evalIr(op.init));
          break;
        }
        case 'store': {
          const op = entry as Extract<SetupOp, { op: 'store' }>;
          locals.set(op.binding, useStore(evalIr(op.init) as never));
          break;
        }
        case 'computed': {
          const op = entry as Extract<SetupOp, { op: 'computed' }>;
          locals.set(op.binding, useComputedQrl(qrlWithCaptures(op.segment) as never));
          break;
        }
        case 'task': {
          const op = entry as Extract<SetupOp, { op: 'task' }>;
          useTaskQrl(qrlWithCaptures(op.segment) as never);
          break;
        }
        case 'context-provider': {
          const op = entry as Extract<SetupOp, { op: 'context-provider' }>;
          const context = moduleContexts[interpreted.module].get(op.context);
          if (context === undefined) {
            throw new Error(`context binding ${op.context} missing from the module contexts`);
          }
          useContextProvider(context as never, evalIr(op.value) as never);
          break;
        }
        case 'context-read': {
          const op = entry as Extract<SetupOp, { op: 'context-read' }>;
          const context = moduleContexts[interpreted.module].get(op.context);
          if (context === undefined) {
            throw new Error(`context binding ${op.context} missing from the module contexts`);
          }
          locals.set(op.binding, useContext(context as never));
          break;
        }
        case 'qrl-const': {
          const op = entry as Extract<SetupOp, { op: 'qrl-const' }>;
          locals.set(op.binding, qrlWithCaptures(op.segment));
          break;
        }
        case 'style': {
          const op = entry as { styleId: string; scoped: boolean; css?: string };
          if (op.scoped || op.css === undefined) {
            throw new Error('interpreter supports static unscoped styles only');
          }
          useStyles(op.css, op.styleId);
          break;
        }
        case 'visible-task': {
          const op = entry as Extract<SetupOp, { op: 'visible-task' }>;
          if (op.strategy !== 'intersection-observer') {
            throw new Error(`interpreter cannot run visible-task strategy "${op.strategy}" yet`);
          }
          useOn(
            'qvisible',
            createVisibleTaskHandlerQrl(qrlWithCaptures(op.segment) as never) as never
          );
          break;
        }
        case 'js': {
          // a js op is a declared hole: run it as JS over the named scope, keeping declarations
          const op = entry as { src: string };
          const declared = [...op.src.matchAll(/\b(?:let|const|var)\s+([A-Za-z_$][\w$]*)/g)].map(
            (match) => match[1]
          );
          const names = [...namedLocals.keys()];
          const returned = [...new Set([...names, ...declared])];
          const body = `${op.src}\n;return { ${returned.join(', ')} };`;
          const evaluate = new Function('props', ...names, body) as (
            ...args: unknown[]
          ) => Record<string, unknown>;
          const result = evaluate(propsObject, ...names.map((name) => namedLocals.get(name)));
          for (const [name, value] of Object.entries(result)) {
            namedLocals.set(name, value);
            for (const binding of bindingsByName.get(name) ?? []) {
              locals.set(binding, value);
            }
          }
          break;
        }
        default:
          throw new Error(`interpreter cannot run setup op "${entry.kind}" yet`);
      }
    }

    // local components mark after all setup, like the emitted modules
    for (const entry of ssr.setup as readonly (SetupOp | PlanRenderFnEntry)[]) {
      if (entry.kind === 'render-fn' && (entry as { component?: true }).component === true) {
        _markComponent(locals.get(entry.binding) as never, qrlWithCaptures(entry.segment) as never);
      }
    }

    const localSignal = (ir: ValueIR | undefined, site: string): unknown => {
      // signal-read is the proven .value fast path; binding-read of a signal-valued
      // local (bare identifier, e.g. bind:value={text}) yields the signal object itself
      if (ir === undefined || (ir.kind !== 'signal-read' && ir.kind !== 'binding-read')) {
        throw new Error(`${site} needs a signal-valued local read in the interpreter`);
      }
      if (!locals.has(ir.binding)) {
        throw new Error(`${site} reads unknown binding ${ir.binding}`);
      }
      return locals.get(ir.binding);
    };

    /** Planned element id → runtime id, filled as element ops execute. */
    const runtimeIds = new Map<number, number>();
    /** Self-allocated range for a fragment-rooted body, mirroring the emitted `<!d=…>` fence. */
    const rootRangeId =
      (ssr as { ssr?: { needsRootRange?: boolean } }).ssr?.needsRootRange === true
        ? ctx.nextId()
        : null;

    /**
     * Sequential part chain mirroring the emitted maybeThen nesting: sync ops run with zero
     * microtasks (streaming flush order depends on it), async ops still sequence in order.
     */
    const interpretOps = (ops: readonly PlanSsrOp[]): unknown => {
      const parts: unknown[] = [];
      let index = 0;
      const step = (): unknown => {
        if (index === ops.length) {
          return parts;
        }
        return maybeThen(interpretOp(ops[index++], parts), step);
      };
      return step();
    };

    const interpretOp = (op: PlanSsrOp, parts: unknown[]): unknown => {
      switch (op.kind) {
        case 'static':
          parts.push(op.html);
          break;
        case 'element': {
          const id = op.ssr.id === null ? null : ctx.nextId();
          if (op.ssr.id !== null && id !== null) {
            runtimeIds.set(op.ssr.id, id);
          }
          const open: unknown[] = [`<${op.tag}`];
          let innerHtmlContent: string | null = null;
          const deferredEvents: {
            slot: number;
            name: string;
            segment?: string;
            bind?: { name: string; signal: unknown };
          }[] = [];
          if (id !== null) {
            open.push(' q:id="', createSsrNodeId(id), '"');
          }
          for (const prop of op.props as readonly PlanSsrProp[]) {
            if (prop.kind === 'static') {
              const staticProp = prop as { name: string; value: unknown };
              // aria-*/spellcheck/draggable/contenteditable stringify booleans (html-utils.ts)
              const stringifiesBooleans =
                staticProp.name.startsWith('aria-') ||
                ['spellcheck', 'draggable', 'contenteditable'].includes(staticProp.name);
              if (typeof staticProp.value === 'boolean' && stringifiesBooleans) {
                open.push(` ${staticProp.name}="${staticProp.value}"`);
                continue;
              }
              if (staticProp.value === false || staticProp.value == null) {
                continue;
              }
              open.push(
                staticProp.value === true
                  ? ` ${staticProp.name}`
                  : ` ${staticProp.name}="${escapeHTML(String(staticProp.value))}"`
              );
            } else if (prop.kind === 'dynamic') {
              const dynamic = prop as {
                name: string;
                value: { ir?: ValueIR; segment?: string };
              };
              if (id === null) {
                throw new Error('dynamic prop on an untargeted element');
              }
              const irKind = valueIr(dynamic.value)?.kind;
              // binding reads with a segment are expression attrs (plain values, e.g. props)
              const isSignalAttr =
                irKind === 'signal-read' ||
                (irKind === 'binding-read' && valueSegment(dynamic.value) === undefined);
              const attr = isSignalAttr
                ? invoke(invokeCtx, () => {
                    const signal = localSignal(valueIr(dynamic.value), `attr ${dynamic.name}`);
                    ctx.addRoot(signal);
                    return renderSsrAttr(createSsrElementTarget(id), dynamic.name, signal as never);
                  })
                : invoke(invokeCtx, () => {
                    // expression attrs (class objects etc.) render via their segment
                    const segmentId = valueSegment(dynamic.value);
                    if (segmentId === undefined) {
                      throw new Error(`attr ${dynamic.name} has no expression segment`);
                    }
                    const captureValues = (captureLists.get(segmentId) ?? []).map((binding) =>
                      locals.get(binding)
                    );
                    for (const captureValue of captureValues) {
                      ctx.addRoot(captureValue);
                    }
                    return renderSsrAttrExpression(
                      createSsrElementTarget(id),
                      dynamic.name,
                      captureValues as never,
                      qrls.get(segmentId) as never
                    );
                  });
              open.push(
                attr === null
                  ? ''
                  : ` ${dynamic.name}` + (attr === '' ? '' : `="${escapeHTML(attr as string)}"`)
              );
            } else if (prop.kind === 'event') {
              const event = prop as {
                name: string;
                handlers: readonly ({ value?: { segment?: string } } | { bind: string })[];
              };
              const handler = event.handlers[0] as {
                value?: { segment?: string };
                bind?: string;
              };
              // mirror emitted ordering: eventAttr runs at record assembly, after children
              const slot = open.length;
              open.push(null);
              if (event.handlers.length === 1 && handler.value?.segment !== undefined) {
                deferredEvents.push({
                  slot,
                  name: event.name,
                  segment: valueSegment(handler.value),
                });
              } else if (event.handlers.length === 1 && handler.bind !== undefined) {
                // bind handlers reuse the sibling dynamic prop's signal for _val/_chk
                const bindName = event.name === 'q-e:input' ? 'value' : 'checked';
                const sibling = (op.props as readonly PlanSsrProp[]).find(
                  (candidate) =>
                    candidate.kind === 'dynamic' &&
                    (candidate as { name: string }).name === bindName
                ) as { value: { ir?: ValueIR } } | undefined;
                const signal = localSignal(
                  sibling === undefined ? undefined : valueIr(sibling.value),
                  `bind:${bindName}`
                );
                deferredEvents.push({ slot, name: event.name, bind: { name: bindName, signal } });
              } else {
                throw new Error('interpreter supports single segment or bind event handlers only');
              }
            } else if (prop.kind === 'inner-html') {
              const innerHtml = (prop as { html: unknown }).html;
              innerHtmlContent = innerHtml == null ? '' : String(innerHtml);
            } else {
              throw new Error(`interpreter cannot render prop kind "${prop.kind}" yet`);
            }
          }
          open.push('>');
          return maybeThen(interpretOps(op.children), (childParts) => {
            for (const deferred of deferredEvents) {
              if (deferred.bind !== undefined) {
                open[deferred.slot] = ctx.eventAttr(
                  deferred.name,
                  deferred.bind.name === 'value'
                    ? inlinedQrl(_val, '_val', [deferred.bind.signal])
                    : inlinedQrl(_chk, '_chk', [deferred.bind.signal])
                );
              } else if (segmentKinds.get(deferred.segment!) === 'expression') {
                // handler is an expression (e.g. props.onClick$) — evaluate it like the
                // emitted renderSsrEvent call instead of pointing at the segment itself
                open[deferred.slot] = invoke(invokeCtx, () => {
                  const captureValues = (captureLists.get(deferred.segment!) ?? []).map((binding) =>
                    locals.get(binding)
                  );
                  for (const captureValue of captureValues) {
                    ctx.addRoot(captureValue);
                  }
                  return (
                    renderSsrEvent(
                      createSsrElementTarget(id!),
                      deferred.name,
                      captureValues as never,
                      qrls.get(deferred.segment!) as never,
                      ctx.eventAttr,
                      [],
                      []
                    ) ?? ''
                  );
                });
              } else {
                open[deferred.slot] = ctx.eventAttr(
                  deferred.name,
                  qrlWithCaptures(deferred.segment!)
                );
              }
            }
            parts.push(createSsrElementRecord(op.tag, ...(open as never[])));
            if (innerHtmlContent !== null) {
              // static innerHTML replaces children with the raw string
              parts.push(innerHtmlContent);
            }
            parts.push(...(childParts as unknown[]));
            if (!op.voidTag) {
              parts.push(`</${op.tag}>`);
            }
          });
        }
        case 'dynamic': {
          const planTarget = op.ssr.target;
          if (planTarget === null) {
            throw new Error('interpreter needs a targeted dynamic text site');
          }
          // a null id anchors on the body's own root range
          const runtimeId = planTarget.id === null ? rootRangeId : runtimeIds.get(planTarget.id);
          if (runtimeId === undefined || runtimeId === null) {
            throw new Error(`dynamic text targets unopened element ${planTarget.id}`);
          }
          const target =
            planTarget.kind === 'element'
              ? createSsrElementTextTarget(runtimeId)
              : createSsrRangeTextTarget(runtimeId, planTarget.marker);
          const ir = valueIr(op.value);
          let pendingText: unknown;
          if (ir !== undefined && ir.kind === 'signal-read') {
            const signal = localSignal(ir, 'dynamic text');
            pendingText = invoke(invokeCtx, () => {
              ctx.addRoot(signal);
              return renderSsrTextNode(target, signal as never);
            });
          } else if (valueSegment(op.value) !== undefined) {
            const segmentId = valueSegment(op.value);
            const captureValues = (captureLists.get(segmentId) ?? []).map((binding) => {
              if (!locals.has(binding)) {
                throw new Error(`expression capture ${binding} has no interpreted local`);
              }
              return locals.get(binding);
            });
            const qrl = qrls.get(segmentId);
            if (qrl === undefined) {
              throw new Error(`expression segment "${segmentId}" missing from the plan`);
            }
            pendingText = invoke(invokeCtx, () => {
              for (const captureValue of captureValues) {
                ctx.addRoot(captureValue);
              }
              return renderSsrTextExpression(target, captureValues, qrl as never);
            });
          } else {
            throw new Error('dynamic text needs a signal-read ir or an expression segment');
          }
          return maybeThen(pendingText, (text) => {
            if (planTarget.kind === 'range') {
              // range text is fenced by <!t> markers at emit time (derived, not in statics)
              parts.push('<!t>', escapeHTML(text as string), '<!/t>');
            } else {
              parts.push(escapeHTML(text as string));
            }
          });
        }
        case 'branch': {
          const thenSegment = op.then.segment;
          const elseSegment = op.else?.segment;
          if (thenSegment === undefined || (op.else !== null && elseSegment === undefined)) {
            throw new Error('branch arms must reference render segments');
          }
          const id = ctx.nextId();
          const pendingBranch = invoke(invokeCtx, () => {
            for (const captureBinding of captureLists.get(op.condition) ?? []) {
              ctx.addRoot(locals.get(captureBinding));
            }
            // emitted prep also roots the arm captures (rootSegments([then, else]))
            for (const armSegment of [thenSegment, elseSegment]) {
              if (armSegment !== undefined) {
                for (const captureBinding of captureLists.get(armSegment) ?? []) {
                  ctx.addRoot(locals.get(captureBinding));
                }
              }
            }
            return renderSsrBranch(
              ctx as never,
              id,
              qrlWithCaptures(op.condition) as never,
              qrlWithCaptures(thenSegment) as never,
              (op.else === null ? null : qrlWithCaptures(elseSegment!)) as never
            );
          });
          return maybeThen(pendingBranch, (rendered) => {
            parts.push(createSsrRecord('<!b=', createSsrNodeId(id), '>'));
            parts.push(rendered);
            parts.push('<!/b>');
          });
        }
        case 'component': {
          const target = op.target as unknown;
          let renderTarget: ((childProps: unknown) => unknown) | null = null;
          if (op.tagBinding !== undefined) {
            // plain local tag: the runtime reads the value to pick element or component
            const tag = locals.get(op.tagBinding);
            renderTarget = (childProps: unknown) =>
              renderSsrDynamicTag(tag, childProps as never, ctx as never);
          } else if (typeof target === 'string') {
            // lexical reference to a local component in the interpreted scope chain
            const localBinding = localComponentBindings.get(target);
            const localFn = localBinding === undefined ? undefined : locals.get(localBinding);
            if (typeof localFn !== 'function') {
              throw new Error(`local component "${target}" is not in scope`);
            }
            renderTarget = (childProps: unknown) => localFn(childProps, ctx);
          }
          const ref = (target as { ref?: number }).ref;
          if (
            renderTarget === null &&
            (typeof target !== 'object' || target === null || ref === undefined)
          ) {
            throw new Error('component op is not linked to a component ref');
          }
          const literal: Record<string, unknown> = {};
          const sources: Record<string, unknown> = {};
          // spreads merge in source order via the runtime helper: a sole spread passes the
          // object through; mixed lists group literal runs between spreads (later wins)
          let spreadProps: unknown;
          const propList = op.props as readonly PlanSsrProp[];
          if (propList.some((prop) => prop.kind === 'spread')) {
            const segments: Record<string, unknown>[] = [];
            const spreadSources: Record<string, unknown> = {};
            let literalRun: Record<string, unknown> | null = null;
            for (const prop of propList) {
              if (prop.kind === 'spread') {
                const spread = prop as { value: { ir?: ValueIR } };
                if (
                  valueIr(spread.value)?.kind !== 'binding-read' ||
                  !locals.has((valueIr(spread.value) as { binding: number }).binding)
                ) {
                  throw new Error('spread props need a local binding read');
                }
                literalRun = null;
                segments.push(
                  locals.get((valueIr(spread.value) as { binding: number }).binding) as Record<
                    string,
                    unknown
                  >
                );
              } else if (prop.kind === 'static') {
                const staticProp = prop as { name: string; value: unknown };
                if (literalRun === null) {
                  literalRun = {};
                  segments.push(literalRun);
                }
                literalRun[staticProp.name] = staticProp.value;
              } else if (
                prop.kind === 'dynamic' &&
                valueIr((prop as { value: unknown }).value)?.kind === 'signal-read'
              ) {
                // signal reads merge as live getters, then _props records their sources
                const dynamic = prop as { name: string; value: { ir?: ValueIR } };
                const signal = localSignal(
                  valueIr(dynamic.value),
                  `component prop ${dynamic.name}`
                );
                if (literalRun === null) {
                  literalRun = {};
                  segments.push(literalRun);
                }
                Object.defineProperty(literalRun, dynamic.name, {
                  enumerable: true,
                  configurable: true,
                  get: () => readTrackedSourceValue(signal as never),
                });
                spreadSources[dynamic.name] = signal;
                ctx.addRoot(signal);
              } else {
                throw new Error(
                  `interpreter cannot merge prop kind "${prop.kind}" with spreads yet`
                );
              }
            }
            const merged = segments.length === 1 ? segments[0] : mergeProps(...segments);
            spreadProps =
              Object.keys(spreadSources).length > 0 ? _props(merged, spreadSources) : merged;
          }
          for (const prop of spreadProps === undefined ? propList : []) {
            if (prop.kind === 'static') {
              const staticProp = prop as { name: string; value: unknown };
              literal[staticProp.name] = staticProp.value;
            } else if (prop.kind === 'dynamic') {
              const dynamic = prop as { name: string; value: { ir?: ValueIR } };
              const ir = valueIr(dynamic.value);
              if (ir !== undefined && ir.kind === 'binding-read') {
                // plain value read — emitted getters return the local directly, no rooting
                if (!locals.has(ir.binding)) {
                  throw new Error(`component prop ${dynamic.name} reads unknown binding`);
                }
                const plain = locals.get(ir.binding);
                Object.defineProperty(literal, dynamic.name, {
                  enumerable: true,
                  get: () => plain,
                });
              } else if (
                ir !== undefined &&
                ir.kind !== 'signal-read' &&
                ir.kind !== 'store-read' &&
                !irContainsSourceRead(ir)
              ) {
                // segment-backed args root their captures before the component call
                for (const segmentId of collectSegmentArgIds(ir)) {
                  for (const captureBinding of captureLists.get(segmentId) ?? []) {
                    ctx.addRoot(
                      destructuredPropValues.has(captureBinding)
                        ? destructuredPropValues.get(captureBinding)
                        : locals.get(captureBinding)
                    );
                  }
                }
                // non-reactive expression props read through a plain evaluating getter
                Object.defineProperty(literal, dynamic.name, {
                  enumerable: true,
                  get: () => evalIr(ir),
                });
              } else {
                const signal = localSignal(ir, `component prop ${dynamic.name}`);
                Object.defineProperty(literal, dynamic.name, {
                  enumerable: true,
                  get: () => readTrackedSourceValue(signal as never),
                });
                sources[dynamic.name] = signal;
              }
            } else if (prop.kind === 'event') {
              // event props pass the handler QRL as a plain prop value (q_….w(captures))
              const event = prop as {
                name: string;
                handlers: readonly { value?: { segment?: string } }[];
              };
              const segmentId = event.handlers[0]?.value?.segment;
              if (event.handlers.length !== 1 || segmentId === undefined) {
                throw new Error(`component event prop ${event.name} needs a single segment`);
              }
              literal[event.name] = qrlWithCaptures(segmentId);
            } else {
              throw new Error(`interpreter cannot pass component prop kind "${prop.kind}" yet`);
            }
          }
          const pendingComponent = invoke(invokeCtx, () => {
            let slotScope: unknown;
            if (op.slots.length > 0) {
              slotScope = createSlotScope();
              ctx.addRoot(slotScope);
            }
            for (const source of Object.values(sources)) {
              ctx.addRoot(source);
            }
            for (const slot of op.slots) {
              const slotSegment = slot.render.segment;
              if (slotSegment === undefined) {
                throw new Error(`slot "${slot.name}" has no render segment`);
              }
              for (const captureBinding of captureLists.get(slotSegment) ?? []) {
                ctx.addRoot(locals.get(captureBinding));
              }
              registerProjection(
                slotScope as never,
                slot.name,
                qrlWithCaptures(slotSegment) as never
              );
            }
            // static-only props pass as a bare literal, matching emitted serialization
            const componentProps =
              spreadProps !== undefined
                ? (spreadProps as never)
                : Object.keys(sources).length > 0
                  ? (_props(literal, sources) as never)
                  : literal;
            const renderer =
              renderTarget ?? ((childProps: unknown) => interpretComponent(ref!, childProps, ctx));
            return op.slots.length > 0
              ? createComponent(componentProps as never, renderer, {
                  slotScope: slotScope as never,
                })
              : createComponent(componentProps as never, renderer);
          });
          return maybeThen(pendingComponent, (rendered) => {
            parts.push(rendered);
          });
        }
        case 'suspense': {
          const contentSegment = op.content.segment;
          if (contentSegment === undefined) {
            throw new Error('suspense content must reference a render segment');
          }
          if (op.inOrder !== null) {
            throw new Error('interpreter cannot render inOrder suspense yet');
          }
          const fallbackSegment =
            op.fallback === null ? undefined : (op.fallback.segment ?? undefined);
          if (op.fallback !== null && fallbackSegment === undefined) {
            throw new Error('suspense fallback must reference a segment');
          }
          const delay =
            op.delay === null
              ? 0
              : op.delay.ir !== undefined && op.delay.ir.kind === 'lit'
                ? (op.delay.ir.value as number)
                : (() => {
                    throw new Error('suspense delay must be a literal');
                  })();
          const id = ctx.nextId();
          const pendingSuspense = invoke(invokeCtx, () =>
            createSsrSuspense(
              ctx as never,
              id,
              qrlWithCaptures(contentSegment) as never,
              (fallbackSegment === undefined
                ? undefined
                : qrlWithCaptures(fallbackSegment)) as never,
              delay
            )
          );
          return maybeThen(pendingSuspense, (rendered) => {
            parts.push(rendered);
          });
        }
        case 'slot': {
          const fallbackSegment = op.fallback?.segment;
          const fallbackQrl =
            op.fallback === null
              ? undefined
              : fallbackSegment === undefined
                ? undefined
                : qrlWithCaptures(fallbackSegment);
          const pendingSlot = invoke(invokeCtx, () =>
            renderSsrSlot(ctx as never, op.name, fallbackQrl as never, invokeCtx as never)
          );
          return maybeThen(pendingSlot, (rendered) => {
            parts.push(rendered);
          });
        }
        case 'dynamic-slot': {
          const segment = (op as { render: { segment: string } }).render.segment;
          const id = ctx.nextId();
          const rendered = invoke(invokeCtx, () => {
            for (const binding of captureLists.get(segment) ?? []) {
              ctx.addRoot(locals.get(binding));
            }
            // the render returns ssr output, so it takes the container rather than plain captures
            return renderSsrContent(
              ctx as never,
              id,
              [] as never,
              qrlWithCaptures(segment) as never,
              false,
              true
            );
          });
          return maybeThen(rendered, (output) => {
            parts.push(createSsrRecord('<!d=', createSsrNodeId(id), '>'));
            parts.push(output as never);
            parts.push('<!/d>');
          });
        }
        case 'content': {
          const op2 = {
            segment: valueSegment((op as { value: unknown }).value)!,
            root: (op as { ssr: { root: boolean } }).ssr.root,
          };
          if (op2.root) {
            throw new Error('interpreter cannot render root content ops yet');
          }
          const id = ctx.nextId();
          const rendered = invoke(invokeCtx, () => {
            const captureValues = (captureLists.get(op2.segment) ?? []).map((binding) =>
              locals.get(binding)
            );
            for (const captureValue of captureValues) {
              ctx.addRoot(captureValue);
            }
            return renderSsrContent(
              ctx as never,
              id,
              captureValues as never,
              qrls.get(op2.segment) as never
            );
          });
          return maybeThen(rendered, (output) => {
            parts.push(createSsrRecord('<!d=', createSsrNodeId(id), '>'));
            parts.push(renderSsrDynamicContent(output as never) as never);
            parts.push('<!/d>');
          });
        }
        case 'collection': {
          const source = op.source;
          if (source.kind === 'direct-array') {
            // static collections render without an id or range markers, like the emitted call
            const row = op.row as PlanSsrRow;
            if (typeof row.symbolName !== 'string') {
              throw new Error('direct-array collections need an inline row in the interpreter');
            }
            if (row.rowMarker || row.slotMarker || row.rowRoot || row.usesRowId) {
              throw new Error('interpreter cannot render marked inline rows yet');
            }
            if (source.ir === undefined) {
              throw new Error('direct-array collection source needs ir');
            }
            const array = evalIr(source.ir);
            const rowFn = (
              rowCtx: Parameters<SsrRenderRoot>[1],
              _rangeId: unknown,
              _rowId: unknown,
              ...args: unknown[]
            ) =>
              interpretComponent(componentIndex, undefined, rowCtx, {
                block: row,
                initialLocals: new Map(locals),
                initialLocalComponentBindings: new Map(localComponentBindings),
                propsPlan: null,
                paramValues: args,
              });
            const rendered = invoke(invokeCtx, () =>
              renderSsrCollection(
                ctx as never,
                undefined as never,
                array as never,
                undefined as never,
                rowFn as never,
                false,
                op.ssr.idBase ?? '',
                op.ssr.usesRowId,
                op.ssr.rowShape
              )
            );
            return maybeThen(rendered, (output) => {
              parts.push(output);
            });
          }
          if (source.kind === 'direct-reactive') {
            const row = op.row as { segment?: { segment?: string } };
            const rowSegment = row.segment?.segment;
            if (rowSegment === undefined || source.ir === undefined) {
              throw new Error('direct-reactive collections need a segment row and source ir');
            }
            const sourceIr = source.ir;
            const keySegment = op.key;
            const id = ctx.nextId();
            // mirror the emitted thunk: root the source value then capture roots, deduped
            const rendered = invoke(invokeCtx, () => {
              const collection = evalIr(sourceIr);
              const rooted = new Set<unknown>([collection]);
              ctx.addRoot(collection);
              const rootCaptures = (segmentId: string): void => {
                for (const captureBinding of captureLists.get(segmentId) ?? []) {
                  const captured = locals.get(captureBinding);
                  if (!rooted.has(captured)) {
                    rooted.add(captured);
                    ctx.addRoot(captured);
                  }
                }
              };
              if (keySegment !== null) {
                rootCaptures(keySegment);
              }
              rootCaptures(rowSegment);
              return renderSsrCollection(
                ctx as never,
                id,
                collection as never,
                (keySegment === null ? undefined : qrlWithCaptures(keySegment)) as never,
                qrlWithCaptures(rowSegment) as never,
                op.usesIndexSignal,
                op.ssr.idBase ?? '',
                op.ssr.usesRowId,
                op.ssr.rowShape
              );
            });
            return maybeThen(rendered, (output) => {
              parts.push(createSsrRecord('<!f=', createSsrNodeId(id), '>'));
              parts.push(output);
              parts.push('<!/f>');
            });
          }
          if (source.kind !== 'derived') {
            throw new Error(`interpreter cannot render ${source.kind} collections yet`);
          }
          const row = op.row as { segment?: { segment?: string } };
          const rowSegment = row.segment?.segment;
          const keySegment = op.key;
          if (rowSegment === undefined || keySegment === null) {
            throw new Error('interpreter needs segment rows and keys for collections');
          }
          const id = ctx.nextId();
          // mirror emitted prep: capture roots, wrap the derived source, root the computed
          const rendered = invoke(invokeCtx, () => {
            for (const captureBinding of captureLists.get(source.segment) ?? []) {
              ctx.addRoot(locals.get(captureBinding));
            }
            const collection = _wrapArray(qrlWithCaptures(source.segment) as never);
            if (!Array.isArray(collection)) {
              ctx.addRoot(collection);
            }
            return renderSsrCollection(
              ctx as never,
              id,
              collection as never,
              qrlWithCaptures(keySegment) as never,
              qrlWithCaptures(rowSegment) as never,
              op.usesIndexSignal,
              op.ssr.idBase ?? '',
              op.ssr.usesRowId,
              op.ssr.rowShape
            );
          });
          return maybeThen(rendered, (output) => {
            parts.push(createSsrRecord('<!f=', createSsrNodeId(id), '>'));
            parts.push(output);
            parts.push('<!/f>');
          });
        }
        default:
          throw new Error(`interpreter cannot render op "${op.kind}" yet`);
      }
    };

    const run = () => {
      const providesContext =
        nested === undefined ? interpreted.providesContext : nested.providesContext === true;
      const fence = (parts: unknown) =>
        rootRangeId === null
          ? parts
          : [createSsrRecord('<!d=', createSsrNodeId(rootRangeId), '>'), parts, '<!/d>'];
      if (!providesContext) {
        return maybeThen(interpretOps(ssr.ops), fence);
      }
      // provider components wrap their output in a context-scope range (root-ref id)
      const scopeRef = ctx.contextScopeRef();
      return maybeThen(interpretOps(ssr.ops), (parts) => [
        createSsrRecord('<!c=', scopeRef, '>'),
        fence(parts),
        '<!/c>',
      ]);
    };
    return (nested === undefined ? interpreted.ssr!.ssr.flushTasks : false)
      ? maybeThen(ctx.scheduler.flush(), () => invoke(invokeCtx, run))
      : invoke(invokeCtx, run);
  }
}
