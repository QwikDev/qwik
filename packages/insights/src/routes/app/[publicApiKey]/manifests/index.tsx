import { type ReadonlySignal, component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import Histogram, { latencyColors } from '~/components/histogram';
import { ManifestTile } from '~/components/minifest-tile';
import { getDB } from '~/db';
import { type ManifestStatsRow, dbGetManifestStats } from '~/db/sql-manifest';
import { vectorAvg, vectorSum, BUCKETS } from '~/stats/vector';
import { css, cx } from '~/styled-system/css';

export const useData = routeLoader$(async ({ params }) => {
  const publicApiKey = params.publicApiKey;
  const db = getDB();
  const data = await dbGetManifestStats(db, publicApiKey);
  return data;
});

const column = css({
  border: '1px solid black',
  overflow: 'scroll',
  maxWidth: '300px',
  maxHeight: '100px',
  verticalAlign: 'top',
  padding: '3px',
});

const columnHash = cx(
  css({
    maxWidth: '100px',
    width: '100px',
  }),
  column
);
const columnTimestamp = cx(
  css({
    maxWidth: '150px',
    width: '150px',
  }),
  column
);
const columnSamples = cx(
  css({
    maxWidth: '80px',
    width: '80px',
  }),
  column
);
const columnLatency = cx(
  css({
    maxWidth: '120px',
    width: '120px',
  }),
  column
);
const columnHistogram = cx(
  css({
    maxWidth: '410px',
    width: '410px',
  }),
  column
);

export default component$(() => {
  const data: ReadonlySignal<ManifestStatsRow[]> = useData();
  return (
    <div>
      <h1>Manifests</h1>
      <table>
        <tbody>
          <tr>
            <th class={cx(css({ fontWeight: 'bold' }), columnHash)}>Manifest</th>
            <th class={cx(css({ fontWeight: 'bold' }), columnTimestamp)}>Timestamp</th>
            <th class={cx(css({ fontWeight: 'bold' }), columnSamples)}>Samples</th>
            <th class={cx(css({ fontWeight: 'bold' }), columnLatency)}>Avg. Latency</th>
            <th class={cx(css({ fontWeight: 'bold' }), columnHistogram)}>Histogram</th>
          </tr>
          {data.value.map((row) => (
            <tr key={row.hash}>
              <td class={cx(css({}), columnHash)}>
                <ManifestTile hash={row.hash} />
              </td>
              <td class={cx(css({ fontSize: '12px' }), columnTimestamp)}>
                {row.timestamp.toLocaleString()}
              </td>
              <td class={cx(css({ textAlign: 'right' }), columnSamples)}>
                {vectorSum(row.latency)}
              </td>
              <td class={cx(css({ textAlign: 'right' }), columnLatency)}>
                {Math.round(vectorAvg(row.latency))}
              </td>
              <td class={cx(css({}), columnHistogram)}>
                <Histogram vector={row.latency} colors={latencyColors} buckets={BUCKETS} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
