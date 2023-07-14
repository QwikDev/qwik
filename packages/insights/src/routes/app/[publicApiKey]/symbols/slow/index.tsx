import { component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import Histogram, { latencyColors } from '~/components/histogram';
import { SymbolCmp } from '~/components/symbol';
import { getDB } from '~/db';
import { getSlowEdges, getSymbolDetails, getAppInfo } from '~/db/query';
import { BUCKETS, vectorAvg, vectorSum } from '~/stats/vector';
import { css } from '~/styled-system/css';

export const useData = routeLoader$(async ({ params, query }) => {
  const manifest = query.get('manifest');
  const manifests = manifest ? manifest.split(',') : [];
  const db = getDB();
  const [app, edges, details] = await Promise.all([
    getAppInfo(db, params.publicApiKey),
    getSlowEdges(db, params.publicApiKey, manifests),
    getSymbolDetails(db, params.publicApiKey),
  ]);
  const detailsMap: Record<string, (typeof details)[0] | undefined> = {};
  details.forEach((detail) => {
    detailsMap[detail.hash] = detail;
  });
  return { app, edges, detailsMap };
});

export default component$(() => {
  const data = useData();
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
                  <SymbolCmp symbol={edge.to} />
                  <br />
                  {detail?.fullName}
                  <br />
                  {data.value.app.github && detail?.origin ? (
                    <a href={toUrl(data.value.app.github, detail.origin)}>{detail.origin}</a>
                  ) : (
                    detail?.origin
                  )}
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

function toUrl(base: string, file: string) {
  const url = new URL(base);
  if (!url.pathname.endsWith('/') || !file.startsWith('/')) {
    url.pathname += '/';
  }
  url.pathname += file;
  return url.toString();
}
