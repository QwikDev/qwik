import { createContext, jsx, SkipRerender } from '@builder.io/qwik';
import type { ContentModules, Page, Route } from './types';

export const PageContext = /*#__PURE__*/ createContext<Page>('qwikcity-page');

export const RouteContext = /*#__PURE__*/ createContext<Route>('qwikcity-route');

export const ContentContext = /*#__PURE__*/ createContext<ContentModules>('qwikcity-content');

export const MODULE_CACHE = /*#__PURE__*/ new WeakMap<any, any>();

export const JsxSkipRerender = /*#__PURE__*/ jsx(SkipRerender, {});

export const ROUTE_TYPE_ENDPOINT = 1;
