import {
  createComponent,
  createSlotScope,
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
  useTaskQrl,
  _props,
  _qrlWithChunk,
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
    try {
      const module = await loadSegment(chunkFiles.get(segment.id)!);
      qrls.get(segment.id)!.s(module[segment.symbolName]);
    } catch {
      // some segments have no standalone module (inlined into their parent segment);
      // they are never invoked through these qrls
    }
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
      if (ir === undefined || ir.k !== 'signal-read') {
        throw new Error(`${site} needs a signal-read ir in the interpreter`);
      }
      if (!locals.has(ir.binding)) {
        throw new Error(`${site} reads unknown binding ${ir.binding}`);
      }
      return locals.get(ir.binding);
    };

    /** Planned element id → runtime id, filled as element ops execute. */
    const runtimeIds = new Map<number, number>();

    /** Sequential part chain mirroring the emitted maybeThen nesting. */
    const interpretOps = async (ops: readonly PlanSsrOp[]): Promise<unknown[]> => {
      const parts: unknown[] = [];
      for (const op of ops) {
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
            const deferredEvents: { slot: number; name: string; segment: string }[] = [];
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
                const attr = await invoke(invokeCtx, () => {
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
                const handler = event.handlers[0] as { value?: { segment?: string } };
                if (event.handlers.length !== 1 || handler.value?.segment === undefined) {
                  throw new Error('interpreter supports single segment event handlers only');
                }
                // mirror emitted ordering: eventAttr runs at record assembly, after children
                const slot = open.length;
                open.push(null);
                deferredEvents.push({ slot, name: event.name, segment: handler.value.segment });
              } else {
                throw new Error(`interpreter cannot render prop kind "${prop.p}" yet`);
              }
            }
            open.push('>');
            const childParts = await interpretOps(op.children);
            for (const deferred of deferredEvents) {
              open[deferred.slot] = ctx.eventAttr(deferred.name, qrlWithCaptures(deferred.segment));
            }
            parts.push(createSsrElementRecord(op.tag, ...(open as never[])));
            parts.push(...childParts);
            if (!op.void) {
              parts.push(`</${op.tag}>`);
            }
            break;
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
            let text: unknown;
            if (ir !== undefined && ir.k === 'signal-read') {
              const signal = localSignal(ir, 'dynamic text');
              text = await invoke(invokeCtx, () => {
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
              text = await invoke(invokeCtx, () => {
                for (const captureValue of captureValues) {
                  ctx.addRoot(captureValue);
                }
                return renderSsrTextExpression(target, captureValues, qrl as never);
              });
            } else {
              throw new Error('dynamic text needs a signal-read ir or an expression segment');
            }
            if (planTarget.kind === 'range') {
              // range text is fenced by <!t> markers at emit time (derived, not in statics)
              parts.push('<!t>', escapeHTML(text as string), '<!/t>');
            } else {
              parts.push(escapeHTML(text as string));
            }
            break;
          }
          case 'branch': {
            const thenSegment = op.then.segment;
            const elseSegment = op.else?.segment;
            if (thenSegment === undefined || (op.else !== null && elseSegment === undefined)) {
              throw new Error('branch arms must reference render segments');
            }
            const id = ctx.nextId();
            const rendered = await invoke(invokeCtx, () => {
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
            parts.push(createSsrRecord('<!b=', createSsrNodeId(id), '>'));
            parts.push(rendered);
            parts.push('<!/b>');
            break;
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
            const rendered = await invoke(invokeCtx, () => {
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
            parts.push(rendered);
            break;
          }
          case 'slot': {
            const fallbackSegment = op.fallback?.segment;
            const fallbackQrl =
              op.fallback === null
                ? undefined
                : fallbackSegment === undefined
                  ? undefined
                  : qrlWithCaptures(fallbackSegment);
            const rendered = await invoke(invokeCtx, () =>
              renderSsrSlot(ctx as never, op.name, fallbackQrl as never, invokeCtx as never)
            );
            parts.push(rendered);
            break;
          }
          default:
            throw new Error(`interpreter cannot render op "${op.o}" yet`);
        }
      }
      return parts;
    };

    const run = () => interpretOps(ssr.ops);
    return ssr.flushTasks
      ? maybeThen(ctx.scheduler.flush(), () => invoke(invokeCtx, run))
      : invoke(invokeCtx, run);
  }
}
