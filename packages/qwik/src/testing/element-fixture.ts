import { getDomContainer } from '@qwik.dev/core';
import type { ClientContainer, EventHandler } from '@qwik.dev/core/internal';
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
      const scripts = this.host.querySelectorAll('script[q\\:func="qwik/json"]');
      for (let i = 0; i < scripts.length; i++) {
        const script = scripts[i];
        const code = script.textContent;
        if (code?.match(Q_FUNCS_PREFIX)) {
          const equal = code.indexOf('=');
          const qFuncs = (0, eval)(code.substring(equal + 1));
          const container = this.host.closest(QContainerSelector)!;
          const hash = container.getAttribute(QInstanceAttr);
          (document as any)[QFuncsPrefix + hash] = qFuncs;
        }
      }
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
): Promise<Event | null> {
  const waitForIdle = options?.waitForIdle ?? true;
  const { rootScope, kebabName, selectors, scopedEventNames } = parseTriggerEvent(eventName);
  let event: Event | null = null;
  if (selectors) {
    queryOrElement = selectors;
  }

  const elements =
    typeof queryOrElement === 'string'
      ? Array.from(root.querySelectorAll(queryOrElement))
      : [queryOrElement];
  let container: ClientContainer | null = null;
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    if (!element) {
      continue;
    }
    if (!container) {
      container = getDomContainer(element as HTMLElement);
    }

    const { bubbles = true, cancelable = true, ...rest } = eventPayload ?? {};
    event = new Event(eventName, {
      bubbles,
      cancelable,
    });
    Object.assign(event, rest);
    for (let i = 0; i < scopedEventNames.length; i++) {
      const { scope, scopedKebabName } = scopedEventNames[i];
      await dispatch(element, event, scopedKebabName, kebabName, scope === rootScope);
    }
  }
  if (waitForIdle && container) {
    await waitForDrain(container);
  }
  return event;
}

const parseTriggerEvent = (eventName: string) => {
  let scope: QwikLoaderEventScope = 'e';
  let kebabName = eventName;
  const separatorIndex = eventName.indexOf(':');
  if (separatorIndex !== -1) {
    scope = eventName.slice(0, separatorIndex) as QwikLoaderEventScope;
    kebabName = eventName.substring(separatorIndex + 1);
    if (kebabName === 'DOMContentLoaded') {
      kebabName = '-d-o-m-content-loaded';
    }
  } else {
    kebabName = fromCamelToKebabCase(eventName);
  }

  const rootScope = scope.charAt(0) as 'd' | 'e' | 'w';
  const scopes = scope.length === 2 ? [scope] : ([scope, `${scope}p`] as QwikLoaderEventScope[]);

  return {
    rootScope,
    kebabName,
    selectors:
      rootScope === 'e'
        ? undefined
        : scopes.map((scope) => `[q-${scope}\\:${kebabName}]`).join(', '),
    scopedEventNames: scopes.map((scope) => ({
      scope,
      scopedKebabName: `${scope}:${kebabName}`,
    })),
  };
};

const PREVENT_DEFAULT = 'preventdefault:';
const STOP_PROPAGATION = 'stoppropagation:';
const CAPTURE = 'capture:';
const Q_FUNCS_PREFIX = /document.qdata\["qFuncs_(.+)"\]=/;
const QContainerSelector = '[q\\:container]';

const isElementNode = (node: Node | null): node is Element => !!node && node.nodeType === 1;

/** Dispatch in the same way that Qwik Loader does, for testing purposes. */
export const dispatch = async (
  element: Element | null,
  event: Event,
  scopedKebabName: string,
  kebabName: string,
  allowPreventDefault = true
) => {
  const captureAttributeName = CAPTURE + kebabName;
  const elements: Element[] = [];
  const captureHandlers: boolean[] = [];
  let current = element as Node | null;
  while (current) {
    if (isElementNode(current)) {
      elements.push(current);
      captureHandlers.push(
        current.hasAttribute(captureAttributeName) &&
          (!!current.getAttribute('q-' + scopedKebabName) ||
            ('_qDispatch' in (current as QElement) &&
              !!(current as QElement)._qDispatch?.[scopedKebabName]))
      );
      current = current.parentElement;
    } else {
      current = (current as ChildNode).parentElement;
    }
  }

  for (let i = elements.length - 1; i >= 0; i--) {
    if (captureHandlers[i]) {
      const result = dispatchOnElement(
        elements[i],
        event,
        scopedKebabName,
        kebabName,
        allowPreventDefault
      );
      const continuePropagation = !event.cancelBubble;
      await result;
      if (!continuePropagation || event.cancelBubble) {
        return;
      }
    }
  }

  for (let i = 0; i < elements.length; i++) {
    if (!captureHandlers[i]) {
      const result = dispatchOnElement(
        elements[i],
        event,
        scopedKebabName,
        kebabName,
        allowPreventDefault
      );
      const doBubble = event.bubbles && !event.cancelBubble;
      await result;
      if (!doBubble || event.cancelBubble) {
        return;
      }
    }
  }
};

const dispatchOnElement = async (
  element: Element | null,
  event: Event,
  scopedKebabName: string,
  kebabName: string,
  allowPreventDefault = true
) => {
  const preventAttributeName = PREVENT_DEFAULT + kebabName;
  const stopPropagationName = STOP_PROPAGATION + kebabName;
  if (element) {
    const handlers =
      '_qDispatch' in (element as QElement)
        ? (element as QElement)._qDispatch?.[scopedKebabName]
        : undefined;
    const attrValue = element.getAttribute('q-' + scopedKebabName);

    if (kebabName) {
      const preventDefault = element.hasAttribute(preventAttributeName);
      const stopPropagation = element.hasAttribute(stopPropagationName);
      if (allowPreventDefault && preventDefault) {
        event.preventDefault();
      }
      if (stopPropagation) {
        event.stopPropagation();
      }
    }
    if ('_qDispatch' in (element as QElement)) {
      if (handlers) {
        if (typeof handlers === 'function') {
          await handlers(event, element);
        } else if (handlers.length) {
          for (let i = 0; i < handlers.length; i++) {
            const handler = handlers[i];
            if (handler) {
              await (handler as EventHandler)(event, element);
            }
          }
        }
        return;
      }
    }

    if (attrValue) {
      const qrls = attrValue;
      try {
        const qrlsArray = qrls.split('|');
        for (let i = 0; i < qrlsArray.length; i++) {
          const qrl = qrlsArray[i];
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
    }
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
    .replaceAll(/ q-[a-z]{1,2}:[^=]+="[^"]+"/g, '');
}
