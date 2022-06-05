import { assertDefined } from '../assert/assert';
import { QHostAttr } from '../util/markers';
import { executeContextWithSlots, printRenderStats, RenderContext } from './cursor';
import { getContext, resumeIfNeeded } from '../props/props';
import { qDev, qTest } from '../util/qdev';
import { getPlatform } from '../platform/platform';
import { getDocument } from '../util/dom';
import { renderComponent } from '../component/component-ctx';
import { logError, logWarn } from '../util/log';
import { getContainer } from '../use/use-core';
import { runWatch, WatchDescriptor, WatchFlags } from '../watch/watch.public';
import { createSubscriptionManager, ObjToProxyMap, SubscriptionManager } from '../object/q-object';
import { then } from '../util/promises';
import type { ValueOrPromise } from '../util/types';
import type { CorePlatform } from '../platform/types';

/**
 * Mark component for rendering.
 *
 * Use `notifyRender` method to mark a component for rendering at some later point in time.
 * This method uses `getPlatform(doc).queueRender` for scheduling of the rendering. The
 * default implementation of the method is to use `requestAnimationFrame` to do actual rendering.
 *
 * The method is intended to coalesce multiple calls into `notifyRender` into a single call for
 * rendering.
 *
 * @param hostElement - Host-element of the component to re-render.
 * @returns A promise which is resolved when the component has been rendered.
 * @public
 */
export async function notifyRender(hostElement: Element): Promise<RenderContext | undefined> {
  assertDefined(hostElement.getAttribute(QHostAttr));

  const containerEl = getContainer(hostElement)!;
  assertDefined(containerEl);

  const state = getContainerState(containerEl);
  if (state.platform.isServer && !qTest) {
    logWarn('Can not rerender in server platform');
    return undefined;
  }
  resumeIfNeeded(containerEl);

  const ctx = getContext(hostElement);
  assertDefined(ctx.renderQrl);

  if (ctx.dirty) {
    return state.renderPromise;
  }
  ctx.dirty = true;
  const activeRendering = state.hostsRendering !== undefined;
  if (activeRendering) {
    state.hostsStaging.add(hostElement);
    return state.renderPromise!.then((ctx) => {
      if (state.hostsNext.has(hostElement)) {
        // TODO
        return state.renderPromise!;
      } else {
        return ctx;
      }
    });
  } else {
    state.hostsNext.add(hostElement);
    return scheduleFrame(containerEl, state);
  }
}

export function scheduleFrame(
  containerEl: Element,
  containerState: ContainerState
): Promise<RenderContext> {
  if (containerState.renderPromise === undefined) {
    containerState.renderPromise = containerState.platform.nextTick(() =>
      renderMarked(containerEl, containerState)
    );
  }
  return containerState.renderPromise;
}

const CONTAINER_STATE = Symbol('ContainerState');

/**
 * @alpha
 */
export interface ContainerState {
  proxyMap: ObjToProxyMap;
  subsManager: SubscriptionManager;
  platform: CorePlatform;

  watchNext: Set<WatchDescriptor>;
  watchStaging: Set<WatchDescriptor>;

  hostsNext: Set<Element>;
  hostsStaging: Set<Element>;
  hostsRendering: Set<Element> | undefined;
  renderPromise: Promise<RenderContext> | undefined;
}

export function getContainerState(containerEl: Element): ContainerState {
  let set = (containerEl as any)[CONTAINER_STATE] as ContainerState;
  if (!set) {
    (containerEl as any)[CONTAINER_STATE] = set = {
      proxyMap: new WeakMap(),
      subsManager: createSubscriptionManager(),
      platform: getPlatform(containerEl),

      watchNext: new Set(),
      watchStaging: new Set(),

      hostsNext: new Set(),
      hostsStaging: new Set(),
      renderPromise: undefined,
      hostsRendering: undefined,
    };
  }
  return set;
}

export async function renderMarked(
  containerEl: Element,
  containerState: ContainerState
): Promise<RenderContext> {
  const hostsRendering = (containerState.hostsRendering = new Set(containerState.hostsNext));
  containerState.hostsNext.clear();
  await executeWatches(containerState, (watch) => {
    return (watch.f & WatchFlags.IsWatch) !== 0;
  });
  containerState.hostsStaging.forEach((host) => {
    hostsRendering.add(host);
  });
  containerState.hostsStaging.clear();

  const doc = getDocument(containerEl);
  const platform = containerState.platform;
  const renderingQueue = Array.from(hostsRendering);
  sortNodes(renderingQueue);

  const ctx: RenderContext = {
    doc,
    containerState,
    hostElements: new Set(),
    operations: [],
    roots: [],
    containerEl,
    components: [],
    perf: {
      visited: 0,
      timing: [],
    },
  };

  for (const el of renderingQueue) {
    if (!ctx.hostElements.has(el)) {
      ctx.roots.push(el);
      try {
        await renderComponent(ctx, getContext(el));
      } catch (e) {
        logError('Render error', e);
      }
    }
  }

  // Early exist, no dom operations
  if (ctx.operations.length === 0) {
    if (qDev) {
      if (typeof window !== 'undefined' && window.document != null) {
        printRenderStats(ctx);
      }
    }
    postRendering(containerEl, containerState, ctx);
    return ctx;
  }

  return platform.raf(() => {
    executeContextWithSlots(ctx);
    if (qDev) {
      if (typeof window !== 'undefined' && window.document != null) {
        printRenderStats(ctx);
      }
    }
    postRendering(containerEl, containerState, ctx);
    return ctx;
  });
}

async function postRendering(
  containerEl: Element,
  containerState: ContainerState,
  ctx: RenderContext
) {
  await executeWatches(containerState, (watch, stage) => {
    if ((watch.f & WatchFlags.IsEffect) === 0) {
      return false;
    }
    if (stage) {
      return ctx.hostElements.has(watch.el);
    }
    return true;
  });

  // Clear staging
  containerState.hostsStaging.forEach((el) => {
    containerState.hostsNext.add(el);
  });
  containerState.hostsStaging.clear();

  containerState.hostsRendering = undefined;
  containerState.renderPromise = undefined;

  if (containerState.hostsNext.size + containerState.watchNext.size > 0) {
    scheduleFrame(containerEl, containerState);
  }
}

async function executeWatches(
  containerState: ContainerState,
  watchPred: (watch: WatchDescriptor, staging: boolean) => boolean
) {
  const watchPromises: ValueOrPromise<WatchDescriptor>[] = [];

  containerState.watchNext.forEach((watch) => {
    if (watchPred(watch, false)) {
      watchPromises.push(then(watch.qrl.resolveIfNeeded(watch.el), () => watch));
      containerState.watchNext.delete(watch);
    }
  });
  do {
    // Run staging effected
    containerState.watchStaging.forEach((watch) => {
      if (watchPred(watch, true)) {
        watchPromises.push(then(watch.qrl.resolveIfNeeded(watch.el), () => watch));
      } else {
        containerState.watchNext.add(watch);
      }
    });
    containerState.watchStaging.clear();

    // Wait for all promises
    if (watchPromises.length > 0) {
      const watches = await Promise.all(watchPromises);
      sortWatches(watches);
      await Promise.all(
        watches.map((watch) => {
          return runWatch(watch, containerState);
        })
      );
      watchPromises.length = 0;
    }
  } while (containerState.watchStaging.size > 0);
}

function sortNodes(elements: Element[]) {
  elements.sort((a, b) => (a.compareDocumentPosition(b) & 2 ? 1 : -1));
}

function sortWatches(watches: WatchDescriptor[]) {
  watches.sort((a, b) => {
    if (a.el === b.el) {
      return a.i < b.i ? -1 : 1;
    }
    return (a.el.compareDocumentPosition(b.el) & 2) !== 0 ? 1 : -1;
  });
}
