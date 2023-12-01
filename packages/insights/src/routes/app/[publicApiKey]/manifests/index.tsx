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
      <table>
        <tbody>
          <tr>
            <th>Manifest</th>
            <th>Timestamp</th>
            <th>Samples</th>
            <th>Avg. Latency</th>
            <th>Histogram</th>
          </tr>
          {data.value.map((row) => (
            <tr key={row.hash}>
              <td>
                <ManifestTile hash={row.hash} />
              </td>
              <td>{row.timestamp.toLocaleString()}</td>
              <td>{vectorSum(row.latency)}</td>
              <td>{Math.round(vectorAvg(row.latency))}</td>
              <td>
                <Histogram vector={row.latency} colors={latencyColors} buckets={BUCKETS} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
