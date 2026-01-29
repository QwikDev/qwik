import { type ReadonlySignal, component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import Histogram, { latencyColors } from '~/components/histogram';
import { ManifestIcon } from '~/components/icons/manifest';
import { ManifestTile } from '~/components/minifest-tile';
import { getDB } from '~/db';
import { type ManifestStatsRow, dbGetManifestStats } from '~/db/sql-manifest';
import { vectorAvg, vectorSum, BUCKETS } from '~/stats/vector';

export const useData = routeLoader$(async ({ params }) => {
  const publicApiKey = params.publicApiKey;
  const db = getDB();
  const data = await dbGetManifestStats(db, publicApiKey);
  return data;
});

export default component$(() => {
  const data: ReadonlySignal<ManifestStatsRow[]> = useData();
  return (
    <div>
      <h1 class="h3">
        <ManifestIcon />
        Manifests
      </h1>
      <table class="w-full text-sm text-left">
        <thead class="text-xs text-slate-700 uppercase">
          <tr class="border-b border-slate-200">
            <th scope="col" class="px-6 py-3 bg-slate-50">
              Manifest
            </th>
            <th scope="col" class="px-6 py-3">
              Timestamp
            </th>
            <th scope="col" class="px-6 py-3 bg-slate-50">
              Samples
            </th>
            <th scope="col" class="px-6 py-3">
              Avg. Latency
            </th>
            <th scope="col" class="px-6 py-3 bg-slate-50">
              Histogram
            </th>
          </tr>
        </thead>
        <tbody>
          {data.value.map((row) => (
            <tr key={row.hash} class="border-b border-slate-200 text-xs">
              <th scope="col" class="px-6 py-3 bg-slate-50">
                <ManifestTile hash={row.hash} />
              </th>
              <td scope="col" class="px-6 py-3">
                {row.timestamp.toLocaleString()}
              </td>
              <td scope="col" class="px-6 py-3 bg-slate-50">
                {vectorSum(row.latency)}
              </td>
              <td scope="col" class="px-6 py-3">
                {Math.round(vectorAvg(row.latency))}
              </td>
              <td scope="col" class="px-6 py-3 bg-slate-50">
                <Histogram vector={row.latency} colors={latencyColors} buckets={BUCKETS} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
