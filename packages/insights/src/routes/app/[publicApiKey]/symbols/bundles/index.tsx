import { component$, useStylesScoped$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import { getDB } from '~/db';
import CSS from './index.css?inline';
import { computeBundles, computeSymbolGraph, computeSymbolVectors } from '~/stats/edges';
import { getSymbolDetails, getSymbolEdges } from '~/db/query';

export const useData = routeLoader$(async ({ params }) => {
  const db = getDB();
  const [symbols, details] = await Promise.all([
    getSymbolEdges(db, params.publicApiKey),
    getSymbolDetails(db, params.publicApiKey),
  ]);
  const rootSymbol = computeSymbolGraph(symbols, details);
  const vectors = computeSymbolVectors(rootSymbol);
  const bundles = computeBundles(vectors);
  return { vectors, bundles };
});

export default component$(() => {
  const data = useData();
  useStylesScoped$(CSS);
  return (
    <div>
      <h2>Bundles</h2>
      <ol>
        {data.value.bundles.map((bundle) => (
          <li key={bundle.name}>
            <h3>{bundle.name}</h3>
            <ul>
              {bundle.symbols.map((symbol) => (
                <li key={symbol.name}>
                  <code>{symbol.name}</code>
                  {' ( '}
                  <code>{symbol.fullName}</code>
                  {' / '}
                  <code>{symbol.fileSrc}</code>
                  {' )'}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <hr />
      <h2>Vectors</h2>
      <table class="vector">
        <thead>
          <tr>
            <th></th>
            {data.value.vectors.symbols.map((vector, idx) => (
              <th class="rotate" key={idx}>
                {vector.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.value.vectors.vectors.map((rowVector, idx) => (
            <tr key={idx}>
              <td class="row-symbol">{data.value.vectors.symbols[idx].name}</td>
              {rowVector.map((value, idx) => (
                <td
                  key={idx}
                  class={{ empty: value == 0 }}
                  data-value={Math.round(value * 15)
                    .toString(16)
                    .toUpperCase()}
                >
                  {/* {value} */}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
