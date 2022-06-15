import type { QwikManifest } from '@builder.io/qwik/optimizer';
import type { RenderToStringOptions } from '@builder.io/qwik/server';
import type { RouteData } from '../runtime/types';

export interface QwikCityAdaptorOptions extends RenderToStringOptions {
  manifest: QwikManifest;
  routes: RouteData[];
}

export interface QwikCityRequestOptions extends QwikCityAdaptorOptions {
  request: Request;
  url: URL;
}
