import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';
import Histogram, { latencyColors } from '~/components/histogram';
import { SlowIcon } from '~/components/icons/slow';
import { SymbolTile } from '~/components/symbol-tile';
import { getDB } from '~/db';
import { getSlowEdges, type SlowEdge } from '~/db/query';
import { dbGetManifestHashes } from '~/db/sql-manifest';
import { BUCKETS, vectorAvg, vectorSum } from '~/stats/vector';

interface SlowSymbol {
  edges: SlowEdge[];
}

export const useData = routeLoader$<SlowSymbol>(async ({ params, query }) => {
  const manifest = query.get('manifest');
  const db = getDB();
  const manifestHashes = manifest
    ? manifest.split(',').filter(Boolean).slice(0, 100)
    : await dbGetManifestHashes(db, params.publicApiKey);
  const edges = await getSlowEdges(db, params.publicApiKey, manifestHashes);
  return { edges };
});

export default component$(() => {
  const data = useData();
  return (
    <div>
      <h1 class="h3">
        <SlowIcon />
        Slow Symbols
      </h1>
      <table>
        <thead class="text-xs text-slate-700 uppercase">
          <tr class="border-b border-slate-200">
            <th scope="col" class="px-6 py-3 bg-slate-50">
              Manifest
            </th>
            <th scope="col" class="px-6 py-3">
              Symbol
            </th>
            <th scope="col" class="px-6 py-3 bg-slate-50">
              Count
            </th>
            <th scope="col" class="px-6 py-3">
              Latency
            </th>
            <th scope="col" class="px-6 py-3 bg-slate-50">
              Histogram
            </th>
          </tr>
        </thead>
        <tbody>
          {data.value.edges.map((edge) => {
            return (
              <tr key={edge.to} class="border-b border-slate-200 text-xs">
                <td class="px-6 py-3 bg-slate-50 font-bold">{edge.manifestHash}</td>
                <td class="px-6 py-3">
                  <span class="font-bold">
                    <SymbolTile symbol={edge.to} />
                  </span>
                </td>
                <td class="px-6 py-3 bg-slate-50">{vectorSum(edge.latency)}</td>
                <td class="px-6 py-2">{Math.round(vectorAvg(edge.latency))}ms</td>
                <td class="px-6 py-3 bg-slate-50">
                  <Histogram vector={edge.latency} colors={latencyColors} buckets={BUCKETS} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});
