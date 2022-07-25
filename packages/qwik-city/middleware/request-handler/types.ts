import type { Render, StreamWriter } from '@builder.io/qwik/server';
import type { QwikCityPlan, RequestContext, RouteParams } from '../../runtime/src/library/types';

export interface QwikCityRequestContext<T = any> extends QwikCityPlan, ServerRequestEvent<T> {
  trailingSlash?: boolean;
  render: Render;
  next: () => any;
}

export interface QwikCityDevRequestContext extends QwikCityRequestContext {
  routesDir: string;
}

export interface ServerRequestEvent<T = any> {
  request: RequestContext;
  response: ResponseHandler<T>;
  url: URL;
}

export interface UserResponseContext {
  url: URL;
  params: RouteParams;
  status: number;
  headers: Headers;
  body: any;
  handler: 'page' | 'endpoint' | 'redirect' | null;
}

export type ResponseHandler<T = any> = (
  status: number,
  headers: Headers,
  writer: (stream: StreamWriter) => Promise<void>
) => T;
