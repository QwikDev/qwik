import { createContext } from '@builder.io/qwik';
import type {
  ContentMenu,
  ContentResponse,
  ContentState,
  DocumentHead,
  RouteData,
  RouteLocation,
} from './types';

export const ContentContext = /*#__PURE__*/ createContext<ContentState>('qc-c');
export const ContentMenusContext = /*#__PURE__*/ createContext<{ [pathName: string]: ContentMenu }>(
  'qc-m'
);
export const DocumentHeadContext = /*#__PURE__*/ createContext<DocumentHead>('qc-h');
export const RouteLocationContext = /*#__PURE__*/ createContext<RouteLocation>('qc-l');
export const RoutesContext = /*#__PURE__*/ createContext<RouteData[]>('qc-r');
export const ResponseContext = /*#__PURE__*/ createContext<ContentResponse>('qc-s');

export const MODULE_CACHE = /*#__PURE__*/ new WeakMap<any, any>();

export const ROUTE_TYPE_ENDPOINT = 1;
