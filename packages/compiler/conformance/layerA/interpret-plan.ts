import {
  createComponent,
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
  renderSsrBranch,
  renderSsrTextExpression,
  renderSsrSlot,
  renderSsrTextNode,
  readTrackedSourceValue,
  registerProjection,
  useComputedQrl,
  useSignal,
  useStore,
  useTaskQrl,
  inlinedQrl,
  _chk,
  _props,
  _qrlWithChunk,
  _val,
} from '@qwik.dev/core';
import type { PlanSsrOp, PlanSsrProp } from '../../src/emit-plan-ssr';
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

  const qrls = new Map<string, QrlLike>();
  const chunkFiles = new Map<string, string>();
  for (const segment of plan.segments) {
    const chunkFile = `${segment.chunk.slice(2)}.js`;
    chunkFiles.set(segment.id, chunkFile);
    const qrl = _qrlWithChunk(
      segment.chunk,
      () => loadSegment(chunkFile),
      segment.symbolName
    ) as unknown as QrlLike;
    qrls.set(segment.id, qrl);
  }
  for (const segment of plan.segments) {
    // only `.s()` what the emitted module resolves at load — resolution timing is
    // byte-observable in streaming output (lazy QRLs settle later than eager ones)
    if (!segment.resolved) {
      continue;
    }
    const module = await loadSegment(chunkFiles.get(segment.id)!);
    qrls.get(segment.id)!.s(module[segment.symbolName]);
  }

  const captureLists = new Map(
    plan.segments.map((segment) => [segment.id, segment.captures.map((capture) => capture.binding)])
  );

  return function InterpretedApp(rootProps, ctx) {
    return interpretComponent(plan.entry, rootProps, ctx);
  };

  function interpretComponent(
    componentIndex: number,
    componentProps: unknown,
    ctx: Parameters<SsrRenderRoot>[1]
  ): unknown {
    const interpreted = plan.components[componentIndex];
    const ssr = interpreted.ssr;
    if (ssr === null) {
      throw new Error(`component "${interpreted.name}" has no ssr plan`);
    }
    const invokeCtx = getActiveInvokeContextOrNull();
    const locals = new Map<number, unknown>();
    for (const propsBinding of interpreted.propsBindings) {
      locals.set(propsBinding, componentProps);
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

    for (const entry of ssr.setup as readonly (SetupOp | { op: string; src?: string })[]) {
      switch (entry.op) {
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
        default:
          throw new Error(`interpreter cannot run setup op "${entry.op}" yet`);
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
              if (staticProp.value === false || staticProp.value == null) {
                continue;
              }
              open.push(
                staticProp.value === true
                  ? ` ${staticProp.name}`
                  : ` ${staticProp.name}="${escapeHTML(String(staticProp.value))}"`
              );
            } else if (prop.p === 'dynamic') {
              const dynamic = prop as { name: string; value: { ir?: ValueIR } };
              if (id === null) {
                throw new Error('dynamic prop on an untargeted element');
              }
              const signal = localSignal(dynamic.value.ir, `attr ${dynamic.name}`);
              const attr = invoke(invokeCtx, () => {
                ctx.addRoot(signal);
                return renderSsrAttr(createSsrElementTarget(id), dynamic.name, signal as never);
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
          const ref = (target as { ref?: number }).ref;
          if (typeof target !== 'object' || target === null || ref === undefined) {
            throw new Error('component op is not linked to a component ref');
          }
          const literal: Record<string, unknown> = {};
          const sources: Record<string, unknown> = {};
          for (const prop of op.props as readonly PlanSsrProp[]) {
            if (prop.p === 'static') {
              const staticProp = prop as { name: string; value: unknown };
              literal[staticProp.name] = staticProp.value;
            } else if (prop.p === 'dynamic') {
              const dynamic = prop as { name: string; value: { ir?: ValueIR } };
              const signal = localSignal(dynamic.value.ir, `component prop ${dynamic.name}`);
              Object.defineProperty(literal, dynamic.name, {
                enumerable: true,
                get: () => readTrackedSourceValue(signal as never),
              });
              sources[dynamic.name] = signal;
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
              Object.keys(sources).length > 0 ? (_props(literal, sources) as never) : literal;
            const renderer = (childProps: unknown) => interpretComponent(ref, childProps, ctx);
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
        default:
          throw new Error(`interpreter cannot render op "${op.o}" yet`);
      }
    };

    const run = () => interpretOps(ssr.ops);
    return ssr.flushTasks
      ? maybeThen(ctx.scheduler.flush(), () => invoke(invokeCtx, run))
      : invoke(invokeCtx, run);
  }
}
