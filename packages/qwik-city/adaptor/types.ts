import type { RenderToStringOptions, RenderToStringResult } from '@builder.io/qwik/server';
import type { QwikCityPlan } from '../../runtime/types';

export interface QwikCityRequestOptions extends QwikCityPlan {
  request: Request;
  url: URL;
  trailingSlash?: boolean;
}

export type RenderFunction = (opts: RenderToStringOptions) => Promise<RenderToStringResult>;
