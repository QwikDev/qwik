import { component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import Histogram, { latencyColors } from '~/components/histogram';
import { getDB } from '~/db';
import { getSlowEdges } from '~/db/query';
import { BUCKETS, vectorAvg } from '~/stats/vector';
import { css } from '~/styled-system/css';

export const useSymbols = routeLoader$(async ({ params }) => {
  const db = getDB();
  const edges = await getSlowEdges(db, params.publicApiKey);
  return edges;
});

export default component$(() => {
  const errors = useSymbols();
  return (
    <div>
      <h1>Slow Symbols</h1>
      <table>
        <tbody>
          <tr>
            <th>Manifest</th>
            <th>Symbol</th>
            <th>Latency</th>
            <th>Histogram</th>
          </tr>
          {errors.value.map((edge) => {
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
                  })}
                >
                  {edge.to}
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
