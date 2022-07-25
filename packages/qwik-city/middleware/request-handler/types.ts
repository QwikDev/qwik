import type { Render } from '@builder.io/qwik/server';
import type { QwikCityPlan, ResponseContext } from '../../runtime/src/library/types';

export interface QwikCityRequestContext extends QwikCityPlan, ServerRequestEvent {
  render: Render;
  trailingSlash?: boolean;
}

export interface QwikCityDevRequestContext extends QwikCityRequestContext {
  routesDir: string;
}

export interface ServerRequestEvent {
  request: Request;
  response: ServerResponseContext;
  url: URL;
}

export interface ServerResponseContext extends ResponseContext {
  body: any;
  write: (chunk: any) => void;
  handled: boolean;
}
