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
  renderSsrBranch,
  renderSsrCollection,
  renderSsrContent,
  escapeSsrContent,
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
  _chk,
  _props,
  _wrapArray,
  _qrlWithChunk,
  _val,
} from '@qwik.dev/core';
import type { PlanSsrOp, PlanSsrProp, PlanSsrRenderFn, PlanSsrRow } from '../../src/emit-plan-ssr';
import type { PlanLocalComponent } from '../../src/emit-plan';
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

  // segment ids are module-scoped — each component resolves qrls in its own module's table
  const moduleQrls: Map<string, QrlLike>[] = [];
  const moduleCaptureLists: Map<string, number[]>[] = [];
  for (const linkedModule of plan.modules) {
    const qrls = new Map<string, QrlLike>();
    for (const segment of linkedModule.segments) {
      const chunkFile = `${segment.chunk.slice(2)}.js`;
      const qrl = _qrlWithChunk(
        segment.chunk,
        () => loadSegment(chunkFile),
        segment.symbolName
      ) as unknown as QrlLike;
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
    readonly propsPlan: PlanLocalComponent['props'];
    /** Positional values for `paramBindings` (inline collection rows). */
    readonly paramValues?: readonly unknown[];
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
    const invokeCtx = getActiveInvokeContextOrNull();
    const locals = nested === undefined ? new Map<number, unknown>() : nested.initialLocals;
    const localComponentBindings = new Map<string, number>(
      nested?.initialLocalComponentBindings ?? []
    );
    if (nested === undefined) {
      for (const propsBinding of interpreted.propsBindings) {
        locals.set(propsBinding, componentProps);
      }
    } else if (nested.propsPlan !== null) {
      // destructure reads each prop getter once at function start, like the emitted const
      if (nested.propsPlan.kind === 'identifier') {
        locals.set(nested.propsPlan.binding, componentProps);
      } else {
        for (const prop of nested.propsPlan.bindings) {
          locals.set(prop.b, (componentProps as Record<string, unknown>)[prop.name]);
        }
      }
    }
    if (nested?.paramValues !== undefined) {
      const paramBindings = nested.block.paramBindings ?? [];
      paramBindings.forEach((binding, index) => locals.set(binding, nested.paramValues![index]));
    }

    const evalIr = (ir: ValueIR): unknown => {
      switch (ir.k) {
        case 'lit':
          return ir.v;
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
          if (!locals.has(ir.binding)) {
            throw new Error(`setup ir reads unknown binding ${ir.binding}`);
          }
          return locals.get(ir.binding);
        }
        case 'call': {
          const receiver = ir.recv === null ? null : evalIr(ir.recv);
          // mirror the emitted method call exactly — no coercion
          switch (ir.fn) {
            case 'qwik:string.toLowerCase':
              return (receiver as string).toLowerCase();
            case 'qwik:string.toUpperCase':
              return (receiver as string).toUpperCase();
            case 'qwik:string.trim':
              return (receiver as string).trim();
            default:
              throw new Error(`interpreter cannot evaluate call op "${ir.fn}" in setup yet`);
          }
        }
        default:
          throw new Error(`interpreter cannot evaluate ir kind "${ir.k}" in setup yet`);
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
          if (!locals.has(binding)) {
            throw new Error(`capture binding ${binding} has no interpreted local`);
          }
          return locals.get(binding);
        })
      );
    };

    // maps copy per call, so the block sees consts defined after the declaration, like a closure
    const makeLocalComponent =
      (entry: PlanLocalComponent) => (props: unknown, childCtx: Parameters<SsrRenderRoot>[1]) =>
        interpretComponent(componentIndex, props, childCtx, {
          block: entry.render,
          initialLocals: new Map(locals),
          initialLocalComponentBindings: new Map(localComponentBindings),
          propsPlan: entry.props,
        });
    // function declarations hoist above the setup consts in the emitted module
    for (const entry of ssr.setup as readonly (SetupOp | PlanLocalComponent)[]) {
      if (entry.op === 'local-component') {
        locals.set(entry.binding, makeLocalComponent(entry));
        localComponentBindings.set(entry.name, entry.binding);
      }
    }

    for (const entry of ssr.setup as readonly (SetupOp | { op: string; src?: string })[]) {
      switch (entry.op) {
        case 'local-component':
          break;
        case 'signal': {
          const op = entry as Extract<SetupOp, { op: 'signal' }>;
          locals.set(op.local, useSignal(evalIr(op.init)));
          break;
        }
        case 'const': {
          const op = entry as Extract<SetupOp, { op: 'const' }>;
          locals.set(op.local, evalIr(op.init));
          break;
        }
        case 'store': {
          const op = entry as Extract<SetupOp, { op: 'store' }>;
          locals.set(op.local, useStore(evalIr(op.init) as never));
          break;
        }
        case 'computed': {
          const op = entry as Extract<SetupOp, { op: 'computed' }>;
          locals.set(op.local, useComputedQrl(qrlWithCaptures(op.segment) as never));
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
          if (op.value.k !== 'binding-read') {
            throw new Error('interpreter supports binding-read context values only');
          }
          useContextProvider(context as never, locals.get(op.value.binding) as never);
          break;
        }
        case 'context-read': {
          const op = entry as Extract<SetupOp, { op: 'context-read' }>;
          const context = moduleContexts[interpreted.module].get(op.context);
          if (context === undefined) {
            throw new Error(`context binding ${op.context} missing from the module contexts`);
          }
          locals.set(op.local, useContext(context as never));
          break;
        }
        case 'qrl-const': {
          const op = entry as Extract<SetupOp, { op: 'qrl-const' }>;
          locals.set(op.local, qrlWithCaptures(op.segment));
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
        default:
          throw new Error(`interpreter cannot run setup op "${entry.op}" yet`);
      }
    }

    // local components mark after all setup, like the emitted modules
    for (const entry of ssr.setup as readonly (SetupOp | PlanLocalComponent)[]) {
      if (entry.op === 'local-component') {
        _markComponent(locals.get(entry.binding) as never, qrlWithCaptures(entry.segment) as never);
      }
    }

    const localSignal = (ir: ValueIR | undefined, site: string): unknown => {
      // signal-read is the proven .value fast path; binding-read of a signal-valued
      // local (bare identifier, e.g. bind:value={text}) yields the signal object itself
      if (ir === undefined || (ir.k !== 'signal-read' && ir.k !== 'binding-read')) {
        throw new Error(`${site} needs a signal-valued local read in the interpreter`);
      }
      if (!locals.has(ir.binding)) {
        throw new Error(`${site} reads unknown binding ${ir.binding}`);
      }
      return locals.get(ir.binding);
    };

    /** Planned element id → runtime id, filled as element ops execute. */
    const runtimeIds = new Map<number, number>();

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
      switch (op.o) {
        case 'static':
          parts.push(op.html);
          break;
        case 'el': {
          const id = op.id === null ? null : ctx.nextId();
          if (op.id !== null && id !== null) {
            runtimeIds.set(op.id, id);
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
            if (prop.p === 'static') {
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
            } else if (prop.p === 'dynamic') {
              const dynamic = prop as {
                name: string;
                value: { ir?: ValueIR; segment?: string };
              };
              if (id === null) {
                throw new Error('dynamic prop on an untargeted element');
              }
              const irKind = dynamic.value.ir?.k;
              // binding reads with a segment are expression attrs (plain values, e.g. props)
              const isSignalAttr =
                irKind === 'signal-read' ||
                (irKind === 'binding-read' && dynamic.value.segment === undefined);
              const attr = isSignalAttr
                ? invoke(invokeCtx, () => {
                    const signal = localSignal(dynamic.value.ir, `attr ${dynamic.name}`);
                    ctx.addRoot(signal);
                    return renderSsrAttr(createSsrElementTarget(id), dynamic.name, signal as never);
                  })
                : invoke(invokeCtx, () => {
                    // expression attrs (class objects etc.) render via their segment
                    const segmentId = dynamic.value.segment;
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
            } else if (prop.p === 'event') {
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
                deferredEvents.push({ slot, name: event.name, segment: handler.value.segment });
              } else if (event.handlers.length === 1 && handler.bind !== undefined) {
                // bind handlers reuse the sibling dynamic prop's signal for _val/_chk
                const bindName = event.name === 'q-e:input' ? 'value' : 'checked';
                const sibling = (op.props as readonly PlanSsrProp[]).find(
                  (candidate) =>
                    candidate.p === 'dynamic' && (candidate as { name: string }).name === bindName
                ) as { value: { ir?: ValueIR } } | undefined;
                const signal = localSignal(sibling?.value.ir, `bind:${bindName}`);
                deferredEvents.push({ slot, name: event.name, bind: { name: bindName, signal } });
              } else {
                throw new Error('interpreter supports single segment or bind event handlers only');
              }
            } else if (prop.p === 'inner-html') {
              const innerHtml = (prop as { html: unknown }).html;
              innerHtmlContent = innerHtml == null ? '' : String(innerHtml);
            } else {
              throw new Error(`interpreter cannot render prop kind "${prop.p}" yet`);
            }
          }
          open.push('>');
          return maybeThen(interpretOps(op.children), (childParts) => {
            for (const deferred of deferredEvents) {
              open[deferred.slot] =
                deferred.bind !== undefined
                  ? ctx.eventAttr(
                      deferred.name,
                      deferred.bind.name === 'value'
                        ? inlinedQrl(_val, '_val', [deferred.bind.signal])
                        : inlinedQrl(_chk, '_chk', [deferred.bind.signal])
                    )
                  : ctx.eventAttr(deferred.name, qrlWithCaptures(deferred.segment!));
            }
            parts.push(createSsrElementRecord(op.tag, ...(open as never[])));
            if (innerHtmlContent !== null) {
              // static innerHTML replaces children with the raw string
              parts.push(innerHtmlContent);
            }
            parts.push(...(childParts as unknown[]));
            if (!op.void) {
              parts.push(`</${op.tag}>`);
            }
          });
        }
        case 'dyn': {
          const planTarget = op.target;
          if (planTarget === null || planTarget.id === null) {
            throw new Error('interpreter needs a targeted dynamic text site');
          }
          const runtimeId = runtimeIds.get(planTarget.id);
          if (runtimeId === undefined) {
            throw new Error(`dynamic text targets unopened element ${planTarget.id}`);
          }
          const target =
            planTarget.kind === 'element'
              ? createSsrElementTextTarget(runtimeId)
              : createSsrRangeTextTarget(runtimeId, planTarget.marker);
          const ir = op.value.ir;
          let pendingText: unknown;
          if (ir !== undefined && ir.k === 'signal-read') {
            const signal = localSignal(ir, 'dynamic text');
            pendingText = invoke(invokeCtx, () => {
              ctx.addRoot(signal);
              return renderSsrTextNode(target, signal as never);
            });
          } else if (op.value.segment !== undefined) {
            const segmentId = op.value.segment;
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
          if (typeof target === 'string') {
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
          // a sole spread passes the object through, like the emitted `createComponent(shared, …)`
          let spreadProps: unknown;
          const propList = op.props as readonly PlanSsrProp[];
          if (propList.some((prop) => prop.p === 'spread')) {
            if (propList.length !== 1) {
              throw new Error('interpreter cannot merge spread props with other props yet');
            }
            const spread = propList[0] as { value: { ir?: ValueIR } };
            if (spread.value.ir?.k !== 'binding-read' || !locals.has(spread.value.ir.binding)) {
              throw new Error('spread props need a local binding read');
            }
            spreadProps = locals.get(spread.value.ir.binding);
          }
          for (const prop of spreadProps === undefined ? propList : []) {
            if (prop.p === 'static') {
              const staticProp = prop as { name: string; value: unknown };
              literal[staticProp.name] = staticProp.value;
            } else if (prop.p === 'dynamic') {
              const dynamic = prop as { name: string; value: { ir?: ValueIR } };
              const ir = dynamic.value.ir;
              if (ir !== undefined && ir.k === 'binding-read') {
                // plain value read — emitted getters return the local directly, no rooting
                if (!locals.has(ir.binding)) {
                  throw new Error(`component prop ${dynamic.name} reads unknown binding`);
                }
                const plain = locals.get(ir.binding);
                Object.defineProperty(literal, dynamic.name, {
                  enumerable: true,
                  get: () => plain,
                });
              } else {
                const signal = localSignal(ir, `component prop ${dynamic.name}`);
                Object.defineProperty(literal, dynamic.name, {
                  enumerable: true,
                  get: () => readTrackedSourceValue(signal as never),
                });
                sources[dynamic.name] = signal;
              }
            } else {
              throw new Error(`interpreter cannot pass component prop kind "${prop.p}" yet`);
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
              : op.delay.ir !== undefined && op.delay.ir.k === 'lit'
                ? (op.delay.ir.v as number)
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
        case 'content': {
          const op2 = op as { segment: string; root: boolean };
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
            parts.push(escapeSsrContent(output as never));
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
                op.idBase ?? '',
                op.usesRowId,
                op.rowShape
              )
            );
            return maybeThen(rendered, (output) => {
              parts.push(output);
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
              op.idBase ?? '',
              op.usesRowId,
              op.rowShape
            );
          });
          return maybeThen(rendered, (output) => {
            parts.push(createSsrRecord('<!f=', createSsrNodeId(id), '>'));
            parts.push(output);
            parts.push('<!/f>');
          });
        }
        default:
          throw new Error(`interpreter cannot render op "${op.o}" yet`);
      }
    };

    const run = () => {
      if (nested !== undefined || !interpreted.providesContext) {
        return interpretOps(ssr.ops);
      }
      // provider components wrap their output in a context-scope range (root-ref id)
      const scopeRef = ctx.contextScopeRef();
      return maybeThen(interpretOps(ssr.ops), (parts) => [
        createSsrRecord('<!c=', scopeRef, '>'),
        parts,
        '<!/c>',
      ]);
    };
    return ssr.flushTasks
      ? maybeThen(ctx.scheduler.flush(), () => invoke(invokeCtx, run))
      : invoke(invokeCtx, run);
  }
}
