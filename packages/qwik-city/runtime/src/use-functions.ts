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
  RequestEvent,
} from './types';

/** @public */
export const useContent = () => useContext(ContentContext);

/**
 * Returns the document head for the current page. The generic type describes the front matter.
 *
 * @public
 */
export const useDocumentHead = <
  FrontMatter extends Record<string, unknown> = Record<string, any>,
>(): Required<ResolvedDocumentHead<FrontMatter>> => useContext<any>(DocumentHeadContext);

/** @public */
export const useLocation = (): RouteLocation => useContext(RouteLocationContext);

/** @public */
export const useNavigate = (): RouteNavigate => useContext(RouteNavigateContext);

export const useAction = (): RouteAction => useContext(RouteActionContext);

export const useQwikCityEnv = () => noSerialize(useServerData<QwikCityEnvData>('qwikcity'));

// we need to keep track of last available request event
let _ev: RequestEvent<QwikCityPlatform> | undefined;

export function useRequestEvent() {
  const requestEvent = useQwikCityEnv()?.ev;

  if (requestEvent) {
    _ev = requestEvent;
  }

  return _ev;
}
