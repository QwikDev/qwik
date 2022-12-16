import { noSerialize, useContext, useEnvData } from '@builder.io/qwik';
import {
  ContentContext,
  DocumentHeadContext,
  RouteActionContext,
  RouteLocationContext,
  RouteNavigateContext,
} from './contexts';
import type {
  RouteLocation,
  ResolvedDocumentHead,
  RouteNavigate,
  QwikCityEnvData,
  RouteAction,
} from './types';

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

export const useAction = (): RouteAction => useContext(RouteActionContext);

export const useQwikCityEnv = () => noSerialize(useEnvData<QwikCityEnvData>('qwikcity'));
