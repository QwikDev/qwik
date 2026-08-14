import { createContextId, type NoSerialize, type Signal } from '@qwik.dev/core';
import type { RouteLoaderCtx, RouteLoaderState } from './route-loaders';
import type {
  ContentModule,
  ContentState,
  ContentStateInternal,
  HttpStatus,
  ResolvedDocumentHead,
  RouteAction,
  RouteLocation,
  RouteNavigate,
  RoutePreventNavigate,
} from './types';

export const RouteStateContext = /*#__PURE__*/ createContextId<RouteLoaderState>('qr-s');

export const RouteLoaderCtxContext = /*#__PURE__*/ createContextId<RouteLoaderCtx>('qr-lc');

export const ContentContext = /*#__PURE__*/ createContextId<ContentState>('qr-c');

/** What one routed level renders; components are nav-time data and never serialize. */
export type RoutedLevelComponent = NoSerialize<ContentModule['default']> | null;

/** One signal per route level; navs write only the levels whose module loader changed. */
export interface RoutedLevels {
  signals: Signal<RoutedLevelComponent>[];
}

export const RoutedLevelsContext = /*#__PURE__*/ createContextId<RoutedLevels>('qr-rl');
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
