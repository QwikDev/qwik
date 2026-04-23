import { ServerFunctions } from '@devtools/kit';
import { getAssetsFunctions } from '../assets';
import { getBuildAnalysisFunctions } from '../build-analysis';
import { ServerContext } from '../types';
import { getRouteFunctions } from '../routes';
import { getNpmFunctions } from '../npm';
import { getComponentsFunctions } from '../components';
import { getModulesContent } from '../inspect';

export function getServerFunctions(ctx: ServerContext): ServerFunctions {
  return {
    healthCheck: () => true,
    ...getAssetsFunctions(ctx),
    ...getComponentsFunctions(ctx),
    ...getRouteFunctions(ctx),
    ...getNpmFunctions(ctx),
    ...getBuildAnalysisFunctions(ctx),
    ...getModulesContent(ctx),
  };
}
