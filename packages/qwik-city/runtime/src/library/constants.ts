import { createContext } from '@builder.io/qwik';
import type { QwikCityState } from './types';

export const QwikCityContext = /*#__PURE__*/ createContext<QwikCityState>('qwik-city');

export const MODULE_CACHE = /*#__PURE__*/ new WeakMap<any, any>();

export const ROUTE_TYPE_ENDPOINT = 1;
