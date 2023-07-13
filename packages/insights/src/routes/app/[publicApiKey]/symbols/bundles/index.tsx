import { component$, useStore, type JSXNode } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import { BundleCmp } from '~/components/bundle';
import { SymbolCmp } from '~/components/symbol';
import { getDB } from '~/db';
import { getEdges, getSymbolDetails } from '~/db/query';
import {
  computeBundles,
  computeSymbolGraph,
  computeSymbolVectors,
  type Symbol,
} from '~/stats/edges';
import { css } from '~/styled-system/css';

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
              <BundleCmp name={bundle.name} />
              <ul
                class={css({
                  listStyle: 'circle',
                  marginLeft: '1rem',
                })}
              >
                {bundle.symbols.map((symbol) => (
                  <li key={symbol.name}>
                    <SymbolCmp symbol={symbol.name} />
                    {' ( '}
                    <code class={css({ fontFamily: 'monospace' })}>{symbol.fullName}</code>
                    {' / '}
                    <code class={css({ fontFamily: 'monospace' })}>{symbol.fileSrc}</code>
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
  matrix: number[][];
  symbols: Symbol[];
}>(({ matrix, symbols }) => {
  const callout = useStore({ visible: false, value: 0, rowSymbol: '', colSymbol: '', x: 0, y: 0 });
  return (
    <>
      <div
        class={css({
          border: `1px solid black`,
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
        <MatrixCells matrix={matrix} symbols={symbols} />
      </div>
      <div
        style={{
          display: callout.visible && !isNaN(callout.value) ? 'inline-block' : 'none',
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

export const MatrixCells = component$<{ matrix: number[][]; symbols: Symbol[] }>(
  ({ matrix, symbols }) => {
    const size = matrix.length;
    return (
      <>
        {matrix.map((row, rowIdx) => (
          <div
            class={css({ display: 'flex' })}
            style={{ height: 100 / size + '%' }}
            key={rowIdx}
            data-row-symbol={symbols[rowIdx].name}
          >
            {cells(row, symbols)}
          </div>
        ))}
      </>
    );
  }
);

function cells(row: number[], symbols: Symbol[]) {
  const size = row.length;
  const cells: JSXNode[] = [];
  let sparseSize = 0;
  for (let colIdx = 0; colIdx < row.length; colIdx++) {
    const value = row[colIdx];
    if (value) {
      if (sparseSize) {
        cells.push(<div style={{ width: (sparseSize * 100) / size + '%' }} />);
        sparseSize = 0;
      }
      cells.push(
        <div
          key={colIdx}
          class={css({ height: '100%', display: 'inline-block' })}
          style={{
            width: 100 / size + '%',
            backgroundColor: toRGB(value),
          }}
          data-col-symbol={symbols[colIdx].name}
          data-value={value}
        ></div>
      );
    } else {
      sparseSize++;
    }
  }
  return cells;
}

function toRGB(value: number): string {
  const color = Math.round((1 - value) * 255);
  return `rgb(${color},${color},${color})`;
}
