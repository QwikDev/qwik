/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

export { injectFunction, injectMethod } from './inject';
export { getInjector, ElementInjector } from './element_injector';
export type {
  Provider,
  ConcreteType,
  Injector,
  ProviderReturns,
  InjectedFunction,
  Props,
  Providers,
} from './types';
export { provideInjector } from './provide_injector';
export { provideProviderOf } from './provide_provider_of';
