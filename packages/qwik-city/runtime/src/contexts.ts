import { createContext } from '@builder.io/qwik';
import type {
  ContentState,
  ContentStateInternal,
  ResolvedDocumentHead,
  RouteAction,
  RouteLocation,
  RouteNavigate,
} from './types';

export const RouteStateContext = /*#__PURE__*/ createContext<Record<string, any>>('qc-s');

export const ContentContext = /*#__PURE__*/ createContext<ContentState>('qc-c');
export const ContentInternalContext = /*#__PURE__*/ createContext<ContentStateInternal>('qc-ic');

export const DocumentHeadContext =
  /*#__PURE__*/ createContext<Required<ResolvedDocumentHead>>('qc-h');
export const RouteLocationContext = /*#__PURE__*/ createContext<RouteLocation>('qc-l');

export const RouteNavigateContext = /*#__PURE__*/ createContext<RouteNavigate>('qc-n');

export const RouteActionContext = /*#__PURE__*/ createContext<RouteAction>('qc-a');
