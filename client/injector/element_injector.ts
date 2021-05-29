/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import {
  ComponentPropsOf,
  ComponentStateOf,
  Component,
  ComponentConstructor,
} from '../component/component.js';
import { qError, QError } from '../error/error.js';
import { qImport } from '../import/qImport.js';
import { QRL } from '../import/qrl.js';
import { keyToEntityAttribute, EntityKey } from '../entity/entity_key.js';
import {
  Entity,
  EntityConstructor,
  EntityPromise,
  EntityPropsOf,
  EntityStateOf,
} from '../entity/entity.js';
import { findAttribute } from '../util/dom_attrs.js';
import { AttributeMarker } from '../util/markers.js';
import '../util/qDev.js';
import { isHtmlElement } from '../util/types.js';
import { BaseInjector } from './base_injector.js';
import { Injector } from './types.js';

interface EntityValue {
  promise: EntityPromise<Entity<any, any>>;
  entity: Entity<any, any> | null;
}

export class ElementInjector extends BaseInjector {
  private component: Component<any, any> | null = null;
  private componentPromise: Promise<Component<any, any>> | null = null;
  private entities: Map<EntityKey, EntityValue> | null = null;

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

  getComponent<COMP extends Component<any, any>>(
    componentType: ComponentConstructor<COMP>
  ): Promise<COMP> {
    const injector: ElementInjector | null = this;
    const elementQRL: QRL | null = injector.element.getAttribute(
      AttributeMarker.ComponentTemplate
    ) as any;
    const $templateQRL = componentType.$templateQRL;
    if (!$templateQRL) {
      throw qError(QError.Component_missingTemplateQRL_component, componentType);
    }
    if (elementQRL === $templateQRL) {
      let component: COMP = this.component as COMP;
      if (component) {
        if (component instanceof componentType) {
          return this.componentPromise as Promise<COMP>;
        } else {
          throw qError(
            QError.Component_doesNotMatch_component_actual,
            componentType,
            (component as Object).constructor
          );
        }
      } else {
        const stateJSON = this.element.getAttribute(AttributeMarker.ComponentState);
        const state = stateJSON ? (JSON.parse(stateJSON) as ComponentStateOf<COMP>) : null;
        this.component = component = new componentType(
          this.element,
          this.elementProps as any as ComponentPropsOf<COMP>,
          state
        ) as unknown as COMP;
        return (this.componentPromise = new Promise<COMP>((resolve, reject) => {
          let promise: Promise<any>;
          if (state == null) {
            promise = Promise.resolve(component.$newState(component.$props)).then(
              (state: ComponentStateOf<COMP>) => {
                component.$state = state;
              }
            );
          } else {
            promise = Promise.resolve(component as COMP);
          }
          promise.then(() => component.$init()).then(() => resolve(component!), reject);
        }));
      }
    } else {
      const parentInjector = this.getParent() as ElementInjector;
      if (!parentInjector) {
        throw qError(QError.Component_notFound_component, componentType);
      }
      return parentInjector.getComponent(componentType);
    }
  }

  getEntity<SERVICE extends Entity<any, any>>(
    entityKey: EntityKey<SERVICE>,
    forceState?: EntityStateOf<SERVICE>,
    entityType?: EntityConstructor<SERVICE>
  ): EntityPromise<SERVICE> {
    let entityPromise = this.entities?.get(entityKey)?.promise as
      | EntityPromise<SERVICE>
      | undefined;
    if (entityPromise) return entityPromise as EntityPromise<SERVICE>;
    const entityAttrName = keyToEntityAttribute(entityKey);
    const self = this;
    return findAttribute(
      this.element,
      QError.Core_noAttribute_atr1_attr2_element,
      String(entityKey),
      entityFactory,
      entityAttrName,
      entityFactory
    );

    function entityFactory(element: Element, attrName: string, attrValue: string) {
      const injector = element === self.element ? self : (getInjector(element) as ElementInjector);
      entityPromise = injector.entities?.get(entityKey)?.promise as
        | EntityPromise<SERVICE>
        | undefined;
      if (entityPromise) return entityPromise;
      // OK, if we got here we don't already have entity, so we need to make it.

      injector.element.setAttribute(String(entityKey), '');
      const entityQRL = element.getAttribute(entityAttrName);
      if (!entityQRL) {
        throw qError(QError.Entity_elementMissingEntityAttr_element_attr, element, entityAttrName);
      }
      const entityTypePromise = Promise.resolve(
        entityType || qImport<EntityConstructor<SERVICE>>(element, entityQRL)
      );
      entityPromise = toEntityPromise<SERVICE>(
        entityKey,
        new Promise<SERVICE>((resolve, reject) => {
          entityTypePromise.then((entityType) => {
            if (typeof entityType !== 'function') {
              throw qError(QError.QRL_expectFunction_url_actual, entityQRL, entityType);
            }
            let state: EntityStateOf<SERVICE> | null = forceState || null;
            if (!state && attrName === String(entityKey)) {
              state = JSON.parse(attrValue) as EntityStateOf<SERVICE>;
              state!.$key = entityKey;
            }
            const props = entityType.$keyToProps(entityKey);
            const entity = new entityType(element, props, state) as unknown as SERVICE;
            let chain: Promise<any>;
            if (state) {
              entityValue.entity = entity;
              chain = Promise.resolve(entity);
            } else {
              chain = entity.$newState(props).then(
                (state: EntityStateOf<SERVICE>) => {
                  entityValue.entity = entity;
                  state.$key = entityKey;
                  (entity as { $state: EntityStateOf<SERVICE> }).$state = state;
                  return entity;
                },
                (e) => {
                  self.entities?.delete(entityKey);
                  return Promise.reject(e);
                }
              );
            }
            chain.then(() => {
              Promise.resolve(entity.$init()).then(() => resolve(entity));
            }, reject);
          }, reject);
        })
      );
      const entityValue: EntityValue = { promise: entityPromise, entity: null };
      const entities = injector.entities || (injector.entities = new Map<EntityKey, EntityValue>());
      entities.set(entityKey, entityValue);
      return entityPromise;
    }
  }

  getEntityState<SERVICE extends Entity<any, any>>(
    entityKey: EntityPropsOf<SERVICE> | EntityKey
  ): Promise<EntityStateOf<SERVICE>> {
    const entityAttrName = keyToEntityAttribute(entityKey);
    return findAttribute(
      this.element,
      QError.Core_noAttribute_atr1_attr2_element,
      entityKey as any,
      (element, entityKeyAttr, entityState) => {
        const injector = element == this.element ? this : (getInjector(element) as ElementInjector);
        const existingEntity = injector.entities?.get(entityKey)?.promise;
        if (existingEntity) {
          return existingEntity.then((entity) => entity.$state);
        }
        if (!entityState) {
          throw qError(
            QError.Injector_missingSerializedState_entityKey_element,
            entityKey,
            element
          );
        }
        const state = JSON.parse(entityState) as EntityStateOf<SERVICE>;
        state.$key = entityKeyAttr;
        return Promise.resolve(state);
      },
      entityAttrName,
      (element) => {
        return getInjector(element)
          .getEntity(entityKey)
          .then((entity) => entity.$state);
      }
    );
  }

  releaseEntity(key: EntityKey) {
    if (this.entities?.delete(key)) {
      this.element.removeAttribute(key as any as string);
    }
  }

  serialize() {
    const element = this.element;
    const state = (this.component as null | Component<any, any>)?.$state;
    if (state != null) {
      element.setAttribute(AttributeMarker.ComponentState, JSON.stringify(state));
    }
    this.entities?.forEach((entity) => {
      const state = entity.entity?.$state;
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

function toEntityPromise<SERVICE extends Entity<any, any>>(
  entityKey: EntityKey<SERVICE>,
  promise: Promise<SERVICE>
): EntityPromise<SERVICE> {
  const entityPromise = promise as EntityPromise<SERVICE>;
  entityPromise.$key = entityKey;
  return entityPromise;
}

export function getComponentHost(element: Element): Element {
  let cursor: Element | null = element;
  while (cursor && !cursor.hasAttribute(AttributeMarker.ComponentTemplate)) {
    cursor = cursor.parentElement;
  }
  if (!cursor) {
    throw qError(QError.Injector_noHost_element, element);
  }
  return cursor;
}

/**
 * Gets (or creates) an `Injector` at a particular DOM `Element`.
 *
 * If an element has an injector it is marked with `:` to designate it. This information
 * is used during serialization to locate all of the `Injector`s and serialize them.
 *
 * See: `serializeState`
 *
 * @param element -`Element` where the injector should be retrieved (or created)
 * @param create - Should the function lazy create the injector or just return `null`
 * @public
 */
export function getInjector(element: Element): Injector;
/** @public */
export function getInjector(element: Element, create: false): Injector | null;
export function getInjector(element: Element, create: boolean = true): Injector | null {
  if (!isHtmlElement(element)) {
    throw qError(QError.Injector_notElement_arg, element);
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
      return getInjector(cursor) as ElementInjector;
    }
    cursor = cursor.parentElement;
  }
  if (throwIfNotFound) {
    throw qError(QError.Injector_notFound_element, element);
  }
  return null;
}
