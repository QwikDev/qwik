import { isDev, isServer } from '@qwik.dev/core/build';
import type { QRL } from '../../shared/qrl/qrl.public';
import { createQRL } from '../../shared/qrl/qrl-class';
import type { Component } from '../../shared/component.public';
import type { JSXOutput } from '../../shared/jsx/types/jsx-node';
import { Brand, brandClass } from '../../shared/utils/brand';
import { hashCode } from '../../shared/utils/hash_code';
import { isPromise, maybeThen, safeCall } from '../../shared/utils/promises';
import type { ValueOrPromise } from '../../shared/utils/types';
import { cleanupDeps, disposeSubscriber } from '../../reactive/cleanup';
import type { ContainerContext } from '../../runtime/container-context';
import {
  getActiveInvokeContextOrNull,
  invoke,
  type RuntimeInvokeContext,
} from '../../runtime/invoke-context';
import { getOrCreateContextOwner, registerSubscriberToOwner } from '../../runtime/owner';
import type { Scheduler } from '../../runtime/scheduler';
import { isSubscriberDisposed } from '../../runtime/subscriber';
import type { SsrOutput, SsrCatchController } from '../../ssr/output';
import { EMPTY_NODES } from '../../utils/consts';
import type { BranchRange } from '../branch/branch';
import {
  ContentBlock,
  ContentSubscription,
  SSRContent,
  SSRContentSubscription,
  type ContentFn,
  type SsrContentFn,
} from './content';
import { registerCatchBoundary, handleError } from './catch-boundary';
import type { SsrRangeHost } from '../../ssr/output';
import { useOnDocument } from '../../runtime/use-on';
import { _catchError } from './catch-event';

/** @public */
export interface CatchProps {
  readonly fallback$: QRL<(error: Error & { digest?: string }) => JSXOutput>;
}

/** Compiler marker for a render error boundary. @public */
export const Catch: Component<CatchProps> = () => null;

export class CatchContentSubscription extends ContentSubscription {
  error?: Error;

  constructor(
    block: ContentBlock,
    readonly fallbackQrl: QRL<ContentFn>,
    scheduler?: Scheduler
  ) {
    super(block, scheduler);
  }

  registerRenderBoundary(invokeContext: RuntimeInvokeContext): void {
    if (this.error === undefined) {
      registerCatchBoundary(getOrCreateContextOwner(invokeContext)!, this);
    }
  }

  catchError(error: unknown): ValueOrPromise<readonly Node[]> {
    if (isSubscriberDisposed(this) || this.error !== undefined) {
      return EMPTY_NODES;
    }
    this.error = toCatchError(error);
    const previous = this.block;
    try {
      previous.dispose();
    } finally {
      cleanupDeps(this);
      this.block = new ContentBlock<unknown[]>(
        previous.document,
        previous.start,
        previous.end,
        [this.error],
        this.fallbackQrl,
        previous.invokeContext,
        previous.container,
        false,
        true
      );
    }
    const output = this.run();
    if (isPromise(output)) {
      this.scheduler.waitFor(output, this.owner);
    }
    return output;
  }
}

export function createCatch(
  ctx: ContainerContext,
  range: BranchRange,
  contentQrl: QRL<ContentFn>,
  fallbackQrl: QRL<ContentFn>
): CatchContentSubscription {
  registerCatchErrorHandler();
  const block = new ContentBlock<unknown[]>(
    ctx.document,
    range.start,
    range.end,
    [],
    contentQrl,
    getActiveInvokeContextOrNull(),
    ctx,
    false,
    true
  );
  const boundary = registerSubscriberToOwner(
    new CatchContentSubscription(block, fallbackQrl, ctx.scheduler)
  );
  const output = boundary.run();
  if (isPromise(output)) {
    ctx.scheduler.waitFor(output, boundary.owner);
  }
  return boundary;
}

export class SSRCatchContentSubscription extends SSRContentSubscription {
  error?: Error;
  controller?: SsrCatchController;

  constructor(
    content: SSRContent,
    readonly fallbackQrl: QRL<SsrContentFn>
  ) {
    super(content);
  }

  registerRenderBoundary(invokeContext: RuntimeInvokeContext): void {
    if (this.error === undefined) {
      const owner = getOrCreateContextOwner(invokeContext)!;
      registerCatchBoundary(owner, this);
      this.controller!.owner = owner;
    }
  }

  catchError(error: unknown): ValueOrPromise<void> {
    if (this.controller === undefined) {
      throw error;
    }
    return this.controller.catchError(error);
  }
}

export function createSsrCatch(
  host: SsrRangeHost & { markCaughtError?(): void },
  rangeId: number,
  contentQrl: QRL<(ctx: SsrRangeHost) => ValueOrPromise<SsrOutput>>,
  fallbackQrl: QRL<SsrContentFn>
): ValueOrPromise<SsrOutput> {
  registerCatchErrorHandler();
  const invokeContext = getActiveInvokeContextOrNull();
  let scope = host.createRangeScope(rangeId);
  let boundary = createBoundary(contentQrl as QRL<SsrContentFn>, [], scope);
  const controller: SsrCatchController = {
    generation: 0,
    published: false,
    output: '',
    parent: host.catchBoundary,
    catchError(error) {
      if (boundary.error !== undefined) {
        return;
      }
      const displayed = displayCatchError(error);
      boundary.error = displayed;
      controller.generation++;
      const previous = boundary;
      try {
        disposeSubscriber(previous);
      } finally {
        scope.cancel?.();
      }
      host.markCaughtError?.();
      scope = host.createRangeScope(rangeId);
      boundary = createBoundary(fallbackQrl, [displayed], scope);
      boundary.error = displayed;
      const fallback = render();
      const wrapped = maybeThen(fallback, (output) => host.wrapRange(rangeId, output));
      controller.output = isPromise(wrapped) ? Promise.resolve(wrapped) : wrapped;
      if (isPromise(controller.output)) {
        controller.output.catch(() => {});
      }
      if (controller.published) {
        scope.defer(
          {
            id: rangeId,
            parentId: null,
            contentRoot: boundary,
            placeholderRoot: previous,
          },
          Promise.resolve(fallback)
        );
      }
      return maybeThen(fallback, () => {});
    },
  };
  boundary.controller = controller;
  scope.catchBoundary = controller;

  function createBoundary(qrl: QRL<SsrContentFn>, args: unknown[], scope: typeof host) {
    return new SSRCatchContentSubscription(
      new SSRContent(rangeId, args, qrl, invokeContext, scope, false, true),
      fallbackQrl
    );
  }

  function render(): ValueOrPromise<SsrOutput> {
    const current = boundary;
    const currentScope = scope;
    return invoke(invokeContext, () =>
      maybeThen(current.content.run(undefined, current), (output) => {
        currentScope.reparentRanges();
        const result: SsrOutput = [
          {
            type: 'publication',
            owner: null,
            roots: [current],
            subscription: current,
            boundary: current.error === undefined ? controller : host.catchBoundary,
          },
          output,
        ];
        return controller.reapplyUseOn?.(result) ?? result;
      })
    );
  }

  const initialGeneration = controller.generation;
  const initial = safeCall(
    render,
    (output) => {
      if (controller.generation === initialGeneration) {
        controller.output = host.wrapRange(rangeId, output);
      }
      return controller.output;
    },
    (error) => maybeThen(handleError(controller.owner ?? null, error), () => controller.output)
  );
  return maybeThen(initial, () => ({ type: 'catch', boundary: controller }));
}

function registerCatchErrorHandler(): void {
  const context = getActiveInvokeContextOrNull();
  if (context !== null && !context.hasCatchErrorHandler) {
    context.hasCatchErrorHandler = true;
    useOnDocument('qerror', createQRL(null, '_catchError', isServer ? null : _catchError));
  }
}

function toCatchError(error: unknown): Error {
  let message = 'An error occurred';
  try {
    if (error instanceof Error) {
      return error;
    }
    message = String(error);
  } catch {
    // A thrown value may reject coercion.
  }
  return new Error(message);
}

function displayCatchError(error: unknown): Error & { digest?: string } {
  let displayed = toCatchError(error) as Error & { digest?: string };
  if (!isDev) {
    let source = 'unknown';
    try {
      source = `${displayed.name}: ${displayed.message}\n${displayed.stack ?? ''}`;
    } catch {
      /* Error properties can be hostile getters. */
    }
    displayed = new Error('An error occurred');
    displayed.digest = hashCode(source);
  }
  return displayed;
}

brandClass(CatchContentSubscription, Brand.CatchContentSubscription);
isServer && brandClass(SSRCatchContentSubscription, Brand.SsrCatchContentSubscription);
