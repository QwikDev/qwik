import { assertDefined, assertEqual } from '../assert/assert';
import { QHostAttr } from '../util/markers';
import { getQComponent } from '../component/component-ctx';
import { executeContext, RenderContext } from './cursor';
import { getContext } from '../props/props';

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
    if (state.timeout === undefined) {
      state.timeout = setTimeout(() => renderMarked(doc, state));
    }
  }
  return state.renderPromise;
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

export function renderMarked(doc: Document, state: RenderingState): Promise<RenderContext> {
  assertEqual(state.renderPromise, undefined);
  assertDefined(state.timeout);

  // Move elements from staging to nextRender
  state.hostsStaging.forEach((el) => {
    state.hostsNext.add(el);
  });

  // Clear elements
  state.hostsStaging.clear();

  state.timeout = undefined;
  return (state.renderPromise = _renderMarked(doc, state));
}

export async function _renderMarked(doc: Document, state: RenderingState): Promise<RenderContext> {
  state.hostsRendering = new Set(state.hostsNext);
  state.hostsNext.clear();

  const renderingQueue = Array.from(state.hostsRendering);
  sortNodes(renderingQueue);

  const ctx: RenderContext = {
    doc,
    operations: [],
    component: undefined,
    hostElements: new Set(),
    globalState: state,
  };

  for (const el of renderingQueue) {
    if (!ctx.hostElements.has(el)) {
      const cmp = getQComponent(el)!;
      await cmp.render(ctx);
    }
  }

  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      state.renderPromise = undefined;
      executeContext(ctx);
      resolve(ctx);
    });
  });
}

function sortNodes(elements: Element[]) {
  elements.sort((a, b) => (a.compareDocumentPosition(b) & 2 ? 1 : -1));
}
