import type { QwikCityPlan } from '../../runtime/src/library/types';

export interface QwikCityRequestOptions extends QwikCityPlan {
  request: Request;
  trailingSlash?: boolean;
}

export interface QwikCityDevRequestOptions extends QwikCityRequestOptions {
  routesDir: string;
}
