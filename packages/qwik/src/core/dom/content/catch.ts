import { isDev, isServer } from '@qwik.dev/core/build';
import type { QRL } from '../../shared/qrl/qrl.public';
import type { Component } from '../../shared/component.public';
import type { JSXOutput } from '../../shared/jsx/types/jsx-node';
import { Brand, brandClass } from '../../shared/utils/brand';
import { hashCode } from '../../shared/utils/hash_code';
import { isPromise, maybeThen, safeCall } from '../../shared/utils/promises';
import type { ValueOrPromise } from '../../shared/utils/types';
import { cleanupDeps } from '../../reactive/cleanup';
import type { ContainerContext } from '../../runtime/container-context';
import {
  getActiveInvokeContextOrNull,
  invoke,
  type RuntimeInvokeContext,
} from '../../runtime/invoke-context';
import { getOrCreateContextOwner, registerSubscriberToOwner } from '../../runtime/owner';
import type { Scheduler } from '../../runtime/scheduler';
import { isSubscriberDisposed } from '../../runtime/subscriber';
import { resolveSsrOutput, type SsrOutput } from '../../ssr/output';
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
import { registerCatchBoundary } from './catch-boundary';
import type { SsrRangeHost } from './suspense-ssr';

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

  run(): ValueOrPromise<readonly Node[]> {
    if (this.error !== undefined) {
      return super.run();
    }
    return isSubscriberDisposed(this)
      ? EMPTY_NODES
      : safeCall(
          () => this.block.run(this),
          (nodes) => nodes,
          (error) => this.catchError(error)
        );
  }

  catchError(error: unknown): ValueOrPromise<readonly Node[]> {
    if (isSubscriberDisposed(this) || this.error !== undefined) {
      return EMPTY_NODES;
    }
    this.error = toCatchError(error);
    const previous = this.block;
    previous.dispose();
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

  constructor(
    content: SSRContent,
    readonly fallbackQrl: QRL<SsrContentFn>
  ) {
    super(content);
  }

  registerRenderBoundary(invokeContext: RuntimeInvokeContext): void {
    if (this.error === undefined) {
      registerCatchBoundary(getOrCreateContextOwner(invokeContext)!, this);
    }
  }

  catchError(error: unknown): never {
    throw error;
  }
}

export function createSsrCatch(
  host: SsrRangeHost & { markCaughtError?(): void },
  rangeId: number,
  contentQrl: QRL<(ctx: SsrRangeHost) => ValueOrPromise<SsrOutput>>,
  fallbackQrl: QRL<SsrContentFn>
): ValueOrPromise<SsrOutput> {
  let scope = host.createRangeScope(rangeId);
  scope.canDefer = false;
  const invokeContext = getActiveInvokeContextOrNull();
  const boundary = new SSRCatchContentSubscription(
    new SSRContent<unknown[]>(
      rangeId,
      [],
      contentQrl as never,
      invokeContext,
      scope as never,
      false,
      true
    ),
    fallbackQrl
  );
  host.addRoot(boundary);
  const render = () =>
    invoke(invokeContext, () =>
      maybeThen(boundary.content.run(undefined, boundary), resolveSsrOutput)
    );
  const rendered = safeCall(
    render,
    (output) => output,
    (error) => {
      if (error instanceof Error && 'plugin' in error) {
        throw error;
      }
      boundary.dispose();
      scope.cancel?.();
      host.markCaughtError?.();
      let displayed = toCatchError(error) as Error & { digest?: string };
      if (!isDev) {
        let source = 'unknown';
        try {
          source = `${displayed.name}: ${displayed.message}\n${displayed.stack ?? ''}`;
        } catch {
          // Error properties can be hostile getters.
        }
        displayed = new Error('An error occurred');
        displayed.digest = hashCode(source);
      }
      boundary.error = displayed;
      scope = host.createRangeScope(rangeId);
      scope.canDefer = false;
      boundary.content = new SSRContent<unknown[]>(
        rangeId,
        [displayed],
        fallbackQrl,
        invokeContext,
        scope as never,
        false,
        true
      );
      return render();
    }
  );
  return maybeThen(rendered, (output) => host.wrapRange(rangeId, output));
}

/** A fallback always receives an Error, including nullish throws. */
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

isServer && brandClass(SSRCatchContentSubscription, Brand.SsrCatchContentSubscription);
