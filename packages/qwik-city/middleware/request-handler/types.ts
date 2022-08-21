import type { StreamWriter } from '@builder.io/qwik';
import type { RenderOptions } from '@builder.io/qwik/server';
import type { QwikCityPlan, RequestContext, RouteParams } from '../../runtime/src/library/types';

export interface QwikCityRequestContext<T = any> {
  request: RequestContext;
  response: ResponseHandler<T>;
  url: URL;
}

export interface QwikCityDevRequestContext extends QwikCityRequestContext {
  routesDir: string;
}

export type ResponseHandler<T = any> = (
  status: number,
  headers: Headers,
  body: (stream: StreamWriter) => Promise<void>,
  error?: any
) => Promise<T>;

export interface UserResponseContext {
  type: 'endpoint' | 'page';
  url: URL;
  params: RouteParams;
  status: number;
  headers: Headers;
  resolvedBody: string | number | boolean | null | undefined;
  pendingBody: Promise<string | number | boolean | null | undefined> | undefined;
}

export interface QwikCityRequestOptions extends QwikCityPlan, RenderOptions {}
