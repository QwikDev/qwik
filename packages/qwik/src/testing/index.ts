import type { RenderOptions, RenderResult } from '../core/test-utils';
import { bootQwikLoader, csrRenderInto } from '../core/test-utils';
import type { RenderRoot } from '@qwik.dev/core';
import { getOrCreateContainerContext } from '@qwik.dev/core/internal';
import { createDocument } from './document';

export { createDocument, createWindow } from './document';
export { getTestPlatform } from './platform';
export {
  csrRender as domRender,
  ssrRender as ssrRenderToDom,
  type QwikLoaderEventPayload,
  type QwikLoaderTestDriver,
  type RenderOptions,
  type RenderResult,
} from '../core/test-utils';
export type {
  MockDocument,
  MockDocumentOptions,
  MockWindow,
  MockWindowOptions,
  TestPlatform,
} from './types';

/** @public */
export interface DOMHarness {
  readonly screen: HTMLElement;
  render<Props>(root: RenderRoot<Props>, options?: RenderOptions<Props>): Promise<RenderResult>;
  userEvent(
    target: string | Element | keyof HTMLElementTagNameMap,
    type: string,
    payload?: Record<string, unknown>
  ): Promise<Event>;
  cleanup(): void;
}

/**
 * Creates a compiler-backed DOM harness.
 *
 * @public
 */
export async function createDOM(options?: { html?: string }): Promise<DOMHarness> {
  const document = createDocument();
  const screen = document.createElement('div');
  if (options?.html !== undefined) {
    screen.innerHTML = options.html;
  }
  document.body.appendChild(screen);
  let current: RenderResult | undefined;

  return {
    screen,
    async render(root, renderOptions) {
      current?.cleanup();
      current = await csrRenderInto(root, document, screen, renderOptions);
      return current;
    },
    async userEvent(target, type, payload) {
      const element = resolveElement(screen, target);
      if (current?.qwikLoader !== undefined) {
        return current.qwikLoader.dispatch(element, type, payload);
      }
      const event = document.createEvent('Event');
      event.initEvent(type, true, true);
      if (payload !== undefined) {
        Object.assign(event, payload);
      }
      element.dispatchEvent(event);
      await current?.flush();
      return event;
    },
    cleanup() {
      current?.cleanup();
    },
  };
}

/** @public */
export async function trigger(
  parent: Element,
  target: string | Element | keyof HTMLElementTagNameMap,
  type: string,
  payload?: Record<string, unknown>
): Promise<Event> {
  const element = resolveElement(parent, target);
  const driver = await bootQwikLoader(parent.ownerDocument);
  const event = await driver.dispatch(element, type, payload);
  await getOrCreateContainerContext(element).scheduler.flushInteraction();
  return event;
}

function resolveElement(
  parent: Element,
  target: string | Element | keyof HTMLElementTagNameMap
): Element {
  if (typeof target !== 'string') {
    return target;
  }
  const element = parent.querySelector(target);
  if (element === null) {
    throw new Error(`Unable to find element "${target}".`);
  }
  return element;
}
