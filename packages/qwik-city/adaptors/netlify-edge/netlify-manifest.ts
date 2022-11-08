// https://docs.netlify.com/edge-functions/create-integration/#generate-declarations
import type { BuildRoute } from '../../buildtime/types';

export function generateNetlifyEdgeManifest(routes: BuildRoute[]) {
  const m: NetlifyEdgeManifest = {
    functions: [],
    version: 1,
  };

  return m;
}

interface NetlifyEdgeManifest {
  functions: (NetlifyEdgePathFunction | NetlifyEdgePatternFunction)[];
  import_map?: string;
  version: 1;
}

interface NetlifyEdgePathFunction {
  path: string;
  function: string;
  name?: string;
}

interface NetlifyEdgePatternFunction {
  pattern: string;
  function: string;
  name?: string;
}
