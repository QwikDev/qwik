/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

//////////////////////////////////////////////////////////////////////////////////////////
// Developer Core API
//////////////////////////////////////////////////////////////////////////////////////////
export {
  PropsOf,
  component,
  component$,
  onRender,
  onRender$,
  onUnmount,
  onUnmount$,
  onHydrate,
  onHydrate$,
  onDehydrate,
  onDehydrate$,
  onResume,
  onResume$,
  on,
  onDocument,
  onWindow,
  withStyles,
  withStyles$,
  withScopedStyles,
  withScopedStyles$,
} from './component/component.public';
//////////////////////////////////////////////////////////////////////////////////////////
// Developer Event API
//////////////////////////////////////////////////////////////////////////////////////////
export { bubble } from './event/bubble.public';
export { dehydrate } from './object/store.public';
//////////////////////////////////////////////////////////////////////////////////////////
// Internal Runtime
//////////////////////////////////////////////////////////////////////////////////////////
export { $, implicit$FirstArg, qrl, QRL, qrlImport } from './import/qrl.public';
export { getProps, Props } from './props/props.public';
export { notifyRender } from './render/notify-render';
//////////////////////////////////////////////////////////////////////////////////////////
// PLATFORM
//////////////////////////////////////////////////////////////////////////////////////////
export { getPlatform, setPlatform } from './platform/platform';
export { CorePlatform } from './platform/types';
//////////////////////////////////////////////////////////////////////////////////////////
// JSX Support
//////////////////////////////////////////////////////////////////////////////////////////
export { Async, PromiseValue } from './render/jsx/async.public';
//////////////////////////////////////////////////////////////////////////////////////////
// JSX Runtime
//////////////////////////////////////////////////////////////////////////////////////////
export { h } from './render/jsx/factory';
export { Host } from './render/jsx/host.public';
export { Slot } from './render/jsx/slot.public';
export { Fragment, jsx, jsxDEV, jsxs } from './render/jsx/jsx-runtime';
export {
  ComponentChild,
  ComponentChildren,
  FunctionComponent,
  JSXFactory,
  JSXNode,
  RenderableProps,
} from './render/jsx/types/jsx-node';
export { QwikDOMAttributes, QwikJSX } from './render/jsx/types/jsx-qwik';
export type { QwikIntrinsicElements } from './render/jsx/types/jsx-qwik-elements';
export { render } from './render/render.public';
//////////////////////////////////////////////////////////////////////////////////////////
// use API
//////////////////////////////////////////////////////////////////////////////////////////
export { useURL } from './use/use-url.public';
export { useHostElement } from './use/use-host-element.public';
export { useEvent } from './use/use.event.public';
export { useLexicalScope } from './use/use-lexical-scope.public';
export { useStore } from './use/use-state.public';
export { useTransient } from './use/use-transient.public';
//////////////////////////////////////////////////////////////////////////////////////////
// Developer Low-Level API
//////////////////////////////////////////////////////////////////////////////////////////
export { ValueOrPromise } from './util/types';

/**
 * @alpha
 */
export const version = (globalThis as any).QWIK_VERSION as string;
