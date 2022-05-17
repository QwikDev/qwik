import { assertDefined } from '../assert/assert';
import { QHostAttr } from '../util/markers';
import { executeContextWithSlots, printRenderStats, RenderContext } from './cursor';
import { getContext, resumeIfNeeded } from '../props/props';
import { qDev } from '../util/qdev';
import { getPlatform } from '../platform/platform';
import { getDocument } from '../util/dom';
import { renderComponent } from '../component/component-ctx';
import { logDebug, logError } from '../util/log';
import { getContainer } from '../use/use-core';
import { runWatch, WatchDescriptor } from '../watch/watch.public';
import { waitForWatches } from '../object/q-object';

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
  const state = getRenderingState(containerEl);
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

export function scheduleFrame(containerEl: Element, state: RenderingState): Promise<RenderContext> {
  if (state.renderPromise === undefined) {
    state.renderPromise = getPlatform(containerEl).nextTick(() => renderMarked(containerEl, state));
  }
  return state.renderPromise;
}

const SCHEDULE = Symbol('Render state');

/**
 * @alpha
 */
export interface RenderingState {
  watchRunning: Set<Promise<WatchDescriptor>>;
  watchNext: Set<WatchDescriptor>;
  watchStaging: Set<WatchDescriptor>;

  hostsNext: Set<Element>;
  hostsStaging: Set<Element>;
  hostsRendering: Set<Element> | undefined;
  renderPromise: Promise<RenderContext> | undefined;
}

export function getRenderingState(containerEl: Element): RenderingState {
  let set = (containerEl as any)[SCHEDULE] as RenderingState;
  if (!set) {
    (containerEl as any)[SCHEDULE] = set = {
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
  state: RenderingState
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
    globalState: state,
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
        logDebug('Render skipped. No operations.');
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

async function postRendering(containerEl: Element, state: RenderingState, ctx: RenderContext) {
  // Run useEffect() watch
  const promises: Promise<WatchDescriptor>[] = [];
  state.watchNext.forEach((watch) => {
    promises.push(runWatch(watch));
  });
  state.watchNext.clear();

  // Run staging effected
  state.watchStaging.forEach((watch) => {
    if (ctx.hostElements.has(watch.el)) {
      promises.push(runWatch(watch));
    } else {
      state.watchNext.add(watch);
    }
  });
  state.watchStaging.clear();

  // Wait for all promises
  await Promise.all(promises);

  // Clear staging
  state.hostsStaging.forEach((el) => {
    state.hostsNext.add(el);
  });
  state.hostsStaging.clear();

  // Clear staging
  state.watchStaging.forEach((watch) => {
    state.watchNext.add(watch);
  });
  state.watchStaging.clear();

  state.hostsRendering = undefined;
  state.renderPromise = undefined;

  if (state.hostsNext.size + state.watchNext.size > 0) {
    scheduleFrame(containerEl, state);
  }
}

function sortNodes(elements: Element[]) {
  elements.sort((a, b) => (a.compareDocumentPosition(b) & 2 ? 1 : -1));
}
