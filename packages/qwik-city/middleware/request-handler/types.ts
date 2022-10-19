import type { StreamWriter } from '@builder.io/qwik';
import type { Render, RenderOptions } from '@builder.io/qwik/server';
import type {
  ClientPageData,
  QwikCityPlan,
  RequestContext,
  RouteParams,
} from '../../runtime/src/library/types';

export interface QwikCityRequestContext<T = any> {
  request: RequestContext;
  response: ResponseHandler<T>;
  url: URL;
  platform: Record<string, any>;
}

export interface QwikCityDevRequestContext extends QwikCityRequestContext {
  routesDir: string;
}

export interface ResponseStreamWriter extends StreamWriter {
  clientData?: (data: ClientPageData) => void;
}

export type ResponseHandler<T = any> = (
  status: number,
  headers: Headers,
  body: (stream: ResponseStreamWriter) => Promise<void>,
  error?: any
) => Promise<T>;

export interface UserResponseContext {
  type: 'endpoint' | 'pagehtml' | 'pagedata';
  url: URL;
  params: RouteParams;
  status: number;
  headers: Headers;
  resolvedBody: string | number | boolean | null | undefined;
  pendingBody: Promise<string | number | boolean | null | undefined> | undefined;
  aborted: boolean;
}

export interface QwikCityHandlerOptions extends RenderOptions {
  render: Render;
  qwikCityPlan: QwikCityPlan;
}
