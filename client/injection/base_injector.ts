/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { ComponentType, IComponent } from '../component/types.js';
import { qError, QError } from '../error/error.js';
import { IService, ServicePromise, ServiceStateOf, ServiceType } from '../service/types.js';
import { extractPropsFromElement } from '../util/attributes.js';
import '../util/qDev.js';
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
        const providerPromises = fn.$inject.map((provider) => provider && provider(this));
        const selfType = fn.$thisType;
        if (self && selfType && !(self instanceof (selfType as any))) {
          throw qError(
            QError.Injection_wrongMethodThis_expected_actual,
            selfType,
            (self as {}).constructor
          );
        }
        if (selfType && self == null) {
          providerPromises.push(this.getComponent(selfType as any));
        }
        return Promise.all(providerPromises).then((values) => {
          if (selfType && self == null) {
            self = values.pop();
          }
          values = values.concat(rest);
          return (fn as any).apply(self, values as any);
        });
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

  abstract getComponent<COMP extends IComponent<any, any>>(
    componentType: ComponentType<COMP>
  ): Promise<COMP>;
  abstract getService<SERVICE extends IService<any, any>>(
    serviceKey: string,
    state?: ServiceStateOf<SERVICE>,
    serviceType?: ServiceType<SERVICE>
  ): ServicePromise<SERVICE>;

  abstract getServiceState<SERVICE extends IService<any, any>>(
    propsOrKey: string | ServiceStateOf<SERVICE>
  ): Promise<SERVICE>;

  abstract getParent(): Injector | null;
}

function isInjectedFunction<SELF, ARGS extends any[], REST extends any[], RET>(
  value: any
): value is InjectedFunction<SELF, ARGS, REST, RET> {
  return !!value.$inject;
}

async function invoke<SELF extends {}, PROVIDERS extends any[], REST extends any[], RET>(
  injector: BaseInjector,
  fn: InjectedFunction<SELF, PROVIDERS, REST, RET>,
  self: SELF | null,
  providers: PROVIDERS,
  rest: REST
): Promise<RET> {
  try {
    const providerPromises: any[] = [];
    for (let i = 0; i < providers.length; i++) {
      const provider = providers[i];
      providerPromises.push(provider(injector));
    }
    return Promise.all(providerPromises).then((values) => {
      values = values.concat(rest);
      return (fn as Function).apply(self as SELF, values as any);
    });
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
}
