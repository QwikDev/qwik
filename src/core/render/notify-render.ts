import { assertDefined } from '../assert/assert';
import { QHostAttr } from '../util/markers';
import { getQComponent } from '../component/component-ctx';
import { executeContextWithSlots, printRenderStats, RenderContext } from './cursor';
import { getContext } from '../props/props';
import { qDev } from '../util/qdev';
import { getPlatform } from '../index';
import { getDocument } from '../util/dom';

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
// TODO(misko): tests
// TODO(misko): this should take QComponent as well.
export function notifyRender(hostElement: Element): Promise<RenderContext> {
  assertDefined(hostElement.getAttribute(QHostAttr));
  const ctx = getContext(hostElement);
  const doc = getDocument(hostElement);
  const state = getRenderingState(doc);
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
    return scheduleFrame(doc, state);
  }
}

export function scheduleFrame(doc: Document, state: RenderingState): Promise<RenderContext> {
  if (state.renderPromise === undefined) {
    state.renderPromise = getPlatform(doc).nextTick(() => renderMarked(doc, state));
  }
  return state.renderPromise;
}

const SCHEDULE = Symbol();

export interface RenderingState {
  hostsNext: Set<Element>;
  hostsStaging: Set<Element>;
  hostsRendering: Set<Element> | undefined;
  renderPromise: Promise<RenderContext> | undefined;
}

export function getRenderingState(doc: Document): RenderingState {
  let set = (doc as any)[SCHEDULE] as RenderingState;
  if (!set) {
    (doc as any)[SCHEDULE] = set = {
      hostsNext: new Set(),
      hostsStaging: new Set(),
      renderPromise: undefined,
      hostsRendering: undefined,
    };
  }
  return set;
}

export async function renderMarked(doc: Document, state: RenderingState): Promise<RenderContext> {
  state.hostsRendering = new Set(state.hostsNext);
  state.hostsNext.clear();

  const platform = getPlatform(doc);
  const renderingQueue = Array.from(state.hostsRendering);
  sortNodes(renderingQueue);

  const ctx: RenderContext = {
    doc,
    operations: [],
    roots: [],
    hostElements: new Set(),
    globalState: state,
    perf: {
      visited: 0,
      timing: [],
    },
    component: undefined,
  };

  for (const el of renderingQueue) {
    if (!ctx.hostElements.has(el)) {
      ctx.roots.push(el);
      const cmp = getQComponent(el)!;
      await cmp.render(ctx);
    }
  }

  // Early exist, no dom operations
  if (ctx.operations.length === 0) {
    postRendering(doc, state);
    return ctx;
  }

  return platform.raf(() => {
    executeContextWithSlots(ctx);
    if (qDev) {
      if (typeof window !== 'undefined' && window.document != null) {
        printRenderStats(ctx);
      }
    }
    postRendering(doc, state);
    return ctx;
  });
}

function postRendering(doc: Document, state: RenderingState) {
  // Move elements from staging to nextRender
  state.hostsStaging.forEach((el) => {
    state.hostsNext.add(el);
  });

  // Clear staging
  state.hostsStaging.clear();
  state.hostsRendering = undefined;
  state.renderPromise = undefined;

  if (state.hostsNext.size > 0) {
    scheduleFrame(doc, state);
  }
}

function sortNodes(elements: Element[]) {
  elements.sort((a, b) => (a.compareDocumentPosition(b) & 2 ? 1 : -1));
}
