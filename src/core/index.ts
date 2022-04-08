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
  componentQrl,
  component$,
  onUnmountQrl,
  onUnmount$,
  onPauseQrl,
  onPause$,
  onResumeQrl,
  onResume$,
  on,
  onDocument,
  onWindow,
  useStylesQrl,
  useStyles$,
  useScopedStylesQrl,
  useScopedStyles$,
} from './component/component.public';

export type { PropsOf, ComponentOptions, OnRenderFn } from './component/component.public';

//////////////////////////////////////////////////////////////////////////////////////////
// Developer Event API
//////////////////////////////////////////////////////////////////////////////////////////
export { pauseContainer } from './object/store.public';
//////////////////////////////////////////////////////////////////////////////////////////
// Internal Runtime
//////////////////////////////////////////////////////////////////////////////////////////
export { $, implicit$FirstArg } from './import/qrl.public';
export { qrl } from './import/qrl';
export type { QRL, EventHandler } from './import/qrl.public';

export type { Props } from './props/props.public';

export { notifyRender } from './render/notify-render';
//////////////////////////////////////////////////////////////////////////////////////////
// PLATFORM
//////////////////////////////////////////////////////////////////////////////////////////
export { getPlatform, setPlatform } from './platform/platform';
export type { CorePlatform } from './platform/types';
//////////////////////////////////////////////////////////////////////////////////////////
// Watch
//////////////////////////////////////////////////////////////////////////////////////////
export { useWatch$, useWatchQrl } from './watch/watch.public';
export type { Observer } from './watch/watch.public';

//////////////////////////////////////////////////////////////////////////////////////////
// JSX Support
//////////////////////////////////////////////////////////////////////////////////////////
export { Async } from './render/jsx/async.public';
export type { PromiseValue } from './render/jsx/async.public';

//////////////////////////////////////////////////////////////////////////////////////////
// JSX Runtime
//////////////////////////////////////////////////////////////////////////////////////////
export { h } from './render/jsx/factory';
export { Host, SkipRerender } from './render/jsx/host.public';
export { Slot } from './render/jsx/slot.public';
export { Fragment, jsx, jsxDEV, jsxs } from './render/jsx/jsx-runtime';
export type {
  ComponentChild,
  ComponentChildren,
  FunctionComponent,
  JSXFactory,
  JSXNode,
  RenderableProps,
} from './render/jsx/types/jsx-node';
export type { QwikDOMAttributes, QwikJSX } from './render/jsx/types/jsx-qwik';
export type { QwikIntrinsicElements } from './render/jsx/types/jsx-qwik-elements';
export { render } from './render/render.public';
//////////////////////////////////////////////////////////////////////////////////////////
// use API
//////////////////////////////////////////////////////////////////////////////////////////
export { useHostElement } from './use/use-host-element.public';
export { useDocument } from './use/use-document.public';
export { useEvent } from './use/use-event.public';
export { useLexicalScope } from './use/use-lexical-scope.public';
export { useStore } from './use/use-store.public';
export { useSubscriber, wrapSubscriber, unwrapSubscriber } from './use/use-subscriber';

//////////////////////////////////////////////////////////////////////////////////////////
// Developer Low-Level API
//////////////////////////////////////////////////////////////////////////////////////////
export type { ValueOrPromise } from './util/types';
export type { NoSerialize } from './object/q-object';
export { noSerialize } from './object/q-object';

export { version } from './version';
