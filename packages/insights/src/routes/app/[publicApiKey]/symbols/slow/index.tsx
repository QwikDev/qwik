import { type ReadonlySignal, component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import Histogram, { latencyColors } from '~/components/histogram';
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
import { css } from '~/styled-system/css';

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
      <h1>Slow Symbols</h1>
      <table>
        <tbody>
          <tr>
            <th>Manifest</th>
            <th>Symbol</th>
            <th>Count</th>
            <th>Latency</th>
            <th>Histogram</th>
          </tr>
          {data.value.edges.map((edge) => {
            const detail = data.value.detailsMap[edge.to];
            return (
              <tr key={edge.to}>
                <td
                  class={css({
                    padding: '2px',
                  })}
                >
                  {edge.manifestHash}
                </td>
                <td
                  class={css({
                    padding: '2px',
                    fontFamily: 'monospace',
                    fontSize: '10px',
                  })}
                >
                  <SymbolTile symbol={edge.to} />
                  <br />
                  {detail?.fullName}
                </td>
                <td
                  class={css({
                    padding: '2px',
                  })}
                >
                  {vectorSum(edge.latency)}
                </td>
                <td
                  class={css({
                    padding: '2px',
                  })}
                >
                  {Math.round(vectorAvg(edge.latency))}ms
                </td>
                <td
                  class={css({
                    padding: '2px',
                  })}
                >
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
