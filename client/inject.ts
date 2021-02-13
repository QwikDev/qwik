/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import {State} from './state.js';

export interface Type<T> extends Function {
  new(...args: any[]): T;
}

export interface InjectFn<R> {
  (event: Event, target: Element, url: URL): Promise<R>
}

export async function injectEvent(
    event: Event, target: Element, url: URL): Promise<Event> {
  return event;
}

export function injectSourceElement<T extends Element>(type: Type<T>):
    InjectFn<T> {
  return async (event: Event, target: Element, url: URL) => target as T;
}

export async function injectController<T>(
    event: Event, target: Element, url: URL): Promise<State<T>|null> {
  let element: HTMLElement|null = target as HTMLElement;
  const controllerName = url.hash.substr(1);
  const controllerAttr = '.' + controllerName;
  while (element) {
    const data = element.getAttribute(controllerAttr);
    if (data != null) {
      let controller = (element as any)[controllerName] as State<T>| undefined;
      if (!controller) {
        let [controllerUrl, json] = data.split('|');
        let ControllerType: Type<State<T>>;
        if (!json) {
          ControllerType = State;
          json = data;
        } else {
          ControllerType = await importMember<Type<State<T>>>(controllerUrl);
        }
        controller = (element as any)[controllerName] =
            new ControllerType(JSON.parse(json));
      }
      return controller;
    }
    element = element.parentElement;
  }
  return null;
}

export async function importMember<T>(url: string|URL): Promise<T> {
  if (typeof url === 'string') {
    url = new URL(url, document.baseURI);
  }
  const path = url.pathname.split('.');
  let value = await import(path.shift() + '.js');
  if (!path.length) {
    path.push('default');
  }
  while (path.length) {
    value = value[path.shift()!];
  }
  return value;
}