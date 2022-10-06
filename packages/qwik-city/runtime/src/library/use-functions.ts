import { noSerialize, useContext, useEnvData } from '@builder.io/qwik';
import {
  ContentContext,
  DocumentHeadContext,
  RouteLocationContext,
  RouteNavigateContext,
} from './contexts';
import type { QwikCityEnvData, ResolvedDocumentHead, RouteLocation, RouteNavigate } from './types';

/**
 * @alpha
 */
export const useContent = () => useContext(ContentContext);

/**
 * @alpha
 */
export const useDocumentHead = (): Required<ResolvedDocumentHead> =>
  useContext(DocumentHeadContext);

/**
 * @alpha
 */
export const useLocation = (): RouteLocation => useContext(RouteLocationContext);

/**
 * @alpha
 */
export const useNavigate = (): RouteNavigate => useContext(RouteNavigateContext);

export const useQwikCityEnv = () => noSerialize(useEnvData<QwikCityEnvData>('qwikcity'));

/**
 * @alpha
 */
export const useRequestHeaders = () => useQwikCityEnv()?.request.headers;
