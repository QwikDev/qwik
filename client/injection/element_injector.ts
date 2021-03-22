/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import {
  ComponentPropsOf,
  ComponentStateOf,
  ComponentType,
  IComponent,
} from '../component/types.js';
import { qError, QError } from '../error/error.js';
import { qImport } from '../import/qImport.js';
import { QRL } from '../import/qrl.js';
import {
  IService,
  ServiceKey,
  ServicePromise,
  ServiceStateOf,
  ServiceType,
} from '../service/types.js';
import { findAttribute } from '../util/dom_attrs.js';
import { AttributeMarker } from '../util/markers.js';
import { isPromise } from '../util/promises.js';
import '../util/qDev.js';
import { isHtmlElement } from '../util/types.js';
import { BaseInjector } from './base_injector.js';
import { Injector } from './types.js';

interface ServiceValue {
  promise: ServicePromise<IService<any, any>>;
  service: IService<any, any> | null;
}

export class ElementInjector extends BaseInjector {
  private componentInstance: Promise<IComponent<any, any>> | IComponent<any, any> | null = null;
  private services: Map<ServiceKey, ServiceValue> | null = null;

  getParent(): Injector | null {
    let element = this.element.parentElement;
    while (element) {
      if (
        element.hasAttribute(AttributeMarker.Injector) ||
        element.hasAttribute(AttributeMarker.ComponentTemplate)
      ) {
        return getInjector(element);
      }
      element = element.parentElement;
    }
    return null;
  }

  getComponent<COMP extends IComponent<PROPS, STATE>, PROPS, STATE>(
    componentType: ComponentType<COMP>
  ): Promise<COMP> {
    let injector: ElementInjector | null = this;
    const elementQRL: QRL | null = injector.element.getAttribute(
      AttributeMarker.ComponentTemplate
    ) as any;
    const $templateQRL = componentType.$templateQRL;
    if (!$templateQRL) {
      throw qError(QError.Component_missingTemplateQRL_component, componentType);
    }
    if (elementQRL === $templateQRL) {
      let component = this.componentInstance;
      if (component) {
        if (isPromise(component)) {
          return component as Promise<COMP>;
        }
        if (component instanceof componentType) {
          return Promise.resolve(component as COMP);
        }
        throw qError(
          QError.Component_doesNotMatch_component_actual,
          componentType,
          (component as {}).constructor
        );
      } else {
        const stateJSON = this.element.getAttribute(AttributeMarker.ComponentState);
        const state = stateJSON ? (JSON.parse(stateJSON) as ComponentStateOf<COMP>) : null;
        this.componentInstance = component = new componentType(
          this.element,
          (this.elementProps as any) as ComponentPropsOf<COMP>,
          state
        );
        if (state == null) {
          return (this.componentInstance = Promise.resolve(
            component.$materializeState(component.$props)
          ).then((state) => {
            (component as IComponent<any, any>)!.$state = state;
            return (this.componentInstance = component as COMP);
          })) as Promise<COMP>;
        }
        return (this.componentInstance = Promise.resolve(component as COMP));
      }
    } else {
      const parentInjector = this.getParent() as ElementInjector;
      if (!parentInjector) {
        throw qError(QError.Component_notFound_component, componentType);
      }
      return parentInjector.getComponent(componentType);
    }
  }

  getService<SERVICE extends IService<any, any>>(
    serviceKey: string,
    forceState?: ServiceStateOf<SERVICE>,
    serviceType?: ServiceType<SERVICE>
  ): ServicePromise<SERVICE> {
    let servicePromise = this.services?.get(serviceKey)?.promise as
      | ServicePromise<SERVICE>
      | undefined;
    if (servicePromise) return servicePromise as ServicePromise<SERVICE>;
    const serviceAttrName = keyToServiceAttribute(serviceKey);
    const self = this;
    return findAttribute(this.element, serviceKey, serviceAttrName, serviceFactory, serviceFactory);

    function serviceFactory(element: Element, attrName: string, attrValue: string) {
      const injector = element === self.element ? self : getInjector(element);
      servicePromise = injector.services?.get(serviceKey)?.promise as
        | ServicePromise<SERVICE>
        | undefined;
      if (servicePromise) return servicePromise;
      // OK, if we got here we don't already have service, so we need to make it.

      injector.element.setAttribute(serviceKey, '');
      const serviceQRL = element.getAttribute(serviceAttrName);
      if (!serviceQRL) {
        throw qError(
          QError.Service_elementMissingServiceAttr_element_attr,
          element,
          serviceAttrName
        );
      }
      const serviceTypePromise = Promise.resolve(
        serviceType || qImport<ServiceType<SERVICE>>(element, serviceQRL)
      );
      servicePromise = toServicePromise<SERVICE>(
        serviceKey,
        serviceTypePromise.then((serviceType) => {
          if (typeof serviceType !== 'function') {
            throw qError(QError.QRL_expectFunction_url_actual, serviceQRL, serviceType);
          }
          let state: ServiceStateOf<SERVICE> | null = forceState || null;
          if (!state && attrName === serviceKey) {
            state = JSON.parse(attrValue) as ServiceStateOf<SERVICE>;
            state!.$key = serviceKey;
          }
          const props = serviceType.$keyToProps(serviceKey);
          const service = new serviceType(element, props, state);
          if (state) {
            serviceValue.service = service;
            return service;
          } else {
            return service.$materializeState(props).then(
              (state: ServiceStateOf<SERVICE>) => {
                serviceValue.service = service;
                state.$key = serviceKey;
                (service as { $state: ServiceStateOf<SERVICE> }).$state = state;
                return service;
              },
              (e) => {
                self.services?.delete(serviceKey);
                return Promise.reject(e);
              }
            );
          }
        })
      );
      const serviceValue: ServiceValue = { promise: servicePromise, service: null };
      const services =
        injector.services || (injector.services = new Map<ServiceKey, ServiceValue>());
      services.set(serviceKey, serviceValue);
      return servicePromise;
    }
  }

  getServiceState<SERVICE extends IService<any, any>>(
    serviceKey: string | ServiceStateOf<SERVICE>
  ): Promise<ServiceStateOf<SERVICE>> {
    const serviceAttrName = keyToServiceAttribute(serviceKey);
    return findAttribute(
      this.element,
      serviceKey,
      serviceAttrName,
      (element, serviceKeyAttr, serviceState) => {
        const injector = element == this.element ? this : getInjector(element);
        const existingService = injector.services?.get(serviceKey)?.promise;
        if (existingService) {
          return existingService.then((service) => service.$state);
        }
        if (!serviceState) {
          throw qError(
            QError.Injection_missingSerializedState_serviceKey_element,
            serviceKey,
            element
          );
        }
        const state = JSON.parse(serviceState) as ServiceStateOf<SERVICE>;
        state.$key = serviceKeyAttr;
        return Promise.resolve(state);
      },
      (element, serviceProviderAttr, serviceQRL) => {
        return getInjector(element)
          .getService(serviceKey)
          .then((service) => service.$state);
      }
    );
  }

  releaseService(key: string) {
    if (this.services?.delete(key)) {
      this.element.removeAttribute(key);
    }
  }

  serialize() {
    const element = this.element;
    const state = (this.componentInstance as null | IComponent<any, any>)?.$state;
    if (state != null) {
      element.setAttribute(AttributeMarker.ComponentState, JSON.stringify(state));
    }
    this.services?.forEach((service, serviceName) => {
      const state = service.service?.$state;
      if (state) {
        element.setAttribute(state.$key, JSON.stringify(state, filterFrameworkKeys));
      }
    });
  }
}

function filterFrameworkKeys(this: any, key: string, value: any) {
  if (key.startsWith('$')) {
    return undefined;
  } else {
    return value;
  }
}

function toServicePromise<SERVICE extends IService<any, any>>(
  serviceKey: ServiceKey,
  promise: Promise<SERVICE>
): ServicePromise<SERVICE> {
  const servicePromise = promise as ServicePromise<SERVICE>;
  servicePromise.$key = serviceKey;
  return servicePromise;
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

export function ensureElementInjector(injector: Injector): ElementInjector {
  if (injector instanceof ElementInjector) {
    return injector;
  }
  throw qError(
    QError.Injection_expectedSpecificInjector_expected_actual,
    ElementInjector,
    injector.constructor
  );
}

/**
 * Returns the attribute where the service QRL is stored.
 *
 * @param key service key attribute name (ie: `foo:123:456`)
 * @returns Service attribute (ie: `::foo`)
 */
export function keyToServiceAttribute(key: string): string {
  const idx = key.indexOf(':');
  if (idx == -1) {
    throw qError(QError.Service_notValidKey_key, key);
  }
  return '::' + key.substr(0, idx);
}

/**
 * Gets (or creates) an `ElementInjector` at a particular DOM `Element`.
 *
 * If an element has an injector it is marked with `:` to designate it. This information
 * is used during serialization to locate all of the `Injector`s and serialize them.
 *
 * See: `serializeState`
 *
 * @param element `Element` where the injector should be retrieved (or created)
 * @param create Should the function lazy create the injector or just return `null`
 */
export function getInjector(element: Element): ElementInjector;
export function getInjector(element: Element, create: false): ElementInjector | null;
export function getInjector(element: Element, create: boolean = true): ElementInjector | null {
  if (!isHtmlElement(element)) {
    throw qError(QError.Injection_notElement_arg, element);
  }
  const _element = element as ElementExpando;
  let injector = _element.$injector;
  if (create && !injector) {
    _element.$injector = injector = new ElementInjector(element);
    // We need to mark the Storage so that serializeState knows where to look for State
    element.setAttribute(AttributeMarker.Injector, '');
  }
  return injector || null;
}

export interface ElementExpando extends Element {
  $injector?: ElementInjector;
}

export function getClosestInjector(element: Element): ElementInjector;
export function getClosestInjector(
  element: Element,
  throwIfNotFound: boolean
): ElementInjector | null;
export function getClosestInjector(
  element: Element,
  throwIfNotFound = true
): ElementInjector | null {
  let cursor: Element | null = element;
  while (cursor) {
    if (
      cursor.hasAttribute(AttributeMarker.Injector) ||
      cursor.hasAttribute(AttributeMarker.ComponentTemplate)
    ) {
      return getInjector(cursor);
    }
    cursor = cursor.parentElement;
  }
  if (throwIfNotFound) {
    // TODO: Test / proper error
    throw new Error('Implement proper error');
  }
  return null;
}
