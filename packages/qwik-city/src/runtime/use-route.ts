import { useContext } from '@builder.io/qwik';
import { RouteContext } from './constants';
import type { Route } from './types';

/**
 * @public
 */
export const useRoute = (): Route => useContext(RouteContext);
