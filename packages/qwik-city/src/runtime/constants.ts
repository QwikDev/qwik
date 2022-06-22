import { createContext, jsx, SkipRerender } from '@builder.io/qwik';
import type { Page, Route } from './types';

export const PageContext = /*#__PURE__*/ createContext<Page>('qc-page');

export const RouteContext = /*#__PURE__*/ createContext<Route>('qc-route');

export const MODULE_CACHE = /*#__PURE__*/ new WeakMap<any, any>();

export const JsxSkipRerender = /*#__PURE__*/ jsx(SkipRerender, {});

export const ROUTE_TYPE_ENDPOINT = 1;
