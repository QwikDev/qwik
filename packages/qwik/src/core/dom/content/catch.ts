import { isDev, isServer } from '@qwik.dev/core/build';
import type { QRL } from '../../shared/qrl/qrl.public';
import type { Component } from '../../shared/component.public';
import type { JSXOutput } from '../../shared/jsx/types/jsx-node';
import { Brand, brandClass, hasBrand } from '../../shared/utils/brand';
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
import { createSsrNodeId, type SsrOutput, type SsrCatchController } from '../../ssr/output';
import { EMPTY_NODES } from '../../utils/consts';
import {
  ContentBlock,
  ContentSubscription,
  SSRContent,
  SSRContentSubscription,
  type ContentFn,
  type SsrContentFn,
} from './content';
import { CatchPhase, registerCatchBoundary, handleError } from './catch-boundary';
import type { SsrRangeHost } from '../../ssr/output';
import { logError } from '../../shared/utils/log';
import { CONTENT_OPEN } from '../../runtime/node-walker';

/** What `onError$` learns about a caught error. @public */
export interface CatchInfo {
  phase: CatchPhase;
  /**
   * The boundary's range id: the server and the resumed client report the same one. Empty for a
   * boundary first rendered on the client.
   */
  boundaryId: string;
  /** The code a production fallback shows for a server error, to match a report to your logs. */
  digest: string;
}

/** @public */
export interface CatchProps {
  readonly fallback$: QRL<(error: Error & { digest?: string }) => JSXOutput>;
  /**
   * Called when the boundary catches, for reporting only. A non-Error throw arrives wrapped, with
   * the thrown value as `cause`. An error caught during SSR is reported on the server only.
   */
  readonly onError$?: QRL<(error: Error, info: CatchInfo) => void>;
}

type CatchErrorHandler = (error: Error, info: CatchInfo) => unknown;

/** Compiler marker for a render error boundary. @public */
export const Catch: Component<CatchProps> = () => null;

export class CatchContentSubscription extends ContentSubscription {
  error?: Error;

  constructor(
    block: ContentBlock,
    readonly fallbackQrl: QRL<ContentFn>,
    scheduler?: Scheduler,
    readonly onError?: CatchErrorHandler
  ) {
    super(block, scheduler);
    // Branded on first use, not at load, so an app without a Catch drops the class.
    if (!hasBrand(this, Brand.CatchContentSubscription)) {
      brandClass(CatchContentSubscription, Brand.CatchContentSubscription);
    }
  }

  registerRenderBoundary(invokeContext: RuntimeInvokeContext): void {
    if (this.error === undefined) {
      registerCatchBoundary(getOrCreateContextOwner(invokeContext)!, this);
    }
  }

  catchError(error: unknown, phase?: CatchPhase): ValueOrPromise<readonly Node[]> {
    if (isSubscriberDisposed(this) || this.error !== undefined) {
      return EMPTY_NODES;
    }
    this.error = toCatchError(error);
    const previous = this.block;
    if (this.onError !== undefined) {
      // A resumed boundary keeps the range id the server reported; one rendered here has none.
      reportCatchError(
        this.onError,
        this.error,
        phase,
        previous.start.data.slice(CONTENT_OPEN.length)
      );
    }
    try {
      previous.dispose();
    } finally {
      cleanupDeps(this);
      this.block = new ContentBlock<unknown[]>(
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
  start: Comment,
  end: Comment,
  contentQrl: QRL<ContentFn>,
  fallbackQrl: QRL<ContentFn>,
  onError?: CatchErrorHandler
): CatchContentSubscription {
  const block = new ContentBlock<unknown[]>(
    start,
    end,
    [],
    contentQrl,
    getActiveInvokeContextOrNull(),
    ctx,
    false,
    true
  );
  const boundary = registerSubscriberToOwner(
    new CatchContentSubscription(block, fallbackQrl, ctx.scheduler, onError)
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
    readonly fallbackQrl: QRL<SsrContentFn>,
    readonly onError?: CatchErrorHandler
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

  catchError(error: unknown, phase?: CatchPhase): ValueOrPromise<void> {
    if (this.controller === undefined) {
      throw error;
    }
    return this.controller.catchError(error, phase);
  }
}

export function createSsrCatch(
  host: SsrRangeHost & { markCaughtError?(): void },
  rangeId: number,
  contentQrl: QRL<(ctx: SsrRangeHost) => ValueOrPromise<SsrOutput>>,
  fallbackQrl: QRL<SsrContentFn>,
  onError?: CatchErrorHandler
): ValueOrPromise<SsrOutput> {
  host.registerCatchErrorHandler();
  const invokeContext = getActiveInvokeContextOrNull();
  let scope = host.createRangeScope(rangeId);
  let boundary = createBoundary(contentQrl as QRL<SsrContentFn>, [], scope);
  const controller: SsrCatchController = {
    generation: 0,
    published: false,
    output: '',
    parent: host.catchBoundary,
    catchError(error, phase) {
      if (boundary.error !== undefined) {
        return;
      }
      const caught = toCatchError(error);
      if (onError !== undefined) {
        reportCatchError(onError, caught, phase, createSsrNodeId(rangeId));
      }
      const displayed = displayCatchError(caught);
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
      fallbackQrl,
      onError
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
  // `cause` is not enumerable, so it never serializes with the error.
  return new Error(message, { cause: error });
}

function displayCatchError(error: unknown): Error & { digest?: string } {
  let displayed = toCatchError(error) as Error & { digest?: string };
  if (!isDev) {
    const digest = errorDigest(displayed);
    displayed = new Error('An error occurred');
    displayed.digest = digest;
  }
  return displayed;
}

function errorDigest(error: Error): string {
  let source = 'unknown';
  try {
    source = `${error.name}: ${error.message}\n${error.stack ?? ''}`;
  } catch {
    /* Error properties can be hostile getters. */
  }
  return hashCode(source);
}

/** Runs `onError$` for its side effect; its own failure is only logged. */
function reportCatchError(
  onError: CatchErrorHandler,
  error: Error,
  phase: CatchPhase = CatchPhase.Render,
  boundaryId: string
): void {
  try {
    const reported = onError(error, {
      phase,
      boundaryId,
      digest: errorDigest(error),
    });
    if (isPromise(reported)) {
      reported.catch(logError);
    }
  } catch (callbackError) {
    logError(callbackError);
  }
}

isServer && brandClass(SSRCatchContentSubscription, Brand.SsrCatchContentSubscription);
