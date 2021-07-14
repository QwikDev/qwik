/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import type { EntityKey } from '../entity/entity_key';
import type { Component, ComponentConstructor } from '../component/component';
import { qError, QError } from '../error/error';
import type {
  Entity,
  EntityConstructor,
  EntityPromise,
  EntityPropsOf,
  EntityStateOf,
} from '../entity/entity';
import { extractPropsFromElement } from '../util/attributes';
import { resolveArgs } from './resolve_args';
import type { InjectedFunction, Injector, Props } from './types';

export abstract class BaseInjector implements Injector {
  element: Element;
  private _props: Props | null = null;

  constructor(element: Element) {
    this.element = element;
  }
  invoke<SELF, ARGS extends any[], REST extends any[], RET>(
    fn: InjectedFunction<SELF, ARGS, REST, RET> | ((...args: [...REST]) => RET),
    self?: SELF | null,
    ...rest: REST
  ): Promise<RET> {
    if ((fn as any).default) {
      fn = (fn as any).default;
    }

    if (isInjectedFunction(fn)) {
      try {
        const selfType = fn.$thisType;
        if (self && selfType && !(self instanceof (selfType as any))) {
          throw qError(
            QError.Injector_wrongMethodThis_expected_actual,
            selfType,
            (self as {}).constructor
          );
        }
        const hasSelf = selfType && self == null;
        return resolveArgs(
          this,
          hasSelf ? this.getComponent(selfType as any) : self,
          ...fn.$inject
        ).then(
          (values: any[]) => {
            return (fn as any).apply(values.shift(), values.concat(rest));
          },
          (error) => Promise.reject(addDeclaredInfo(fn as any, error))
        );
      } catch (e) {
        throw addDeclaredInfo(fn, e);
      }
    } else {
      return Promise.resolve((fn as any).apply(null, rest));
    }
  }

  set elementProps(props: Props) {
    this._props = props;
  }
  get elementProps(): Props {
    const existingProps = this._props;
    if (existingProps != null) {
      return existingProps;
    }
    return extractPropsFromElement(this.element);
  }

  abstract getComponent<COMP extends Component<any, any>>(
    componentType: ComponentConstructor<COMP>
  ): Promise<COMP>;
  abstract getEntity<SERVICE extends Entity<any, any>>(
    entityKey: EntityKey<SERVICE>,
    state?: EntityStateOf<SERVICE>,
    entityType?: EntityConstructor<SERVICE>
  ): EntityPromise<SERVICE>;

  abstract getEntityState<SERVICE extends Entity<any, any>>(
    entityKey: EntityPropsOf<SERVICE> | EntityKey
  ): Promise<EntityStateOf<SERVICE>>;

  abstract getParent(): Injector | null;

  abstract releaseEntity(key: EntityKey): void;
  abstract serialize(): void;
}

function addDeclaredInfo(fn: { $debugStack?: Error }, error: any) {
  const debugStack = fn.$debugStack;
  if (!debugStack) return error;
  if (!(error instanceof Error)) {
    error = new Error(String(error));
  }
  const declaredFrames = debugStack.stack!.split('\n');
  const declaredFrame = declaredFrames[2].trim();
  const stack = error.stack!;
  const msg = error.message;
  error.stack = stack.replace(msg, msg + '\n      DECLARED ' + declaredFrame);
  return error;
}

function isInjectedFunction<SELF, ARGS extends any[], REST extends any[], RET>(
  value: any
): value is InjectedFunction<SELF, ARGS, REST, RET> {
  return !!value.$inject;
}
