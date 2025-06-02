import { component$, useStore, type ReadonlySignal, type JSXOutput } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import { BundleCmp } from '~/components/bundle';
import { BundleIcon } from '~/components/icons/bundle';
import { SymbolTile } from '~/components/symbol-tile';
import { getDB } from '~/db';
import { getEdges, getSymbolDetails } from '~/db/query';
import { dbGetManifestHashes } from '~/db/sql-manifest';
import {
  computeBundles,
  computeSymbolGraph,
  computeSymbolVectors,
  type SymbolVectors,
  type Symbol,
  type Bundle,
} from '~/stats/edges';
import { vectorSum } from '~/stats/vector';

interface BundleInfo {
  vectors: SymbolVectors;
  bundles: Bundle[];
}

export const useData = routeLoader$<BundleInfo>(async ({ params, url }) => {
  const db = getDB();
  const limit = url.searchParams.get('limit')
    ? parseInt(url.searchParams.get('limit')!)
    : undefined;

  const manifestHashes = await dbGetManifestHashes(db, params.publicApiKey);
  const [edges, details] = await Promise.all([
    getEdges(db, params.publicApiKey, { limit, manifestHashes }),
    getSymbolDetails(db, params.publicApiKey, { manifestHashes }),
  ]);
  const rootSymbol = computeSymbolGraph(edges, details);
  const vectors = computeSymbolVectors(rootSymbol);
  const bundles = computeBundles(vectors);
  return { vectors, bundles };
});

export default component$(() => {
  const data: ReadonlySignal<BundleInfo> = useData();
  return (
    <div>
      <h1 class="h3">
        <BundleIcon />
        Correlation Matrix
      </h1>
      <CorrelationMatrix matrix={data.value.vectors.vectors} symbols={data.value.vectors.symbols} />

      <h2 class="h3">
        <BundleIcon />
        Bundles
      </h2>
      <ol class="list-decimal list-inside">
        {data.value.bundles.map((bundle) => (
          <li key={bundle.name}>
            <div class="bg-white inline-block py-1 px-4 text-xs text-center rounded-full whitespace-nowrap">
              <BundleCmp name={bundle.name} />
            </div>
            <ul class="mb-10">
              {bundle.symbols.map((symbol) => (
                <li
                  key={symbol.name}
                  class="relative pt-2 pl-16 whitespace-nowrap text-xs before:absolute before:top-[1px] before:left-8 before:border-l before:border-l-slate-400 before:border-dashed before:h-full before:w-[1px] last:before:h-[16px] after:absolute after:top-4 after:left-8 after:border-t after:border-t-slate-400 after:border-dashed after:h-[1px] after:w-6"
                >
                  <span class="font-bold">
                    <SymbolTile symbol={symbol.name} />
                  </span>
                  <span class="text-purple-500 mx-2">|</span>
                  <code>{symbol.fullName}</code>
                  <span class="text-purple-500 mx-2">|</span>
                  <code>{symbol.fileSrc}</code>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <hr />
    </div>
  );
});

export const CorrelationMatrix = component$<{
  matrix: number[][];
  symbols: Symbol[];
}>(({ matrix, symbols }) => {
  const callout = useStore({
    visible: false,
    value: 0,
    rowSymbol: '',
    colSymbol: '',
    x: 0,
    y: 0,
  });
  return (
    <>
      <div
        class="border border-slate-200 h-[calc(70vmin-20px)] w-[calc(70vmin-20px)] flex flex-col justify-evenly mb-14"
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
        class="fixed bg-white border border-slate-200 text-xs"
      >
        <table class="w-full text-sm text-left">
          <tbody>
            <tr class="border-y border-slate-200 text-xs">
              <th scope="col" class="px-6 py-3 bg-slate-50">
                Score
              </th>
              <td scope="col" class="px-6 py-3">
                <code
                  class={[
                    'rounded-xs px-8 py-1 inline-block',
                    { 'bg-lime-500': Math.round(callout.value * 100) >= 70 },
                    {
                      'bg-lime-300':
                        Math.round(callout.value * 100) >= 50 &&
                        Math.round(callout.value * 100) < 70,
                    },
                    {
                      'bg-yellow-500':
                        Math.round(callout.value * 100) >= 30 &&
                        Math.round(callout.value * 100) < 50,
                    },
                    { 'bg-slate-200': Math.round(callout.value * 100) < 30 },
                  ]}
                >
                  {Math.round(callout.value * 100)}%
                </code>
              </td>
            </tr>
            <tr class="border-b border-slate-200 text-xs">
              <th scope="col" class="px-6 py-3 bg-slate-50">
                Row
              </th>
              <td scope="col" class="px-6 py-3">
                <code>{callout.rowSymbol}</code>
              </td>
            </tr>
            <tr class="border-b border-slate-200 text-xs">
              <th scope="col" class="px-6 py-3 bg-slate-50">
                Column
              </th>
              <td scope="col" class="px-6 py-3">
                <code>{callout.colSymbol}</code>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
});

export const MatrixCells = component$<{
  matrix: number[][];
  symbols: Symbol[];
}>(({ matrix, symbols }) => {
  const size = matrix.length;
  return (
    <>
      {matrix.map((row, rowIdx) => (
        <div
          class="flex"
          style={{ height: 100 / size + '%' }}
          key={rowIdx}
          data-row-symbol={symbols[rowIdx].name}
        >
          {cells(row, symbols)}
        </div>
      ))}
    </>
  );
});

function cells(row: number[], symbols: Symbol[]) {
  const size = row.length;
  const cells: JSXOutput[] = [];
  const total = vectorSum(row);
  let sparseSize = 0;
  for (let colIdx = 0; colIdx < row.length; colIdx++) {
    const value = row[colIdx];
    if (value / total > 0.05) {
      if (sparseSize) {
        cells.push(
          <div class="h-full inline-block" style={{ width: (sparseSize * 100) / size + '%' }} />
        );
        sparseSize = 0;
      }
      cells.push(
        <div
          key={colIdx}
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
