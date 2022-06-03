import { assertDefined } from '../assert/assert';
import { QHostAttr } from '../util/markers';
import { executeContextWithSlots, printRenderStats, RenderContext } from './cursor';
import { getContext, resumeIfNeeded } from '../props/props';
import { qDev } from '../util/qdev';
import { getPlatform } from '../platform/platform';
import { getDocument } from '../util/dom';
import { renderComponent } from '../component/component-ctx';
import { logError } from '../util/log';
import { getContainer } from '../use/use-core';
import { runWatch, WatchDescriptor } from '../watch/watch.public';
import {
  createSubscriptionManager,
  ObjToProxyMap,
  SubscriptionManager,
  waitForWatches,
} from '../object/q-object';

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
export function notifyRender(hostElement: Element): Promise<RenderContext> {
  assertDefined(hostElement.getAttribute(QHostAttr));

  const containerEl = getContainer(hostElement)!;
  assertDefined(containerEl);
  resumeIfNeeded(containerEl);

  const ctx = getContext(hostElement);
  assertDefined(ctx.renderQrl);
  const state = getContainerState(containerEl);
  if (ctx.dirty) {
    // TODO
    return state.renderPromise!;
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

export function scheduleFrame(containerEl: Element, state: ContainerState): Promise<RenderContext> {
  if (state.renderPromise === undefined) {
    state.renderPromise = getPlatform(containerEl).nextTick(() => renderMarked(containerEl, state));
  }
  return state.renderPromise;
}

const SCHEDULE = Symbol('Render state');

/**
 * @alpha
 */
export interface ContainerState {
  proxyMap: ObjToProxyMap;
  subsManager: SubscriptionManager;

  watchRunning: Set<Promise<WatchDescriptor>>;
  watchNext: Set<WatchDescriptor>;
  watchStaging: Set<WatchDescriptor>;

  hostsNext: Set<Element>;
  hostsStaging: Set<Element>;
  hostsRendering: Set<Element> | undefined;
  renderPromise: Promise<RenderContext> | undefined;
}

export function getContainerState(containerEl: Element): ContainerState {
  let set = (containerEl as any)[SCHEDULE] as ContainerState;
  if (!set) {
    (containerEl as any)[SCHEDULE] = set = {
      proxyMap: new WeakMap(),
      subsManager: createSubscriptionManager(),

      watchNext: new Set(),
      watchStaging: new Set(),
      watchRunning: new Set(),

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
  state: ContainerState
): Promise<RenderContext> {
  await waitForWatches(state);

  state.hostsRendering = new Set(state.hostsNext);
  state.hostsNext.clear();

  const doc = getDocument(containerEl);
  const platform = getPlatform(containerEl);
  const renderingQueue = Array.from(state.hostsRendering);
  sortNodes(renderingQueue);

  const ctx: RenderContext = {
    doc,
    containerState: state,
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
        logError('Render failed', e, el);
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
    postRendering(containerEl, state, ctx);
    return ctx;
  }

  return platform.raf(() => {
    executeContextWithSlots(ctx);
    if (qDev) {
      if (typeof window !== 'undefined' && window.document != null) {
        printRenderStats(ctx);
      }
    }
    postRendering(containerEl, state, ctx);
    return ctx;
  });
}

async function postRendering(
  containerEl: Element,
  containerState: ContainerState,
  ctx: RenderContext
) {
  // Run useEffect() watch
  const promises: Promise<WatchDescriptor>[] = [];
  containerState.watchNext.forEach((watch) => {
    promises.push(runWatch(watch, containerState));
  });
  containerState.watchNext.clear();

  // Run staging effected
  containerState.watchStaging.forEach((watch) => {
    if (ctx.hostElements.has(watch.el)) {
      promises.push(runWatch(watch, containerState));
    } else {
      containerState.watchNext.add(watch);
    }
  });
  containerState.watchStaging.clear();

  // Wait for all promises
  if (promises.length > 0) {
    await Promise.all(promises);
    // Clear staging
    containerState.watchStaging.forEach((watch) => {
      containerState.watchNext.add(watch);
    });
    containerState.watchStaging.clear();
  }

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

function sortNodes(elements: Element[]) {
  elements.sort((a, b) => (a.compareDocumentPosition(b) & 2 ? 1 : -1));
}
