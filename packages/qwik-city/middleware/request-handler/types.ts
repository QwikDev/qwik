import type { QwikCityPlan } from '../../runtime/src/library/types';

export interface QwikCityRequestOptions extends QwikCityPlan {
  request: Request;
  trailingSlash?: boolean;
}
