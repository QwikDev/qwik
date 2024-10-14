import { createContextId, type Signal } from '@builder.io/qwik';
import type {
  ContentState,
  ContentStateInternal,
  ResolvedDocumentHead,
  RouteAction,
  RouteLocation,
  RouteNavigate,
  RoutePreventNavigate,
  RouteStateInternal,
} from './types';

export const RouteStateContext = /*#__PURE__*/ createContextId<Record<string, any>>('qc-s');

export const ContentContext = /*#__PURE__*/ createContextId<ContentState>('qc-c');
export const ContentInternalContext =
  /*#__PURE__*/ createContextId<Signal<ContentStateInternal>>('qc-ic');

export const DocumentHeadContext =
  /*#__PURE__*/ createContextId<Required<ResolvedDocumentHead>>('qc-h');
export const RouteLocationContext = /*#__PURE__*/ createContextId<RouteLocation>('qc-l');

export const RouteNavigateContext = /*#__PURE__*/ createContextId<RouteNavigate>('qc-n');

export const RouteActionContext = /*#__PURE__*/ createContextId<RouteAction>('qc-a');

export const RouteInternalContext =
  /*#__PURE__*/ createContextId<Signal<RouteStateInternal>>('qc-ir');

export const RoutePreventNavigateContext =
  /*#__PURE__*/ createContextId<RoutePreventNavigate>('qc-p');
