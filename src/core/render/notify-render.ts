import { assertDefined, assertEqual } from '../assert/assert';
import { QHostAttr } from '../util/markers';
import { getQComponent } from '../component/component-ctx';
import { executeContext, getRenderStats, RenderContext } from './cursor';
import { getContext } from '../props/props';
import { qDev } from '../util/qdev';
import { getPlatform } from '../index';

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
export function notifyRender(hostElement: Element) {
  assertDefined(hostElement.getAttribute(QHostAttr));
  const ctx = getContext(hostElement);
  const doc = hostElement.ownerDocument;
  const state = getRenderingState(doc);
  if (ctx.dirty) {
    return state.renderPromise;
  }
  ctx.dirty = true;
  const activeRendering = !!state.renderPromise;
  if (activeRendering) {
    state.hostsStaging.add(hostElement);
  } else {
    state.hostsNext.add(hostElement);
    scheduleFrame(doc, state);
  }
  return state.renderPromise;
}

export function scheduleFrame(doc: Document, state: RenderingState) {
  if (state.timeout === undefined) {
    state.timeout = setTimeout(() => {
      assertEqual(state.renderPromise, undefined);
      assertDefined(state.timeout);
      return (state.renderPromise = renderMarked(doc, state));
    });
  }
}

const SCHEDULE = Symbol();

export interface RenderingState {
  hostsNext: Set<Element>;
  hostsStaging: Set<Element>;
  hostsRendering: Set<Element> | undefined;
  renderPromise: Promise<RenderContext> | undefined;
  timeout: any;
}

export function getRenderingState(doc: Document): RenderingState {
  let set = (doc as any)[SCHEDULE] as RenderingState;
  if (!set) {
    (doc as any)[SCHEDULE] = set = {
      hostsNext: new Set(),
      hostsStaging: new Set(),
      renderPromise: undefined,
      timeout: undefined,
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
    queue: renderingQueue,
    component: undefined,
    hostElements: new Set(),
    globalState: state,
    perf: [],
  };

  for (const el of renderingQueue) {
    if (!ctx.hostElements.has(el)) {
      const cmp = getQComponent(el)!;
      await cmp.render(ctx);
    }
  }

  if (qDev) {
    const stats = getRenderStats(ctx);
    // eslint-disable-next-line no-console
    console.log('Render stats', stats);
  }

  // Early exist, no dom operations
  if (ctx.operations.length === 0) {
    postRendering(doc, state);
    return ctx;
  }

  return platform.queueRender(async () => {
    executeContext(ctx);
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

  // Allow new frames
  state.renderPromise = undefined;
  state.timeout = undefined;

  if (state.hostsNext.size > 0) {
    scheduleFrame(doc, state);
  }
}

function sortNodes(elements: Element[]) {
  elements.sort((a, b) => (a.compareDocumentPosition(b) & 2 ? 1 : -1));
}
