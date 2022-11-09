// https://docs.netlify.com/edge-functions/create-integration/#generate-declarations
import type { BuildRoute } from '../../buildtime/types';

export function generateNetlifyEdgeManifest(routes: BuildRoute[], staticPaths: string[]) {
  const ssrRoutes = routes.filter((r) => !staticPaths.includes(r.pathname));

  const m: NetlifyEdgeManifest = {
    functions: ssrRoutes.map((r) => {
      if (r.paramNames.length > 0) {
        return {
          pattern: r.pattern.toString(),
          function: 'entry.netlify-edge',
        };
      }

      return {
        path: r.pathname,
        function: 'entry.netlify-edge',
      };
    }),
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
