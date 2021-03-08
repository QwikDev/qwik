/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { fromKebabToCamelCase } from '../util/case.js';
import { QError, qError } from '../error/error.js';
import '../util/qDev.js';
import { InjectedFunction, Injector, Props } from './types.js';
import { IService, ServicePromise } from '../service/types.js';
import { Component } from '../component/types.js';

export function createEventInjector(element: Element, event: Event, url: URL): EventInjector {
  return new EventInjector(element, event, url);
}

export function createComponentInjector(element: Element, props: Props | null): ComponentInjector {
  return new ComponentInjector(element, props ? props : extractPropsFromElement(element));
}

export function createServiceInjector(element: Element, props: Props): ServiceInjector {
  return new ServiceInjector(element, props);
}

export class BaseInjector implements Injector {
  element: Element;
  props: Props;

  constructor(element: Element, props: Props) {
    this.element = element;
    this.props = props;
  }

  async invoke<SELF, ARGS extends any[], REST extends any[], RET>(
    fn: InjectedFunction<SELF, ARGS, REST, RET> | ((...args: [...REST]) => RET),
    ...rest: REST
  ): Promise<RET> {
    if (isInjectedFunction(fn)) {
      try {
        const providerPromises = fn.$inject.map((provider) => provider && provider(this));
        let values = await Promise.all(providerPromises);
        values = values.concat(rest);
        return (fn as any).apply(values.shift() as SELF, values as any);
      } catch (e) {
        if (e instanceof Error && fn.$debugStack) {
          const declaredFrames = fn.$debugStack.stack!.split('\n');
          const declaredFrame = declaredFrames[2].trim();
          const stack = e.stack!;
          const msg = e.message;
          e.stack = stack.replace(msg, msg + '\n      DECLARED ' + declaredFrame);
        }
        throw e;
      }
    } else {
      return (fn as any).apply(null, rest);
    }
  }
}

export class EventInjector extends BaseInjector {
  event: Event;
  url: URL;

  constructor(element: Element, event: Event, url: URL) {
    super(element, urlToParams(url));
    this.event = event;
    this.url = url;
  }
}

export class ServiceInjector extends BaseInjector {
  instance: IService<any, any> | null = null;
  instancePromise: ServicePromise<IService<any, any>> | null = null;

  constructor(element: Element, props: Props) {
    super(element, props);
  }
}

export class ComponentInjector extends BaseInjector {
  instance: Component<any, any> | null = null;

  constructor(element: Element, props: Props, instance?: Component<any, any>) {
    super(element, props);
  }
}

export function getComponentHost(element: Element): Element {
  let cursor: Element | null = element;
  while (cursor && !cursor.hasAttribute('::')) {
    cursor = cursor.parentElement;
  }
  if (!cursor) {
    throw qError(QError.Injection_noHost_element, element);
  }
  return cursor;
}

function urlToParams(url: URL): Props {
  const props: Props = {};
  url.searchParams.forEach((value, key) => (props[key] = value));
  return props;
}

export function ensureEventInjector(injector: Injector): EventInjector {
  if (injector instanceof EventInjector) {
    return injector;
  }
  throw qError(
    QError.Injection_expectedSpecificInjector_expected_actual,
    EventInjector,
    injector?.constructor
  );
}

export function ensureComponentInjector(injector: Injector): ComponentInjector {
  if (injector instanceof ComponentInjector) {
    return injector;
  }
  throw qError(
    QError.Injection_expectedSpecificInjector_expected_actual,
    ComponentInjector,
    injector.constructor
  );
}

export function ensureServiceInjector(injector: Injector): ServiceInjector {
  if (injector instanceof ServiceInjector) {
    return injector;
  }
  throw qError(
    QError.Injection_expectedSpecificInjector_expected_actual,
    ServiceInjector,
    injector.constructor
  );
}
function isInjectedFunction<SELF, ARGS extends any[], REST extends any[], RET>(
  value: any
): value is InjectedFunction<SELF, ARGS, REST, RET> {
  return !!value.$inject;
}

export function extractPropsFromElement(element: Element): Props {
  const props: Props = {};
  const attrs = element.attributes;
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i] as Attr;
    const attrName = attr.name;
    const attrValue = attr.value;
    if (attrName.startsWith('bind:')) {
      const id = attrName.substr(5 /* 'bind:'.length */);
      if (!id) {
        throw qError(QError.Component_bindNeedsKey);
      }
      if (!attrValue) {
        throw qError(QError.Component_bindNeedsValue);
      }
      attrValue.split(';').forEach((key) => key && (props[key] = id));
    } else if (attrName.indexOf(':') !== -1) {
      // special attributes should be ignored
    } else {
      props[fromKebabToCamelCase(attrName, false)] = attrValue;
    }
  }
  return props;
}
