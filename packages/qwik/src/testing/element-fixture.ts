import { getDomContainer, type ClientContainer } from '@qwik.dev/core';
import { vi } from 'vitest';
import { assertDefined } from '../core/shared/error/assert';
import type { Container, QElement, QwikLoaderEventScope } from '../core/shared/types';
import { fromCamelToKebabCase } from '../core/shared/utils/event-names';
import { QFuncsPrefix, QInstanceAttr } from '../core/shared/utils/markers';
import { delay } from '../core/shared/utils/promises';
import { invokeApply, newInvokeContextFromTuple } from '../core/use/use-core';
import { createWindow } from './document';
import { getTestPlatform } from './platform';
import type { MockDocument, MockWindow } from './types';
import { ChoreType } from '../core/shared/util-chore-type';

/**
 * Creates a simple DOM structure for testing components.
 *
 * By default `EntityFixture` creates:
 *
 * ```html
 * <host q:view="./component_fixture.noop">
 *   <child></child>
 * </host>
 * ```
 *
 * @public
 */
export class ElementFixture {
  window: MockWindow;
  document: MockDocument;
  superParent: HTMLElement;
  parent: HTMLElement;
  host: HTMLElement;
  child: HTMLElement;

  constructor(options: ElementFixtureOptions = {}) {
    this.window = createWindow();
    this.document = this.window.document;
    this.superParent = this.document.createElement('super-parent');
    this.document.body.appendChild(this.superParent);
    this.parent = this.document.createElement('parent');
    this.superParent.appendChild(this.parent);
    if (options.html) {
      this.parent.innerHTML = options.html;
      this.host = this.parent.firstElementChild as HTMLElement;
      assertDefined(this.host, 'host element must be defined');
      this.host.querySelectorAll('script[q\\:func="qwik/json"]').forEach((script) => {
        const code = script.textContent;
        if (code?.match(Q_FUNCS_PREFIX)) {
          const equal = code.indexOf('=');
          const qFuncs = (0, eval)(code.substring(equal + 1));
          const container = this.host.closest(QContainerSelector)!;
          const hash = container.getAttribute(QInstanceAttr);
          (document as any)[QFuncsPrefix + hash] = qFuncs;
        }
      });
      this.child = null!;
    } else {
      this.host = this.document.createElement(options.tagName || 'host');
      this.child = this.document.createElement('child');
      this.parent.appendChild(this.host);
      this.host.appendChild(this.child);
    }
  }
}

/** @public */
export interface ElementFixtureOptions {
  tagName?: string;
  html?: string;
}

function isDocumentOrWindowEvent(eventName: string): boolean {
  return eventName.startsWith(':document:') || eventName.startsWith(':window:');
}

/**
 * Trigger an event in unit tests on an element.
 *
 * Future deprecation candidate.
 *
 * @public
 */
export async function trigger(
  root: Element,
  queryOrElement: string | Element | keyof HTMLElementTagNameMap | null,
  eventName: string,
  eventPayload: any = {},
  options?: { waitForIdle?: boolean }
): Promise<void> {
  const waitForIdle = options?.waitForIdle ?? true;
  const elements =
    typeof queryOrElement === 'string'
      ? Array.from(root.querySelectorAll(queryOrElement))
      : [queryOrElement];
  let container: ClientContainer | null = null;
  for (const element of elements) {
    if (!element) {
      continue;
    }
    if (!container) {
      container = getDomContainer(element as HTMLElement);
    }

    let scope: QwikLoaderEventScope = '';
    if (eventName.startsWith(':')) {
      // :document:event or :window:event
      const colonIndex = eventName.substring(1).indexOf(':');
      // we need to add `-` for event, because of scope of the qwik loader
      scope = ('-' + eventName.substring(1, colonIndex + 1)) as '-document' | '-window';
      eventName = eventName.substring(colonIndex + 2);
    }

    const event = new Event(eventName, {
      bubbles: true,
      cancelable: true,
    });
    Object.assign(event, eventPayload);
    const prefix = scope ? 'on' + scope + ':' : 'on:';
    const attrName = prefix + fromCamelToKebabCase(eventName);
    await dispatch(element, attrName, event, scope);
  }
  const waitForQueueChore = container?.$scheduler$(ChoreType.WAIT_FOR_QUEUE);
  await getTestPlatform().flush();
  if (waitForIdle && waitForQueueChore) {
    await waitForQueueChore.$returnValue$;
  }
}

const PREVENT_DEFAULT = 'preventdefault:';
const STOP_PROPAGATION = 'stoppropagation:';
const Q_FUNCS_PREFIX = /document.qdata\["qFuncs_(.+)"\]=/;
const QContainerSelector = '[q\\:container]';

/**
 * Dispatch
 *
 * @param element
 * @param attrName
 * @param event
 */
export const dispatch = async (
  element: Element | null,
  attrName: string,
  event: Event,
  scope: QwikLoaderEventScope
) => {
  const isDocumentOrWindow = isDocumentOrWindowEvent(event.type);
  const preventAttributeName =
    PREVENT_DEFAULT + (isDocumentOrWindow ? event.type.substring(1) : event.type);
  const stopPropagationName = STOP_PROPAGATION + event.type;
  while (element) {
    const preventDefault = element.hasAttribute(preventAttributeName);
    const stopPropagation = element.hasAttribute(stopPropagationName);
    if (preventDefault) {
      event.preventDefault();
    }
    if (stopPropagation) {
      event.stopPropagation();
    }
    if ('qDispatchEvent' in (element as QElement)) {
      await (element as QElement).qDispatchEvent!(event, scope);
      await delay(0); // Unsure why this is needed for tests
      return;
    } else if (element.hasAttribute(attrName)) {
      const container = getDomContainer(element as HTMLElement);
      const qrl = element.getAttribute(attrName)!;
      const ctx = newInvokeContextFromTuple([element, event]);
      try {
        await Promise.all(
          qrl
            .split('\n')
            .map((qrl) => container.parseQRL(qrl.trim()))
            .map((qrl) => {
              return invokeApply(ctx, qrl, [event, element]);
            })
        );
      } catch (error) {
        console.error('!!! qrl error', qrl, error);
        throw error;
      }
      return;
    }
    element = element.parentElement;
  }
};

export async function advanceToNextTimerAndFlush(container: Container) {
  vi.advanceTimersToNextTimer();
  const waitForQueueChore = container.$scheduler$(ChoreType.WAIT_FOR_QUEUE);
  await getTestPlatform().flush();
  if (waitForQueueChore) {
    await waitForQueueChore.$returnValue$;
  }
}

export function cleanupAttrs(innerHTML: string | undefined): any {
  return innerHTML
    ?.replaceAll(/ q:key="[^"]+"/g, '')
    .replaceAll(/ :=""/g, '')
    .replaceAll(/ on:\w+="[^"]+"/g, '');
}
