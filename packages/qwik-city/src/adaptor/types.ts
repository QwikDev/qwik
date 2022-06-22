import type { RenderToStringOptions, RenderToStringResult } from '@builder.io/qwik/server';
import type { RouteData } from '../runtime/types';

export interface QwikCityAdaptorOptions {
  routes: RouteData[];
}

export interface QwikCityRequestOptions extends QwikCityAdaptorOptions {
  request: Request;
  url: URL;
}

export type RenderFunction = (opts: RenderToStringOptions) => Promise<RenderToStringResult>;
