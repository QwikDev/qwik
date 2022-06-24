import { createContext, jsx, SkipRerender } from '@builder.io/qwik';
import type { QwikCityState } from './types';

export const QwikCityContext = createContext<QwikCityState>('qwik-city');

export const MODULE_CACHE = /*#__PURE__*/ new WeakMap<any, any>();

export const JsxSkipRerender = /*#__PURE__*/ jsx(SkipRerender, {});

export const ROUTE_TYPE_ENDPOINT = 1;
