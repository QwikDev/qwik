import { createContext } from '@builder.io/qwik';
import type { Page, Route } from './types';

export const PageContext = /*#__PURE__*/ createContext<Page>('qwikcity-page');

export const RouteContext = /*#__PURE__*/ createContext<Route>('qwikcity-route');

export const MODULE_CACHE = /*#__PURE__*/ new WeakMap<any, any>();

export const ROUTE_TYPE_ENDPOINT = 1;
