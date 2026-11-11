import { groupByAffinity, type AffinityLink } from '~/stats/bundle-affinity';
import {
  $,
  component$,
  useComputed$,
  useSignal,
  useStore,
  type JSXOutput,
  type QRL,
} from '@qwik.dev/core';
import { SymbolTile } from '~/components/symbol-tile';
import type { Symbol } from '~/stats/edges';
import {
  getBundleExecutionCount,
  getMatrixCellColor,
  type MatrixCell,
  type BundleInfo,
  type Relationship,
} from './bundle-view';

function getPreviewBundle(
  bundle: { name: string; symbols: BundleInfo['symbols'] },
  report: BundleInfo
) {
  const names = new Set(bundle.symbols.map((symbol) => symbol.name));
  const relationships: Relationship[] = [];
  report.matrix.forEach((row, laterIndex) => {
    const to = report.symbols[laterIndex].name;
    if (!names.has(to)) {
      return;
    }
    for (const cell of row) {
      const from = report.symbols[cell.column].name;
      if (from !== to && names.has(from)) {
        relationships.push({ from, to, score: cell.value });
      }
    }
  });
  relationships.sort((a, b) => b.score - a.score);
  const symbolRelationships: Record<string, Relationship[]> = Object.fromEntries(
    bundle.symbols.map((symbol) => [
      symbol.name,
      relationships
        .filter((connection) => connection.from === symbol.name || connection.to === symbol.name)
        .slice(0, 5),
    ])
  );
  return { ...bundle, relationships: relationships.slice(0, 10), symbolRelationships };
}

export const BundleExplorer = component$<{ data: BundleInfo & { affinityTree?: AffinityLink[] } }>(
  ({ data: initialData }) => {
    const affinity = useSignal(50);
    const data = useComputed$(() => ({
      ...initialData,
      bundles:
        affinity.value === 50 || !initialData.affinityTree
          ? initialData.bundles
          : groupByAffinity(initialData.symbols, initialData.affinityTree, affinity.value).map(
              (bundle) => getPreviewBundle(bundle, initialData)
            ),
    }));
    const selectedIndex = useSignal(0);
    const selectedView = useSignal('relationships');
    const selectedSymbol = useSignal('');
    const selectedRelationship = useSignal(-1);
    const selectedBundle = data.value.bundles.at(selectedIndex.value) ?? data.value.bundles.at(0);
    const strongestRelationships = selectedSymbol.value
      ? (selectedBundle?.symbolRelationships[selectedSymbol.value] ?? [])
      : (selectedBundle?.relationships ?? []);
    const relationship =
      selectedRelationship.value < 0
        ? undefined
        : strongestRelationships.at(selectedRelationship.value);

    return (
      <div class="font-editorial-ui text-editorial-primary">
        <header class="grid gap-editorial-6 border-b border-editorial-border pb-editorial-6 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p class="text-editorial-11 font-semibold tracking-[0.04em] text-editorial-muted uppercase">
              Bundle analysis
            </p>
            <h1 class="mt-editorial-2 text-editorial-44 font-bold leading-[1.1] tracking-[-0.035em]">
              Suggested bundles
            </h1>
            <p class="mt-editorial-2 max-w-2xl text-editorial-14 text-editorial-secondary">
              Explore suggested symbol groups based on execution relationships across the latest 100
              manifests. These are analysis groups, not emitted build files.
            </p>
          </div>
          {selectedBundle && (
            <div class="md:text-right">
              <code class="font-editorial-mono text-editorial-20 font-semibold">
                Group {selectedIndex.value + 1}
              </code>
              <p class="mt-editorial-1 text-editorial-12 text-editorial-secondary">
                {selectedBundle.symbols.length.toLocaleString('en')} symbols ·{' '}
                {getBundleExecutionCount(selectedBundle).toLocaleString('en')} executions
              </p>
            </div>
          )}
        </header>

        <section
          class="mt-editorial-6 rounded-editorial-md border border-editorial-border p-editorial-5"
          aria-labelledby="affinity-title"
        >
          <div class="flex flex-wrap items-center justify-between gap-editorial-4">
            <label
              id="affinity-title"
              for="bundle-affinity"
              class="text-editorial-14 font-semibold"
            >
              Clustering affinity
            </label>
            <button
              type="button"
              class="cursor-pointer text-editorial-12 text-editorial-link"
              onClick$={() => {
                affinity.value = 50;
                selectedIndex.value = 0;
                selectedSymbol.value = '';
                selectedRelationship.value = -1;
              }}
            >
              Reset to automatic
            </button>
          </div>
          <input
            id="bundle-affinity"
            type="range"
            min="0"
            max="100"
            step="1"
            value={affinity.value}
            class="mt-editorial-4 w-full cursor-pointer accent-[var(--color-editorial-accent)]"
            aria-describedby="affinity-help"
            aria-valuetext={`${affinity.value}% affinity, ${data.value.bundles.length} suggested bundles`}
            onInput$={(_, input) => {
              affinity.value = Number(input.value);
              selectedIndex.value = 0;
              selectedSymbol.value = '';
              selectedRelationship.value = -1;
            }}
          />
          <div class="flex justify-between text-editorial-12 text-editorial-secondary">
            <span>Fewer, larger bundles</span>
            <span>{affinity.value}% affinity</span>
            <span>More, smaller bundles</span>
          </div>
          <p id="affinity-help" class="mt-editorial-3 text-editorial-12 text-editorial-muted">
            Preview only. Drag to explore suggested groups. Build recommendations stay unchanged.
          </p>
        </section>

        <div class="flex flex-wrap items-baseline gap-x-editorial-2 gap-y-editorial-1 py-editorial-6">
          <strong class="text-editorial-24 font-semibold">
            {data.value.bundles.length.toLocaleString('en')} suggested groups
          </strong>
          <span class="text-editorial-14 text-editorial-secondary">
            across {data.value.symbols.length.toLocaleString('en')} recorded symbols
          </span>
        </div>

        <p class="mb-editorial-6 max-w-2xl text-editorial-14 text-editorial-secondary">
          Groups can connect through intermediate symbols; membership does not mean every pair has a
          strong relationship. Select a group to explore its members and connections.
        </p>

        {selectedBundle ? (
          <>
            <label class="mb-editorial-4 block text-editorial-14 lg:hidden">
              Suggested group
              <select
                aria-label="Suggested group"
                class="mt-editorial-2 block w-full rounded-editorial-md border border-editorial-border bg-editorial-surface p-editorial-3"
                value={selectedIndex.value}
                onChange$={(_, select) => {
                  selectedIndex.value = Number(select.value);
                  selectedSymbol.value = '';
                  selectedRelationship.value = -1;
                }}
              >
                {data.value.bundles.map((bundle, index) => (
                  <option
                    key={bundle.name}
                    value={index}
                  >{`Group ${index + 1} · ${bundle.symbols.length} symbols`}</option>
                ))}
              </select>
            </label>
            <div class="grid border-b border-editorial-border lg:grid-cols-[15rem_minmax(0,1fr)]">
              <section
                class="hidden min-w-0 border-r border-editorial-border lg:block"
                aria-labelledby="bundle-list-title"
              >
                <div class="border-b border-editorial-border px-editorial-5 py-editorial-4">
                  <h2
                    id="bundle-list-title"
                    class="text-editorial-11 font-semibold tracking-[0.04em] text-editorial-muted uppercase"
                  >
                    Suggested groups
                  </h2>
                </div>
                <ol class="p-editorial-2">
                  {data.value.bundles.map((bundle, index) => {
                    const isSelected = index === selectedIndex.value;
                    return (
                      <li key={bundle.name}>
                        <button
                          type="button"
                          class={[
                            'w-full cursor-pointer rounded-editorial-md px-editorial-3 py-editorial-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-editorial-accent',
                            isSelected ? 'bg-editorial-selected' : 'hover:bg-editorial-subtle',
                          ]}
                          data-group={index}
                          aria-pressed={isSelected}
                          onClick$={() => {
                            selectedIndex.value = index;
                            selectedSymbol.value = '';
                            selectedRelationship.value = -1;
                          }}
                        >
                          <span class="block truncate text-editorial-12 font-semibold">
                            Group {index + 1}
                          </span>
                          <span class="mt-editorial-1 block text-editorial-11 text-editorial-muted">
                            {bundle.symbols.length.toLocaleString('en')} symbols ·{' '}
                            {getBundleExecutionCount(bundle).toLocaleString('en')} executions
                          </span>
                          <span class="mt-editorial-2 block text-editorial-11 text-editorial-secondary">
                            {Math.round((bundle.symbols.length / data.value.symbols.length) * 100)}%
                            of recorded symbols
                          </span>
                          <span
                            class="mt-editorial-2 block h-1 bg-editorial-data-band"
                            aria-hidden="true"
                          >
                            <span
                              class="block h-full bg-editorial-data-current"
                              style={{
                                width: `${(bundle.symbols.length / data.value.symbols.length) * 100}%`,
                              }}
                            />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </section>

              <div class="min-w-0">
                <div
                  class="flex flex-wrap gap-editorial-2 border-b border-editorial-border p-editorial-4"
                  role="group"
                  aria-label="Group view"
                >
                  {['relationships', 'symbols', 'matrix'].map((view) => (
                    <button
                      key={view}
                      type="button"
                      data-view={view}
                      aria-pressed={selectedView.value === view}
                      aria-controls="group-content"
                      class={[
                        'cursor-pointer rounded-editorial-md px-editorial-4 py-editorial-2 text-editorial-14 focus-visible:outline-2 focus-visible:outline-editorial-accent',
                        selectedView.value === view
                          ? 'bg-editorial-selected font-semibold'
                          : 'hover:bg-editorial-subtle',
                      ]}
                      onClick$={() => {
                        selectedView.value = view;
                      }}
                    >
                      {view === 'matrix'
                        ? 'Matrix (advanced)'
                        : view === 'symbols'
                          ? 'Symbols'
                          : 'Relationships'}
                    </button>
                  ))}
                </div>
                <div id="group-content">
                  {selectedView.value === 'relationships' && (
                    <section
                      data-panel="relationships"
                      class="min-w-0"
                      aria-labelledby="relationship-list-title"
                    >
                      <div class="border-b border-editorial-border px-editorial-5 py-editorial-4">
                        <p class="text-editorial-11 font-semibold tracking-[0.04em] text-editorial-muted uppercase">
                          Selected group
                        </p>
                        <h2
                          id="relationship-list-title"
                          class="mt-editorial-2 text-editorial-20 font-semibold"
                        >
                          Strongest relationships
                        </h2>
                      </div>
                      <div class="px-editorial-5 py-editorial-4">
                        <p class="text-editorial-12 text-editorial-secondary">
                          Scores from 0 to 1 estimate directional relationships along execution
                          paths. They are not measured probabilities or statistical correlations.
                        </p>
                        <label class="mt-editorial-4 block text-editorial-12">
                          Why is this symbol in the group?
                          <select
                            class="mt-editorial-2 block w-full rounded-editorial-md border border-editorial-border bg-editorial-surface p-editorial-2"
                            value={selectedSymbol.value}
                            onChange$={(_, select) => {
                              selectedSymbol.value = select.value;
                              selectedRelationship.value = -1;
                            }}
                          >
                            <option value="">Top 10 group relationships</option>
                            {selectedBundle.symbols.map((symbol) => (
                              <option key={symbol.name} value={symbol.name}>
                                {symbol.fullName
                                  ? `${symbol.fullName} · ${symbol.name}`
                                  : symbol.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        {selectedSymbol.value && (
                          <p class="mt-editorial-2 text-editorial-12 text-editorial-secondary">
                            Up to five strongest incoming or outgoing connections. Group membership
                            can also connect through intermediate symbols.
                          </p>
                        )}
                      </div>
                      <div class="grid items-start md:grid-cols-2">
                        {strongestRelationships.length ? (
                          <ol>
                            {strongestRelationships.map((connection, index) => {
                              const from = selectedBundle.symbols.find(
                                (symbol) => symbol.name === connection.from
                              )!;
                              const to = selectedBundle.symbols.find(
                                (symbol) => symbol.name === connection.to
                              )!;
                              return (
                                <li
                                  key={`${connection.from}:${connection.to}`}
                                  class="border-b border-editorial-border"
                                >
                                  <button
                                    type="button"
                                    class="w-full cursor-pointer px-editorial-5 py-editorial-4 text-left hover:bg-editorial-subtle focus-visible:outline-2 focus-visible:outline-editorial-accent"
                                    data-relationship={index}
                                    aria-pressed={selectedRelationship.value === index}
                                    onClick$={() => {
                                      selectedRelationship.value = index;
                                    }}
                                  >
                                    <span class="block break-words font-editorial-mono text-editorial-12">
                                      {from.fullName || from.name}
                                    </span>
                                    <span class="mt-editorial-1 block break-words font-editorial-mono text-editorial-12">
                                      → {to.fullName || to.name}
                                    </span>
                                    <span class="mt-editorial-2 block text-editorial-12">
                                      Relationship score: {connection.score.toFixed(2)} / 1
                                    </span>
                                    <span
                                      class="mt-editorial-3 block h-1 bg-editorial-data-band"
                                      aria-hidden="true"
                                    >
                                      <span
                                        class="block h-full bg-editorial-data-current"
                                        style={{ width: `${connection.score * 100}%` }}
                                      />
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ol>
                        ) : (
                          <p class="px-editorial-5 py-editorial-8 text-editorial-12 text-editorial-muted">
                            No connections to other symbols recorded in this group.
                          </p>
                        )}
                        <div aria-live="polite" class="px-editorial-5 py-editorial-4">
                          {relationship ? (
                            <>
                              <h3 class="text-editorial-14 font-semibold">Selected relationship</h3>
                              <p class="mt-editorial-2 break-words font-editorial-mono text-editorial-12">
                                {relationship.from} → {relationship.to}
                              </p>
                              <p class="mt-editorial-2 text-editorial-12">
                                Relationship score: {relationship.score.toFixed(2)} / 1
                              </p>
                              {[relationship.from, relationship.to].map((name) => {
                                const symbol = selectedBundle.symbols.find(
                                  (symbol) => symbol.name === name
                                )!;
                                return (
                                  <div
                                    key={name}
                                    class="mt-editorial-3 break-words text-editorial-12"
                                  >
                                    <p class="font-editorial-mono">
                                      {symbol.fullName || symbol.name}
                                    </p>
                                    <p class="text-editorial-secondary">
                                      {symbol.fileSrc || 'Source metadata unavailable'}
                                    </p>
                                    <SymbolTile
                                      symbol={name}
                                      fullName={symbol.fullName}
                                      origin={symbol.fileSrc}
                                    />
                                  </div>
                                );
                              })}
                              <p class="mt-editorial-3 text-editorial-12 text-editorial-secondary">
                                The arrow runs from a preceding symbol to a later symbol along the
                                modeled path. It does not imply a direct function call. Raw
                                observation counts for this modeled relationship are not available
                                in this report.
                              </p>
                            </>
                          ) : (
                            <p class="text-editorial-12 text-editorial-secondary">
                              Select a relationship to keep its names, sources, and score visible.
                            </p>
                          )}
                        </div>
                      </div>
                    </section>
                  )}
                  {selectedView.value === 'symbols' && (
                    <section
                      data-panel="symbols"
                      class="min-w-0"
                      aria-labelledby="symbol-evidence-title"
                    >
                      <div class="border-b border-editorial-border px-editorial-5 py-editorial-4">
                        <p class="text-editorial-11 font-semibold tracking-[0.04em] text-editorial-muted uppercase">
                          Selected group
                        </p>
                        <h2
                          id="symbol-evidence-title"
                          class="mt-editorial-2 text-editorial-20 font-semibold"
                        >
                          Symbols in this group
                        </h2>
                      </div>
                      <div class="overflow-x-auto">
                        <table class="w-full min-w-[360px] text-left text-editorial-12">
                          <thead class="sticky top-0 border-b border-editorial-border bg-editorial-canvas text-editorial-11 tracking-[0.04em] text-editorial-muted uppercase">
                            <tr>
                              <th class="px-editorial-5 py-editorial-3 font-semibold">Symbol</th>
                              <th class="px-editorial-3 py-editorial-3 text-right font-semibold">
                                Executions
                              </th>
                              <th class="px-editorial-5 py-editorial-3 font-semibold">Source</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedBundle.symbols.map((symbol) => (
                              <tr
                                key={symbol.name}
                                class="border-b border-editorial-border align-top"
                              >
                                <th class="max-w-64 px-editorial-5 py-editorial-4 font-normal">
                                  {symbol.fullName && (
                                    <code class="block truncate font-editorial-mono text-editorial-12 font-semibold">
                                      {symbol.fullName}
                                    </code>
                                  )}
                                  <span
                                    class={[
                                      'block truncate font-editorial-mono text-editorial-11',
                                      symbol.fullName
                                        ? 'mt-editorial-1 text-editorial-link'
                                        : 'font-semibold',
                                    ]}
                                  >
                                    <SymbolTile
                                      symbol={symbol.name}
                                      fullName={symbol.fullName}
                                      origin={symbol.fileSrc}
                                    />
                                  </span>
                                </th>
                                <td class="px-editorial-3 py-editorial-4 text-right font-semibold">
                                  {symbol.count.toLocaleString('en')}
                                </td>
                                <td class="max-w-52 px-editorial-5 py-editorial-4">
                                  {symbol.fileSrc ? (
                                    <code class="block truncate font-editorial-mono text-editorial-11 text-editorial-secondary">
                                      {symbol.fileSrc}
                                    </code>
                                  ) : (
                                    <span class="text-editorial-11 text-editorial-muted">
                                      Metadata unavailable
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}
                  {selectedView.value === 'matrix' && (
                    <section
                      data-panel="matrix"
                      class="border-y border-editorial-border py-editorial-6"
                      aria-labelledby="matrix-title"
                    >
                      <div class="flex flex-wrap items-end justify-between gap-editorial-4">
                        <div>
                          <p class="text-editorial-11 font-semibold tracking-[0.04em] text-editorial-muted uppercase">
                            Relationship matrix
                          </p>
                          <h2
                            id="matrix-title"
                            class="mt-editorial-2 text-editorial-20 font-semibold"
                          >
                            {data.value.symbols.length.toLocaleString('en')} recorded symbols
                          </h2>
                          <p class="mt-editorial-1 text-editorial-12 text-editorial-secondary">
                            Darker cells indicate stronger observed relationships.
                          </p>
                        </div>
                        <p class="text-editorial-12 text-editorial-secondary">
                          Latest 100 manifests
                        </p>
                      </div>
                      <div class="mt-editorial-5">
                        <CorrelationMatrix
                          matrix={data.value.matrix}
                          symbols={data.value.symbols}
                        />
                      </div>
                    </section>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <section class="border-t border-editorial-border py-editorial-16">
            <h2 class="text-editorial-24 font-semibold">No symbol groups yet</h2>
            <p class="mt-editorial-2 text-editorial-14 text-editorial-secondary">
              Suggested groups will appear after symbol executions are recorded.
            </p>
          </section>
        )}
      </div>
    );
  }
);

export const CorrelationMatrix = component$<{
  matrix: MatrixCell[][];
  symbols: Symbol[];
}>(({ matrix, symbols }) => {
  const callout = useStore({
    visible: false,
    value: 0,
    rowSymbol: '',
    colSymbol: '',
  });
  const selectCell = $((_: Event, cell: HTMLButtonElement) => {
    callout.value = Number(cell.getAttribute('data-value'));
    callout.rowSymbol = cell.getAttribute('data-row-symbol')!;
    callout.colSymbol = cell.getAttribute('data-col-symbol')!;
    callout.visible = true;
  });
  return (
    <>
      <div class="border border-editorial-border aspect-square w-full max-w-[calc(70vmin-20px)] flex flex-col justify-evenly">
        <MatrixCells matrix={matrix} symbols={symbols} onSelect$={selectCell} />
      </div>
      <div
        data-matrix-details
        aria-live="polite"
        hidden={!callout.visible}
        class="mt-editorial-3 overflow-x-auto bg-editorial-surface border border-editorial-border text-xs"
      >
        <table class="w-full text-sm text-left">
          <tbody>
            <tr class="border-y border-editorial-border text-xs">
              <th scope="row" class="px-6 py-3 bg-editorial-subtle">
                Score
              </th>
              <td class="px-6 py-3">
                <code
                  class={[
                    'rounded-xs px-8 py-1 inline-block',
                    {
                      'bg-editorial-data-current text-editorial-on-accent':
                        Math.round(callout.value * 100) >= 70,
                    },
                    {
                      'bg-editorial-data-previous':
                        Math.round(callout.value * 100) >= 50 &&
                        Math.round(callout.value * 100) < 70,
                    },
                    {
                      'bg-editorial-data-band':
                        Math.round(callout.value * 100) >= 30 &&
                        Math.round(callout.value * 100) < 50,
                    },
                    { 'bg-editorial-subtle': Math.round(callout.value * 100) < 30 },
                  ]}
                >
                  {Math.round(callout.value * 100)}%
                </code>
              </td>
            </tr>
            <tr class="border-b border-editorial-border text-xs">
              <th scope="row" class="px-6 py-3 bg-editorial-subtle">
                Row
              </th>
              <td class="px-6 py-3">
                <code>{callout.rowSymbol}</code>
              </td>
            </tr>
            <tr class="border-b border-editorial-border text-xs">
              <th scope="row" class="px-6 py-3 bg-editorial-subtle">
                Column
              </th>
              <td class="px-6 py-3">
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
  matrix: MatrixCell[][];
  symbols: Symbol[];
  onSelect$: QRL<(event: Event, cell: HTMLButtonElement) => void>;
}>(({ matrix, symbols, onSelect$ }) => {
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
          {cells(row, symbols, symbols[rowIdx].name, onSelect$)}
        </div>
      ))}
    </>
  );
});

function cells(
  row: MatrixCell[],
  symbols: Symbol[],
  rowSymbol: string,
  onSelect$: QRL<(event: Event, cell: HTMLButtonElement) => void>
) {
  const size = symbols.length;
  const cells: JSXOutput[] = [];
  let nextColumn = 0;
  for (const { column, value } of row) {
    const gap = column - nextColumn;
    if (gap) {
      cells.push(<div class="h-full inline-block" style={{ width: (gap * 100) / size + '%' }} />);
    }
    cells.push(
      <button
        key={column}
        type="button"
        onMouseMove$={onSelect$}
        onFocus$={onSelect$}
        onClick$={onSelect$}
        aria-label={`Row: ${rowSymbol}, Column: ${symbols[column].name}, Score: ${Math.round(value * 100)}%`}
        class="h-full shrink-0 cursor-pointer border-0 p-0 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-editorial-accent"
        style={{
          width: 100 / size + '%',
          backgroundColor: getMatrixCellColor(value),
        }}
        data-row-symbol={rowSymbol}
        data-col-symbol={symbols[column].name}
        data-value={value}
      />
    );
    nextColumn = column + 1;
  }
  return cells;
}
