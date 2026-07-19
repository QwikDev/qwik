import { cleanupDeps } from '../../reactive/cleanup';
import { SubscriberFlags } from '../../reactive/flags';
import type { Source } from '../../reactive/source';
import { getActiveCollector, runWithCollector } from '../../reactive/tracking';
import { getActiveInvokeContextOrNull } from '../../runtime/invoke-context';
import { registerSubscriberToOwner, type Owner } from '../../runtime/owner';
import { defaultScheduler, type Scheduler } from '../../runtime/scheduler';
import { SubscriberKind, type DomSubscriber } from '../../runtime/subscriber';
import { retryOnPromise } from '../../shared/utils/promises';
import type { ValueOrPromise } from '../../shared/utils/types';

export interface DomEffect {
  run(): ValueOrPromise<void>;
}

export class DomSubscription implements DomSubscriber {
  readonly kind = SubscriberKind.Dom;
  owner: Owner | null = null;
  flags = SubscriberFlags.None;
  deps: Source[] | null = null;
  depVersions: number[] | null = null;
  declare private asyncGeneration: number | undefined;
  declare private asyncInvalidation: Promise<void> | undefined;
  declare private invalidateAsync: (() => void) | undefined;

  constructor(
    readonly effect: DomEffect,
    readonly scheduler: Scheduler = defaultScheduler
  ) {}

  invalidate(): void {
    const invalidate = this.invalidateAsync;
    if (invalidate !== undefined) {
      this.asyncInvalidation = this.invalidateAsync = undefined;
      this.asyncGeneration!++;
      invalidate();
    }
  }

  run(): ValueOrPromise<void> {
    if (this.owner === null) {
      return;
    }
    this.invalidate();
    return retryOnPromise(() => {
      cleanupDeps(this);
      return this.owner === null ? undefined : runWithCollector(this, () => this.effect.run());
    });
  }

  trackPromise<T>(promise: Promise<T>, commit: (value: T) => void): Promise<void> {
    const generation = (this.asyncGeneration ??= 0);
    const invalidation = (this.asyncInvalidation ??= new Promise<void>((resolve) => {
      this.invalidateAsync = resolve;
    }));
    const pending = Promise.race([
      promise.then((value) => {
        if (this.owner !== null && generation === this.asyncGeneration) {
          commit(value);
        }
      }),
      invalidation,
    ]);
    this.scheduler.waitFor(pending);
    return pending;
  }
}

export function createDomSubscription(
  effect: DomEffect,
  scheduler: Scheduler | undefined
): DomSubscriber {
  return registerSubscriberToOwner(new DomSubscription(effect, scheduler ?? getActiveScheduler()));
}

export function commitDomPromise<T>(
  promise: Promise<T>,
  commit: (value: T) => void
): Promise<void> {
  const collector = getActiveCollector();
  if (collector?.kind === SubscriberKind.Dom) {
    return (collector as DomSubscriber).trackPromise(promise, commit);
  }
  return promise.then(commit);
}

function getActiveScheduler(): Scheduler {
  return getActiveInvokeContextOrNull()?.container?.scheduler ?? defaultScheduler;
}
