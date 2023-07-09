import { component$, useStore, useStylesScoped$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import { getDB } from '~/db';
import CSS from './index.css?inline';
import { computeBundles, computeSymbolGraph, computeSymbolVectors } from '~/stats/edges';
import { getSymbolDetails, getEdges } from '~/db/query';
import { css } from '~/styled-system/css';
import { type Symbol } from '~/stats/edges';

export const useData = routeLoader$(async ({ params }) => {
  const db = getDB();
  const [edges, details] = await Promise.all([
    getEdges(db, params.publicApiKey),
    getSymbolDetails(db, params.publicApiKey),
  ]);
  const rootSymbol = computeSymbolGraph(edges, details);
  const vectors = computeSymbolVectors(rootSymbol);
  const bundles = computeBundles(vectors);
  return { vectors, bundles };
});

export default component$(() => {
  const data = useData();
  useStylesScoped$(CSS);
  return (
    <div
      class={css({
        margin: '5px',
      })}
    >
      <h2>Corelation Matrix</h2>
      <CorelationMatrix matrix={data.value.vectors.vectors} symbols={data.value.vectors.symbols} />

      <h2>Bundles</h2>
      <ol
        class={css({
          listStyle: 'decimal',
          marginLeft: '1.5rem',
        })}
      >
        {data.value.bundles.map((bundle) => {
          return (
            <li key={bundle.name}>
              <h3>{bundle.name}</h3>
              <ul
                class={css({
                  listStyle: 'circle',
                  marginLeft: '1rem',
                })}
              >
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
          );
        })}
      </ol>
      <hr />
    </div>
  );
});

export const CorelationMatrix = component$<{
  size?: number;
  matrix: number[][];
  symbols: Symbol[];
}>(({ matrix, size = 10, symbols }) => {
  const callout = useStore({ visible: false, value: 0, rowSymbol: '', colSymbol: '', x: 0, y: 0 });
  return (
    <>
      <div
        class={css({
          border: `1px solid black`,
          display: 'flex',
          height: 'calc(100vmin - 20px)',
          width: 'calc(100vmin - 20px)',
          flexDirection: 'column',
          justifyContent: 'space-evenly',
        })}
        onMouseEnter$={() => (callout.visible = true)}
        onMouseLeave$={() => (callout.visible = false)}
        onMouseMove$={(e) => {
          callout.x = e.clientX;
          callout.y = e.clientY;
          const col = e.target as HTMLElement;
          const row = col.parentNode as HTMLElement;
          callout.value = parseFloat(col.dataset.value!);
          callout.colSymbol = col.dataset.colSymbol!;
          callout.rowSymbol = row.dataset.rowSymbol!;
        }}
      >
        {matrix.map((row, rowIdx) => (
          <div
            class={css({ display: 'flex' })}
            key={rowIdx}
            style={{ height: 100 / size + '%' }}
            data-row-symbol={symbols[rowIdx].name}
          >
            {row.map((value, colIdx) => (
              <div
                key={colIdx}
                class={css({ height: '100%' })}
                style={{
                  width: 100 / size + '%',
                  backgroundColor: toRGB(value),
                }}
                data-col-symbol={symbols[colIdx].name}
                data-value={value}
              ></div>
            ))}
          </div>
        ))}
      </div>
      <div
        style={{
          display: callout.visible ? 'inline-block' : 'none',
          top: callout.y + 5 + 'px',
          left: callout.x + 5 + 'px',
        }}
        class={css({
          position: 'fixed',
          backgroundColor: 'white',
          padding: '5px',
          border: '1px solid black',
        })}
      >
        <div>
          (
          <code
            class={css({
              fontFamily: 'monospace',
              fontWeight: 'bold',
              fontSize: '1.25rem',
            })}
          >
            {Math.round(callout.value * 100)}%
          </code>
          )
        </div>
        <code
          class={css({
            fontFamily: 'monospace',
          })}
        >
          {callout.rowSymbol}
        </code>
        {` -> `}
        <code
          class={css({
            fontFamily: 'monospace',
          })}
        >
          {callout.colSymbol}
        </code>
      </div>
    </>
  );
});

function toRGB(value: number): string {
  const color = Math.round((1 - value) * 255);
  return `rgb(${color},${color},${color})`;
}
