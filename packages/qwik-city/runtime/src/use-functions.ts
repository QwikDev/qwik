import { noSerialize, useContext, useServerData } from '@builder.io/qwik';
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
 * @public
 */
export const useContent = () => useContext(ContentContext);

/**
 * @public
 */
export const useDocumentHead = (): Required<ResolvedDocumentHead> =>
  useContext(DocumentHeadContext);

/**
 * @public
 */
export const useLocation = (): RouteLocation => useContext(RouteLocationContext);

/**
 * @public
 */
export const useNavigate = (): RouteNavigate => useContext(RouteNavigateContext);

export const useAction = (): RouteAction => useContext(RouteActionContext);

export const useQwikCityEnv = () => noSerialize(useServerData<QwikCityEnvData>('qwikcity'));
