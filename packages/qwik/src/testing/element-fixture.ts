import { getDomContainer } from '@qwik.dev/core';
import type { ClientContainer } from '@qwik.dev/core/internal';
import { vi } from 'vitest';
import { assertDefined } from '../core/shared/error/assert';
import type { Container, QElement, QwikLoaderEventScope } from '../core/shared/types';
import { fromCamelToKebabCase } from '../core/shared/utils/event-names';
import { QFuncsPrefix, QInstanceAttr } from '../core/shared/utils/markers';
import { createWindow } from './document';
import type { MockDocument, MockWindow } from './types';
import { waitForDrain } from './util';
import type { QRLInternal } from '../server/qwik-types';

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

/**
 * Trigger an event in unit tests on an element. Needs to be kept in sync with the Qwik Loader event
 * dispatching.
 *
 * Events can be either case sensitive element-scoped events or scoped kebab-case.
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
  let scope: QwikLoaderEventScope;
  let kebabName: string;
  let scopedKebabName: string;
  if (eventName.charAt(1) === ':') {
    scopedKebabName = eventName;
    scope = eventName.charAt(0) as QwikLoaderEventScope;
    kebabName = eventName.substring(2);
  } else {
    scope = 'e';
    kebabName = fromCamelToKebabCase(eventName);
    scopedKebabName = 'e:' + kebabName;
  }
  if (scope !== 'e') {
    queryOrElement = `[qe\\:${scope}\\:${kebabName}]`;
  }

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

    const event = new Event(eventName, {
      bubbles: true,
      cancelable: true,
    });
    Object.assign(event, eventPayload);
    await dispatch(element, event, scopedKebabName, kebabName);
  }
  if (waitForIdle && container) {
    await waitForDrain(container);
  }
}

const PREVENT_DEFAULT = 'preventdefault:';
const STOP_PROPAGATION = 'stoppropagation:';
const Q_FUNCS_PREFIX = /document.qdata\["qFuncs_(.+)"\]=/;
const QContainerSelector = '[q\\:container]';

/** Dispatch in the same way that Qwik Loader does, for testing purposes. */
export const dispatch = async (
  element: Element | null,
  event: Event,
  scopedKebabName: string,
  kebabName: string
) => {
  const preventAttributeName = PREVENT_DEFAULT + kebabName;
  const stopPropagationName = STOP_PROPAGATION + kebabName;
  while (element) {
    if (kebabName) {
      const preventDefault = element.hasAttribute(preventAttributeName);
      const stopPropagation = element.hasAttribute(stopPropagationName);
      if (preventDefault) {
        event.preventDefault();
      }
      if (stopPropagation) {
        event.stopPropagation();
      }
    }
    if ('qDispatchEvent' in (element as QElement)) {
      return (element as QElement).qDispatchEvent!(event, scopedKebabName);
    } else if (element.hasAttribute('q-' + scopedKebabName)) {
      const qrls = element.getAttribute('q-' + scopedKebabName)!;
      try {
        for (const qrl of qrls.split('|')) {
          const [chunk, symbol, captures] = qrl.split('#');
          let fn: Function;
          if (chunk) {
            // This is added by qrl-to-string.ts during serialization
            fn = (globalThis as any).__qrl_back_channel__?.get(symbol);
            if (typeof fn !== 'function') {
              throw new Error(`QRL function not found in back channel for ${qrl}`);
            }
          } else {
            const container = getDomContainer(element as HTMLElement);
            // Sync QRL
            const sync = container.parseQRL(qrl) as QRLInternal<Function>;
            // This synchronously resolves the sync function
            // even though it returns a promise
            sync.resolve();
            fn = sync.resolved as Function;
          }
          await fn.apply(captures, [event, element]);
        }
      } catch (error) {
        console.error('!!! qrl error', qrls, error);
        throw error;
      }
      return;
    }
    element = event.cancelBubble ? null : element.parentElement;
  }
};

export async function advanceToNextTimerAndFlush(container: Container) {
  vi.advanceTimersToNextTimer();
  if (container) {
    await container.$renderPromise$;
  }
}

export function cleanupAttrs(innerHTML: string | undefined): any {
  return innerHTML
    ?.replaceAll(/ q:key="[^"]+"/g, '')
    .replaceAll(/ :=""/g, '')
    .replaceAll(/ :="[^"]+"/g, '')
    .replaceAll(/ q-.:\w+="[^"]+"/g, '');
}
