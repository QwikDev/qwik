import { type ReadonlySignal, component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import Histogram, { latencyColors } from '~/components/histogram';
import { SlowIcon } from '~/components/icons/slow';
import { SymbolTile } from '~/components/symbol-tile';
import { type ApplicationRow, getDB } from '~/db';
import {
  getSlowEdges,
  getSymbolDetails,
  getAppInfo,
  type SlowEdge,
  type SymbolDetailForApp,
} from '~/db/query';
import { dbGetManifestHashes } from '~/db/sql-manifest';
import { BUCKETS, vectorAvg, vectorSum } from '~/stats/vector';

interface SlowSymbol {
  app: ApplicationRow;
  edges: SlowEdge[];
  detailsMap: Record<string, SymbolDetailForApp | undefined>;
}

export const useData = routeLoader$<SlowSymbol>(async ({ params, query }) => {
  const manifest = query.get('manifest');
  const manifests = manifest ? manifest.split(',') : [];
  const db = getDB();
  const manifestHashes = await dbGetManifestHashes(db, params.publicApiKey);
  const [app, edges, details] = await Promise.all([
    getAppInfo(db, params.publicApiKey),
    getSlowEdges(db, params.publicApiKey, manifests),
    getSymbolDetails(db, params.publicApiKey, { manifestHashes }),
  ]);
  const detailsMap: Record<string, SymbolDetailForApp | undefined> = {};
  details.forEach((detail) => {
    detailsMap[detail.hash] = detail;
  });
  return { app, edges, detailsMap };
});

export default component$(() => {
  const data: ReadonlySignal<SlowSymbol> = useData();
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
            const detail = data.value.detailsMap[edge.to];
            return (
              <tr key={edge.to} class="border-b border-slate-200 text-xs">
                <td class="px-6 py-3 bg-slate-50 font-bold">{edge.manifestHash}</td>
                <td class="px-6 py-3">
                  <span class="font-bold">
                    <SymbolTile symbol={edge.to} />
                  </span>
                  <span class="block text-slate-500">{detail?.fullName}</span>
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
