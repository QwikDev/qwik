import { createContextId, type Signal } from '@qwik.dev/core';
import type { AsyncSignal } from '@qwik.dev/core/internal';
import type { RouteLoaderCtx } from './route-loaders';
import type {
  ContentState,
  ContentStateInternal,
  HttpStatus,
  ResolvedDocumentHead,
  RouteAction,
  RouteLocation,
  RouteNavigate,
  RoutePreventNavigate,
} from './types';

export const RouteStateContext =
  /*#__PURE__*/ createContextId<Record<string, AsyncSignal<unknown>>>('qr-s');

export const RouteLoaderCtxContext = /*#__PURE__*/ createContextId<RouteLoaderCtx>('qr-lc');

export const ContentContext = /*#__PURE__*/ createContextId<ContentState>('qr-c');
export const ContentInternalContext =
  /*#__PURE__*/ createContextId<Signal<ContentStateInternal>>('qr-ic');

export const DocumentHeadContext =
  /*#__PURE__*/ createContextId<Required<ResolvedDocumentHead>>('qr-h');
export const RouteLocationContext = /*#__PURE__*/ createContextId<RouteLocation>('qr-l');

export const RouteNavigateContext = /*#__PURE__*/ createContextId<RouteNavigate>('qr-n');

export const RouteActionContext = /*#__PURE__*/ createContextId<RouteAction>('qr-a');

export const RoutePreventNavigateContext =
  /*#__PURE__*/ createContextId<RoutePreventNavigate>('qr-p');

export const HttpStatusContext = /*#__PURE__*/ createContextId<Signal<HttpStatus>>('qr-hs');
