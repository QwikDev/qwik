/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { ServiceKey } from '../service/service_key.js';
import type { Component, ComponentConstructor } from '../component/component.js';
import { qError, QError } from '../error/error.js';
import {
  Service,
  ServiceConstructor,
  ServicePromise,
  ServicePropsOf,
  ServiceStateOf,
} from '../service/service.js';
import { extractPropsFromElement } from '../util/attributes.js';
import '../util/qDev.js';
import { resolveArgs } from './resolve_args.js';
import { InjectedFunction, Injector, Props } from './types.js';

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
          (error) => Promise.reject(addDeclaredInfo(fn, error))
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
  abstract getService<SERVICE extends Service<any, any>>(
    serviceKey: ServiceKey<SERVICE>,
    state?: ServiceStateOf<SERVICE>,
    serviceType?: ServiceConstructor<SERVICE>
  ): ServicePromise<SERVICE>;

  abstract getServiceState<SERVICE extends Service<any, any>>(
    serviceKey: ServicePropsOf<SERVICE> | ServiceKey
  ): Promise<ServiceStateOf<SERVICE>>;

  abstract getParent(): Injector | null;

  abstract releaseService(key: ServiceKey): void;
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
