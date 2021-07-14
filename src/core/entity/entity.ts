/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { AttributeMarker } from '../util/markers';
import { qError, QError } from '../error/error';
import { qImport } from '../import/qImport';
import type { QRL } from '../import/qrl';
import { keyToEntityAttribute, EntityKey, keyToProps, propsToKey } from './entity_key';
import { fromCamelToKebabCase } from '../util/case';
import { getInjector } from '../injector/element_injector';

/**
 * `Entity` allows creation of lazy loading class whose state is serializable.
 *
 * Entities are a basic building block of Qwik applications. The basic idea behind entities
 * is that their state is serializable and thus a entity lifetime can span runtime environments
 * (i.e. entity instances can be created by the server and then used by the client).
 *
 * Entities are broken down into three parts:
 * 1) A global unique key. A key is a string which uniquely identifies a entity. Typically
 *    keys contain only a single id, such as `myEntity:123`, however they can be hierarchical
 *    as in `project:123:456`. Keys are immutable for a given entity instance. Keys get parsed
 *    into the `Props` of the entity.
 * 2) A JSON serializable `State` which is persisted in DOM when the application is dehydrated.
 * 3) A transient entity instance. We say transient because it does not get deserialized.
 *
 * The basic idea of a entity is that the transient instance can be recreated from the `Props` and
 * `State` on as-needed basis.
 *
 * Entities have two responsibilities:
 * 1) to provide behavior around `State`. This comes in form of async methods on the entity class.
 * 2) to materialize new data based on the `key` and `Props`.
 *
 * Let's say we would like to implement a todo item.
 *
 * ```
 * // Define Props which will serialize into the key: `todo:123`.
 * interface TodoItemProps {
 *   id: string;
 * }
 *
 * // Define State which can be serialized onto the DOM during dehydration.
 * interface TodoItem {
 *   completed: boolean,
 *   text: string;
 * }
 *
 * // Define a class whose instances are the transient entity objects.
 * class TodoItemEntity extends Entity<TodoItemProps, TodoItem> {
 *   $qrl = QRL`./path/to/entity/TodoItem`;
 *   $type = 'todo';
 *   $keyProps = ['id'];
 *
 *   async archive() {
 *     // entity specific method/behavior.
 *   }
 * }
 * ```
 *
 * ## Instantiating a entity.
 *
 * Entities are attached and store their data in the DOM/HTML. For this reason when the entity is
 * created an `Element` must be specified.
 *
 * ```
 * const todoItemEntity = await TodoItemEntity.$hydrate(
 *    element,      // Element where the entity should be attached.
 *    {id: '123'},  // Entity's identity. Serializes to `item:123`.
 *    {completed: false, text: 'sample task'} // Initial state.
 * );
 * expect(todoItemEntity.$state)
 *   .toEqual({completed: false, text: 'sample task'});
 * ```
 *
 * When dehydrated this results in HTML that looks like:
 *
 * ```
 * <div ::todo="./path/to/entity/TodoItem"
 *      todo:123="{completed: false, text: 'sample task'}">
 * ```
 *
 * NOTE:
 *   - `::todo` The QRL to import the `TodoItemEntity` class.
 *   - `todo:123` Represents a specific instance of the `TodoItemEntity`, with `id: 123` and state serialized as JSON.
 *
 *
 * ## Rehydration
 *
 * We can use the same code to rehydrate the entity from HTML/DOM.
 *
 * ```
 * const todoItemEntity =
 *   await TodoItemEntity.$hydrate(element, {id: '123'});
 * expect(todoItemEntity.$state)
 *   .toEqual({completed: false, text: 'sample task'});
 * ```
 *
 * The above will either return the same instance of the entity that was created above or a new instance
 * if the application was dehydrated into HTML. In either case the `$state` will contain the same data.
 *
 * ## Lookup
 *
 * There is a third situation when we ask to rehydrate a entity which has no serialized state in the DOM.
 *
 * Let's assume that the DOM looks like this.
 * ```
 * <div ::todo="./path/to/entity/TodoItem">
 * ```
 *
 * We can still use the same code to ask for `item:123` like so.
 * ```
 * const todoItemEntity = await TodoItemEntity.$hydrate(element, {id: '123'});
 * expect(todoItemEntity.$state)
 *   .toEqual({completed: false, text: 'sample task'});
 * ```
 *
 * In this cases there is no serialized state. For this reason the component executes the `$newState` method.
 *
 * ```
 * class TodoItemEntity extends Entity<TodoItemProps, TodoItem> {
 *   $qrl = QRL`./path/to/entity/TodoItem`;
 *   $type = 'todo';
 *   $keyProps = ['id'];
 *
 *   async $newState(props: TodoItemProps): Promise<TodoItem> {
 *     //  Execute code to create or look up the state.
 *   }
 * }
 * ```
 *
 * ## Release
 *
 * Finally, when the entity instance no longer needs to be associated with an element, it can be released.
 *
 * ```
 * todoItemEntity.$release()
 * ```
 *
 * This will remove the state from its element, resulting in the following HTML.
 *
 * ```
 * <div ::todo="./path/to/entity/TodoItem">
 * ```
 *
 * Note: `$release()` is not the same thing as deleting/destroying the data. It merely tells Qwik to
 * not serialize the state into the DOM/HTML.
 *
 * @public
 */
export class Entity<PROPS, STATE> {
  /**
   * A entity name.
   *
   * All entity instances of this type have this name.
   *
   * When entities are serialized each entity instance needs to have a unique name, which is a
   * combination of its `$type` name and its `Props` values, the keys of which are defined in `$keyProps`.
   *
   * ```
   * class MyEntity extends Entity<MyEntityProps, MyEntityState> {
   *   $qrl = QRL`./path/to/entity/MyEntity`;
   *   $type = 'myEntity';
   *   $keyProps = ['project', 'task'];
   * }
   * ```
   *
   * The above definition will result in attribute with a QRL pointer like so.
   * ```
   * <div ::myEntity="./path/to/entity/MyEntity">
   * ```
   */
  public static $type: string = null!;

  /**
   * The QRL location of this Entity type.
   *
   * When entities are serialized it is necessary to leave a pointer to location where the entity
   * can be lazy loaded from. `$qrl` serves that purpose.
   *
   * ```
   * class MyEntity extends Entity<MyEntityProps, MyEntityState> {
   *   $qrl = QRL`./path/to/entity/MyEntity`;
   *   $type = 'myEntity';
   *   $keyProps = ['project', 'task'];
   * }
   * ```
   *
   * The above definition will result in all instances of this entity to be encoded with
   * `myEntity` name.
   * ```
   * <div ::myEntity="./path/to/entity/MyEntity"
   *      myEntity:123:456="{completed: false, text: 'sample task'}">
   * ```
   */
  static $qrl: QRL;

  /**
   * Order of properties in `Props` which define the entity key.
   *
   * A entity is uniquely identified by a key such as `myEntity:123:456`. The key consists
   * of `myEntity` which associates the key with a specific entity.
   *
   * For example:
   *
   * ```
   * <div ::myEntity="./path/to/entity/MyEntity"
   *      myEntity:123:456="{completed: false, text: 'sample task'}">
   * ```
   *
   * The key `myEntity:123:456` is associated with `myEntity` which is declared in `::myEntity`
   * attribute. The `123:456` are property values. In order for the key to be converted into
   * `Props` it is necessary to know what each of the values point to. `$keyProps` stores that
   * information.
   *
   * For example a entity defined like so:
   *
   * ```
   * class MyEntity extends Entity<MyEntityProps, MyEntityState> {
   *   $qrl = QRL`./path/to/entity/MyEntity`;
   *   $type = 'myEntity';
   *   $keyProps = ['project', 'task'];
   * }
   * ```
   *
   * Would result it `myEntity:123:456` to be convert to a `Props` of
   * `{project: '123', task: '456'}`. Notice that the `$keyProps` define
   * property names for the key value positions.
   */
  // TODO: Throw error if `$keyProps` is not defined.
  static $keyProps: string[] = [];

  /**
   * Attach QRL definition of the `Entity` to an `Element`.
   *
   * Attaching a entity to an `Element` means that an attribute with the entity name (`$type`) is left
   * in DOM. This is later used when trying to resolve the entity.
   *
   * ```
   * class MyEntity extends Entity<MyProps, MyState> {
   *   $type = 'MyEntity';
   *   $qrl = QRL`somePath/MyEntity`;
   * }
   *
   * MyEntity.$attachEntity(element);
   * ```
   *
   * will result in:
   *
   * ```
   * <div ::my-entity="somePath/MyEntity">
   * ```
   *
   * @param element - Element where the entity definition should be attached.
   */
  // TODO: Is this the right name? we are not attaching, we are more like defining a provider
  static $attachEntity<SERVICE extends Entity<any, any>>(
    this: { new (...args: any[]): SERVICE },
    element: Element
  ): void {
    const entityType: EntityConstructor<SERVICE> = this as any;
    if (!entityType.$type) {
      throw qError(QError.Entity_no$type_entity, entityType);
    }
    if (!entityType.$qrl) {
      throw qError(QError.Entity_no$qrl_entity, entityType);
    }
    const attributeName =
      AttributeMarker.EntityProviderPrefix + fromCamelToKebabCase(entityType.$type);
    const currentQRL = element.getAttribute(attributeName);
    if (!currentQRL) {
      element.setAttribute(attributeName, String(entityType.$qrl));
    } else if (currentQRL != (entityType.$qrl as any)) {
      throw qError(
        QError.Entity_nameCollision_name_currentQrl_expectedQrl,
        entityType.$type,
        currentQRL,
        entityType.$qrl
      );
    }
  }

  /**
   * Attach entity instance state to an `Element`.
   *
   * Attaching a entity state to an `Element` means that the entity `Props` are serialized into
   * entity instance key and entity `State` is serialized into the entity value.
   *
   * ```
   * class MyEntity extends Entity<MyProps, MyState> {
   *   $type = 'MyEntity';
   *   static $keyProps = ['id'];
   *   $qrl = QRL`somePath/MyEntity`;
   * }
   *
   * MyEntity.$attachEntityState(element, {id:123}, {text: 'some text'});
   * ```
   *
   * will result in:
   *
   * ```
   * <div ::my-entity="somePath/MyEntity"
   *      my-entity:123="{text: 'some text'}">
   * ```
   *
   * @param element - Element where the entity definition should be attached.
   */
  static $attachEntityState<SERVICE extends Entity<any, any>>(
    this: { new (...args: any[]): SERVICE },
    host: Element,
    propsOrKey: EntityPropsOf<SERVICE> | EntityKey,
    state: EntityStateOf<SERVICE> | null
  ): void {
    const entityType = this as any as EntityConstructor<SERVICE>;
    entityType.$attachEntity(host);
    const key = typeof propsOrKey == 'string' ? propsOrKey : propsToKey(entityType, propsOrKey);
    if (!host.hasAttribute(String(key))) {
      host.setAttribute(String(key), state == null ? '' : JSON.stringify(state));
    }
  }

  /**
   * Re-hydrate a entity instance.
   *
   * Re-hydration is the process of retrieving or creating a transitive instance of a entity
   * based on a entity `key`.
   *
   * There are these possible scenarios:
   * - `MyEntity.$hydrate(element, props, state)`:
   *   Create new entity (overriding any serialized `State` with the new `state`).
   * - `MyEntity.$hydrate(element, props)`: compute the entity `key` from props:
   *   - If `State` exists in the HTML/DOM for the `key`, use that.
   *   - If no `State` exists in HTML/DOM for the `key` invoke `Entity.$newState()`.
   *     - Possibly throw an error.
   *
   * @param element - Element to which the entity should be (or is) attached.
   * @param propsOrKey - Entity key either serialized to a string or in `Props` format.
   * @param state - Optional new state for the entity instance.
   * @returns `EntityPromise` which contains the `$key` property for synchronous retrieval.
   */
  static $hydrate<SERVICE extends Entity<any, any>>(
    this: { new (...args: any[]): SERVICE },
    element: Element,
    propsOrKey: EntityPropsOf<SERVICE> | EntityKey,
    state?: EntityStateOf<SERVICE>
  ): EntityPromise<SERVICE> {
    const entityType = this as any as EntityConstructor<SERVICE>;
    const key: EntityKey<SERVICE> =
      typeof propsOrKey == 'string'
        ? (propsOrKey as EntityKey<SERVICE>)
        : propsToKey(entityType, propsOrKey);
    if (state) state.$key = key;
    const entityProviderKey = keyToEntityAttribute(key);
    if (!element.hasAttribute(entityProviderKey)) {
      (this as unknown as EntityConstructor<SERVICE>).$attachEntity(element);
    }
    const injector = getInjector(element);
    return injector.getEntity(key, state, this as any);
  }

  /**
   * Converts a serialized `EntityKey` into `EntityProps`.
   *
   * A `EntityKey` is formatted as: `<entityName>:<value1>:<value2>:...`.
   *
   * The purpose of the keys is to be globally unique identifiers in the application
   * so that entity instances can be identified. The keys are string representations
   * because it is important to be able to serialize the keys to HTML.
   *
   * Entity instances prefer to have a parsed version of the key as `EntityProps`.
   * A `EntityKey` contains values only, `EntityProps` are key/value pairs. This function uses
   * `Entity.$keyProps` to identify with which property each value should be associated with.
   *
   * @param key - the serialized `EntityKey` to parse to `EntityProps`.
   * @returns the parsed `EntityProps`.
   */
  static $keyToProps<SERVICE extends Entity<any, any>>(
    this: { new (...args: any[]): SERVICE },
    key: EntityKey
  ): EntityPropsOf<SERVICE> {
    return keyToProps(this as any, key) as EntityPropsOf<SERVICE>;
  }

  /**
   * Serialize `EntityProps` into a `EntityKey` string.
   *
   * A `EntityKey` is formatted as: `<entityName>:<value1>:<value2>:...`.
   *
   * The purpose of the keys is to be globally unique identifiers in the application
   * so that entity instances can be identified. The keys are string representations
   * because it is important to be able to serialize the keys to HTML.
   *
   * Entity instances prefer to have a parsed version of the key as `EntityProps`.
   * A `EntityKey` contains values only, `EntityProps` are key/value pairs. This function uses
   * `Entity.$keyProps` to identify with which property each value should be associated with.
   *
   * @param props - the parsed `EntityProps` to serialize.
   * @returns the serialized `EntityKey`.
   */
  static $propsToKey<SERVICE extends Entity<any, any>>(
    this: { new (...args: any[]): SERVICE },
    props: EntityPropsOf<SERVICE>
  ): EntityKey {
    return propsToKey(this as any, props) as EntityKey;
  }

  /////////////////////////////////////////////////
  readonly $element: Element;
  readonly $props: PROPS;
  readonly $state: STATE;
  readonly $key: EntityKey<any>; // TODO(type): `any` is not correct here.

  constructor(element: Element, props: PROPS, state: STATE | null) {
    const entityType = getEntityType(this) as EntityConstructor<Entity<PROPS, STATE>>;
    this.$props = props;
    this.$state = state!; // TODO: is this right?
    this.$element = element!;
    this.$key = propsToKey(entityType as any, props);
    props && entityType.$attachEntity(element);
    props && entityType.$attachEntityState(element, props, null);
  }

  /**
   * Lazy loads code through QRL and invokes it.
   *
   * This method can be used inside entities to avoid loading the implementation of methods until
   * they are required.
   *
   * ```
   * class MyEntity extends Entity<MyEntityProps, MyEntityState> {
   *   $qrl = QRL`./path/to/entity/MyEntity`;
   *   $type = 'myEntity';
   *   $keyProps = ['project', 'task'];
   *
   *   async myUppercase(text: string): Promise<string> {
   *     return this.$invokeQRL(
   *         import.meta.url,
   *         QRL<(text: string) => string>`path_to_lazy_loaded_function`,
   *         text
   *       );
   *   }
   * }
   * ```
   *
   * @param qrl - QRL to the function to lazy load and execute.
   * @param args - arguments to pass to the QRL function.
   * @returns a Promise of the value returned from the invoked function.
   */
  async $invokeQRL<ARGS extends any[], RET>(
    qrl: QRL<(...args: ARGS) => RET>,
    ...args: ARGS
  ): Promise<RET> {
    const delegate = await qImport(this.$element, qrl);
    return getInjector(this.$element).invoke(delegate as any, this, ...args);
  }

  /**
   * Invoked during hydration if state is not provide or can't be rehydrated from HTML/DOM.
   *
   * Lifecycle order:
   * - `new Entity(...)`
   * - `$newState(props)`: Invoked if no serialized state found in DOM.
   * - `$init()`
   * - Entity instance returned by the `Injector`.
   *
   * ```
   * class MyEntity extends Entity<MyEntityProps, MyEntityState> {
   *   $qrl = QRL`./path/to/entity/MyEntity`;
   *   $type = 'myEntity';
   *   $keyProps = ['project', 'task'];
   *
   *   async $newState(props: MyEntityProps): Promise<string> {
   *     // either compute new state OR call to the backend to retrieve it.
   *     return state;
   *   }
   * }
   * ```
   *
   * @param props - the `EntityProps` that identify the new instance of the entity.
   */
  $newState(keyProps: PROPS): Promise<STATE> {
    const entityType = this.constructor as EntityConstructor<any>;
    throw qError(QError.Entity_noState_entity_props, entityType.$type, keyProps);
  }

  /**
   * Lifecycle method invoked on hydration.
   *
   * After the entity creation and after the state is restored (either from DOM or by invoking
   * `$newState`) this method is invoked. The purpose of this method is to allow the entity
   * to compute any transient state.
   *
   * Lifecycle order:
   * - `new Entity(...)`
   * - `$newState(props)`: Invoked if no serialized state found in DOM.
   * - `$init()`
   * - Entity instance returned by the `Injector`.
   */
  async $init() {}

  /**
   * Release the entity.
   *
   * Releasing entity means that the transient entity instance is released from memory and it
   * becomes eligible for garbage collection. It also removes the entity state
   * from its associated element in the HTML/DOM.
   *
   * Releasing a entity does not imply that the state should be deleted on the backend.
   */
  $release(): void {
    const injector = getInjector(this.$element);
    const entityType = getEntityType(this);
    const key = propsToKey(entityType, this.$props);
    injector.releaseEntity(key);
  }
}

/**
 * Retrieve the `EntityConstructor<SERVICE>` from the `Entity`
 * @param entity
 * @returns
 * @internal
 */
function getEntityType<SERVICE extends Entity<any, any>>(
  entity: SERVICE
): EntityConstructor<SERVICE> {
  if (!(entity instanceof Entity)) {
    throw qError(QError.Entity_expected_obj, entity);
  }
  const entityType = entity.constructor as any as EntityConstructor<SERVICE>;
  if (entityType.$attachEntityState !== Entity.$attachEntityState) {
    throw qError(QError.Entity_overridesConstructor_entity, entity);
  }
  return entityType;
}

/**
 * Returns `State` type of `Entity`.
 *
 * Given:
 * ```
 * class MyEntity extends Entity<MyProps, MyState> {
 *   ...
 * }
 *
 * const myEntity: MyEntity = ...;
 * ```
 * Then `EntityStateOf<MyEntity>` returns `MyState`.
 * @public
 */
export type EntityStateOf<SERVICE extends Entity<any, any>> = SERVICE extends Entity<
  any,
  infer STATE
>
  ? STATE
  : never;

/**
 * Returns `Props` type of `Entity`.
 *
 * Given:
 * ```
 * class MyEntity extends Entity<MyProps, MyState> {
 *   ...
 * }
 *
 * const myEntity: MyEntity = ...;
 * ```
 * Then `EntityPropsOf<MyEntity>` returns `MyProps`.
 * @public
 */
export type EntityPropsOf<SERVICE extends Entity<any, any>> = SERVICE extends Entity<
  infer PROPS,
  any
>
  ? PROPS
  : never;

/**
 * `Promise` which resolves to a `Entity` instance but is extended with its `EntityKey`.
 *
 * @public
 */
export interface EntityPromise<SERVICE extends Entity<any, any>> extends Promise<SERVICE> {
  /**
   * The `EntityKey` associated with the current `Entity` instance.
   *
   * Normally one can retrieve `$key` from a `Entity` instance. In the case of the `Promise`
   * it may not be convenient to wait for the `Promise` to resolve, in which case retrieving
   * `$key` synchronously is more convenient.
   */
  $key: EntityKey<SERVICE>;
}

/**
 * @internal
 */
export function isEntity(value: any): value is Entity<any, any> {
  return Object.prototype.hasOwnProperty.call(value, '$key');
}

/**
 * Entity Constructor.
 * @public
 */
export interface EntityConstructor<SERVICE extends Entity<any, any> = any> {
  /**
   * A entity name.
   *
   * All entity instances of this type have this name.
   *
   * When entities are serialized each entity instance needs to have a unique name, which is a
   * combination of its `$type` name and its `Props` values, the keys of which are defined in `$keyProps`.
   *
   * ```
   * class MyEntity extends Entity<MyEntityProps, MyEntityState> {
   *   $qrl = QRL`./path/to/entity/MyEntity`;
   *   $type = 'myEntity';
   *   $keyProps = ['project', 'task'];
   * }
   * ```
   *
   * The above definition will result in attribute with a QRL pointer like so.
   * ```
   * <div ::myEntity="./path/to/entity/MyEntity">
   * ```
   */
  readonly $type: string;

  /**
   * The QRL location of this Entity type.
   *
   * When entities are serialized it is necessary to leave a pointer to location where the entity
   * can be lazy loaded from. `$qrl` serves that purpose.
   *
   * ```
   * class MyEntity extends Entity<MyEntityProps, MyEntityState> {
   *   $qrl = QRL`./path/to/entity/MyEntity`;
   *   $type = 'myEntity';
   *   $keyProps = ['project', 'task'];
   * }
   * ```
   *
   * The above definition will result in all instances of this entity to be encoded with
   * `myEntity` name.
   * ```
   * <div ::myEntity="./path/to/entity/MyEntity"
   *      myEntity:123:456="{completed: false, text: 'sample task'}">
   * ```
   */
  readonly $qrl: QRL;

  /**
   * Order of properties in `Props` which define the entity key.
   *
   * A entity is uniquely identified by a key such as `myEntity:123:456`. The key consists
   * of `myEntity` which associates the key with a specific entity.
   *
   * For example:
   *
   * ```
   * <div ::myEntity="./path/to/entity/MyEntity"
   *      myEntity:123:456="{completed: false, text: 'sample task'}">
   * ```
   *
   * The key `myEntity:123:456` is associated with `myEntity` which is declared in `::myEntity`
   * attribute. The `123:456` are property values. In order for the key to be converted into
   * `Props` it is necessary to know what each of the values point to. `$keyProps` stores that
   * information.
   *
   * For example a entity defined like so:
   *
   * ```
   * class MyEntity extends Entity<MyEntityProps, MyEntityState> {
   *   $qrl = QRL`./path/to/entity/MyEntity`;
   *   $type = 'myEntity';
   *   $keyProps = ['project', 'task'];
   * }
   * ```
   *
   * Would result it `myEntity:123:456` to be convert to a `Props` of
   * `{project: '123', task: '456'}`. Notice that the `$keyProps` define
   * property names for the key value positions.
   */
  readonly $keyProps: string[];

  /**
   * Attach QRL definition of the `Entity` to an `Element`.
   *
   * Attaching a entity to an `Element` means that an attribute with the entity name (`$type`) is left
   * in DOM. This is later used when trying to resolve the entity.
   *
   * ```
   * class MyEntity extends Entity<MyProps, MyState> {
   *   $type = 'MyEntity';
   *   $qrl = QRL`somePath/MyEntity`;
   * }
   *
   * MyEntity.$attachEntity(element);
   * ```
   *
   * will result in:
   *
   * ```
   * <div ::my-entity="somePath/MyEntity">
   * ```
   *
   * @param element - Element where the entity definition should be attached.
   */
  $attachEntity<SERVICE extends Entity<any, any>>(
    this: { new (...args: any[]): SERVICE },
    element: Element
  ): void;

  /**
   * Attach entity instance state to an `Element`.
   *
   * Attaching a entity state to an `Element` means that the entity `Props` are serialized into
   * entity instance key and entity `State` is serialized into the entity value.
   *
   * ```
   * class MyEntity extends Entity<MyProps, MyState> {
   *   $type = 'MyEntity';
   *   static $keyProps = ['id'];
   *   $qrl = QRL`somePath/MyEntity`;
   * }
   *
   * MyEntity.$attachEntityState(element, {id:123}, {text: 'some text'});
   * ```
   *
   * will result in:
   *
   * ```
   * <div ::my-entity="somePath/MyEntity"
   *      my-entity:123="{text: 'some text'}">
   * ```
   *
   * @param element - Element where the entity definition should be attached.
   */
  $attachEntityState<SERVICE extends Entity<any, any>>(
    this: { new (...args: any[]): SERVICE },
    host: Element,
    propsOrKey: EntityPropsOf<SERVICE> | EntityKey,
    state: EntityStateOf<SERVICE> | null
  ): void;

  /**
   * Re-hydrate a entity instance.
   *
   * Re-hydration is the process of retrieving or creating a transitive instance of a entity
   * based on a entity `key`.
   *
   * There are these possible scenarios:
   * - `MyEntity.$hydrate(element, props, state)`:
   *   Create new entity (overriding any serialized `State` with the new `state`).
   * - `MyEntity.$hydrate(element, props)`: compute the entity `key` from props:
   *   - If `State` exists in the HTML/DOM for the `key`, use that.
   *   - If no `State` exists in HTML/DOM for the `key` invoke `Entity.$newState()`.
   *     - Possibly throw an error.
   *
   * @param element - Element to which the entity should be (or is) attached.
   * @param propsOrKey - Entity key either serialized to a string or in `Props` format.
   * @param state - Optional new state for the entity instance.
   * @returns `EntityPromise` which contains the `$key` property for synchronous retrieval.
   */
  $hydrate<SERVICE extends Entity<any, any>>(
    this: { new (...args: any[]): SERVICE },
    element: Element,
    propsOrKey: EntityPropsOf<SERVICE> | EntityKey,
    state?: EntityStateOf<SERVICE>
  ): EntityPromise<SERVICE>;

  /**
   * Converts a serialized `EntityKey` into `EntityProps`.
   *
   * A `EntityKey` is formatted as: `<entityName>:<value1>:<value2>:...`.
   *
   * The purpose of the keys is to be globally unique identifiers in the application
   * so that entity instances can be identified. The keys are string representations
   * because it is important to be able to serialize the keys to HTML.
   *
   * Entity instances prefer to have a parsed version of the key as `EntityProps`.
   * A `EntityKey` contains values only, `EntityProps` are key/value pairs. This function uses
   * `Entity.$keyProps` to identify with which property each value should be associated with.
   *
   * @param key - the serialized `EntityKey` to parse to `EntityProps`.
   * @returns the parsed `EntityProps`.
   */
  $keyToProps<SERVICE extends Entity<any, any>>(
    this: { new (...args: any[]): SERVICE },
    key: EntityKey<SERVICE>
  ): EntityPropsOf<SERVICE>;

  /**
   * Serialize `EntityProps` into a `EntityKey` string.
   *
   * A `EntityKey` is formatted as: `<entityName>:<value1>:<value2>:...`.
   *
   * The purpose of the keys is to be globally unique identifiers in the application
   * so that entity instances can be identified. The keys are string representations
   * because it is important to be able to serialize the keys to HTML.
   *
   * Entity instances prefer to have a parsed version of the key as `EntityProps`.
   * A `EntityKey` contains values only, `EntityProps` are key/value pairs. This function uses
   * `Entity.$keyProps` to identify with which property each value should be associated with.
   *
   * @param props - the parsed `EntityProps` to serialize.
   * @returns the serialized `EntityKey`.
   */
  $propsToKey<SERVICE extends Entity<any, any>>(
    this: { new (...args: any[]): SERVICE },
    props: EntityPropsOf<SERVICE>
  ): EntityKey;

  new (
    hostElement: Element,
    props: any, // TODO: should be: EntityPropsOf<SERVICE>,
    state: any // TODO: should be: EntityStateOf<SERVICE> | null
  ): SERVICE;
}
