import { type ReadonlySignal, component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import { getDB } from '~/db';
import { type OutgoingEdge, dbGetOutgoingEdges } from '~/db/sql-edges';
import { BUCKETS, vectorSum } from '~/stats/vector';
import Histogram, { delayColors, latencyColors } from '~/components/histogram';
import { SymbolTile } from '~/components/symbol-tile';
import { ManifestIcon } from '~/components/icons/manifest';

interface OutgoingInfo {
  symbol: string;
  edges: OutgoingEdge[];
  total: number;
  manifestHashes: string[];
  buckets: typeof BUCKETS;
  publicApiKey: string;
}

export const useData = routeLoader$<OutgoingInfo>(async ({ params, query }) => {
  const db = getDB();
  const symbol = query.get('symbol') || '';
  const publicApiKey = params.publicApiKey;
  const manifestHashes: string[] = [];
  const edges = await dbGetOutgoingEdges(db, publicApiKey, symbol, manifestHashes);
  const total = edges.reduce((total, edge) => total + vectorSum(edge.delay), 0);
  return {
    symbol,
    edges,
    total,
    manifestHashes,
    buckets: BUCKETS,
    publicApiKey,
  };
});

export default component$(() => {
  const data: ReadonlySignal<OutgoingInfo> = useData();
  return (
    <div>
      <h1>
        Outgoing Symbols: <SymbolTile symbol={data.value.symbol} />
        <table>
          <tbody>
            <tr>
              <th>Manifest</th>
              <th>To Symbol</th>
              <th>Count</th>
              <th>Delay</th>
              <th>Latency</th>
            </tr>
            {data.value.edges.map((edge) => (
              <tr key={edge.to}>
                <td>
                  <ManifestIcon />
                  {edge.manifestHash}
                </td>
                <td>
                  <a href={`/app/${data.value.publicApiKey}/symbols/outgoing/?symbol=${edge.to}`}>
                    <SymbolTile symbol={edge.to} />
                  </a>
                </td>
                <td>
                  {vectorSum(edge.delay)} / {data.value.total}
                </td>
                <td>
                  <Histogram
                    vector={edge.delay}
                    colors={delayColors}
                    buckets={data.value.buckets}
                  />
                </td>
                <td>
                  <Histogram
                    vector={edge.latency}
                    colors={latencyColors}
                    buckets={data.value.buckets}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </h1>
    </div>
  );
});
