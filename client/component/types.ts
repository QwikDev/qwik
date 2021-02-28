/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { QRL } from '../import/types.js';
import { AsyncProvider, InjectableConcreteType, InjectionContext } from '../injection/types.js';

export interface ComponentContext<P, S> {
  host: Element;
  state: S | undefined;
  props: P;
}

export interface ElementExpando<C> extends Element {
  $QOOT_COMPONENT?: C | Promise<C>;
}

export interface Component<P, S> {
  $host: Element;
  $state: S;
  $props: P;
}

export interface ComponentType<T, ARGS extends any[]> extends InjectableConcreteType<T, ARGS> {
  $inject: AsyncProvider<any>[];
  new (...args: ARGS): T;
  new: <T extends Component<P, S>, P, S, ARGS extends any[]>(
    this: ComponentType<Component<P, S>, ARGS>,
    componentInjectionContext: ComponentContext<P, S>,
    ...args: ARGS
  ) => T;
  newInject: <T extends Component<P, S>, P, S, ARGS extends any[]>(
    this: ComponentType<Component<P, S>, ARGS>,
    injectionContext: InjectionContext
  ) => T | Promise<T>;
}

export function isComponentType(value: any): value is ComponentType<any, any> {
  return (
    typeof value === 'function' && typeof (value as ComponentType<any, any>).new === 'function'
  );
}

export interface Props {
  // $: QProps;
  [key: string]: string | boolean | number | null | undefined;
}

export interface QProps {
  [key: string]: string | QRL;
}
