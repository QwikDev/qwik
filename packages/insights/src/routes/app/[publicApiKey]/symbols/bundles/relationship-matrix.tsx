import { component$, useSignal } from '@qwik.dev/core';
import { getMatrixCellColor, getMatrixView, type BundleInfo } from './bundle-view';

export const RelationshipMatrix = component$<{ data: BundleInfo; selectedIndex: number }>(
  ({ data, selectedIndex }) => {
    const scope = useSignal('selected');
    const minimumScore = useSignal(0);
    const selectedRow = useSignal(0);
    const selectedColumn = useSignal(0);
    const view = getMatrixView(data, selectedIndex, scope.value === 'all');
    const size = view.symbols.length;
    const row = Math.min(selectedRow.value, Math.max(0, size - 1));
    const column = Math.min(selectedColumn.value, Math.max(0, size - 1));
    const later = view.symbols[row];
    const preceding = view.symbols[column];
    const score = view.matrix[row]?.find((cell) => cell.column === column)?.value ?? 0;

    return (
      <section data-panel="matrix" class="p-editorial-5" aria-labelledby="matrix-title">
        <div class="flex flex-wrap items-end justify-between gap-editorial-4">
          <div>
            <h2 id="matrix-title" data-matrix-title class="text-editorial-20 font-semibold">
              Execution relationships · {size} {size === 1 ? 'symbol' : 'symbols'}
            </h2>
            <p class="mt-editorial-2 text-editorial-12 text-editorial-secondary">
              Columns precede rows along modeled execution paths. Scores are directional, not
              measured probabilities. Both axes use the same group order.
            </p>
          </div>
          <label class="text-editorial-12">
            Matrix scope
            <select
              data-matrix-scope
              class="mt-editorial-2 block rounded-editorial-md border border-editorial-border bg-editorial-surface p-editorial-2"
              value={scope.value}
              onChange$={(_, select) => {
                scope.value = select.value;
                selectedRow.value = 0;
                selectedColumn.value = 0;
              }}
            >
              <option value="selected">Selected group</option>
              <option value="all">All groups</option>
            </select>
          </label>
        </div>
        <div class="mt-editorial-4 flex flex-wrap items-center gap-editorial-4 text-editorial-12">
          <span>Relationship score</span>
          {[0, 0.5, 1].map((value) => (
            <span key={value} class="flex items-center gap-editorial-2">
              <span
                class="inline-block h-3 w-3"
                style={{
                  backgroundColor: getMatrixCellColor(value),
                }}
                aria-hidden="true"
              />
              {value.toFixed(1)}
            </span>
          ))}
          <span>Muted diagonal = self relationship</span>
          <label class="flex items-center gap-editorial-2">
            Minimum score
            <select
              class="rounded-editorial-md border border-editorial-border bg-editorial-surface p-editorial-2"
              data-matrix-minimum
              value={minimumScore.value}
              onChange$={(_, select) => {
                minimumScore.value = Number(select.value);
              }}
            >
              <option value="0">Show all</option>
              <option value="0.1">0.1</option>
              <option value="0.5">0.5</option>
              <option value="0.8">0.8</option>
            </select>
          </label>
        </div>
        <p class="mt-editorial-3 text-editorial-12 text-editorial-secondary">
          Color intensity follows the score; very weak connections fade into the background. Select
          a pair to inspect its score.
        </p>
        <details class="mt-editorial-3 text-editorial-12">
          <summary class="cursor-pointer">How to read patterns</summary>
          <ul class="mt-editorial-2 list-disc space-y-editorial-2 pl-editorial-5 text-editorial-secondary">
            <li>Vertical bands: a preceding symbol connects to many later symbols.</li>
            <li>Horizontal bands: a later symbol connects to many preceding symbols.</li>
            <li>
              Blocks and triangles can reflect execution chains or symbols sharing parts of those
              chains. Axis ordering affects their shape.
            </li>
            <li>
              Scores include indirect relationships along modeled paths, not just direct calls. A
              large pale region does not imply strong connections.
            </li>
          </ul>
        </details>
        <p class="mt-editorial-3 text-editorial-12 text-editorial-secondary">
          {minimumScore.value > 0
            ? `Blank cells have no modeled connection or a score below ${minimumScore.value}. Select a pair to see its exact score.`
            : 'A zero score means no modeled connection. Very weak positive scores may also appear blank; inspect a pair to distinguish them.'}
        </p>
        {size > 0 && (
          <>
            <div class="mt-editorial-5 grid gap-editorial-4 sm:grid-cols-2">
              <label class="min-w-0 text-editorial-12">
                Preceding symbol (column)
                <select
                  data-matrix-column
                  class="mt-editorial-2 block w-full rounded-editorial-md border border-editorial-border bg-editorial-surface p-editorial-2"
                  value={column}
                  onChange$={(_, select) => {
                    selectedColumn.value = Number(select.value);
                  }}
                >
                  {view.symbols.map((symbol, index) => (
                    <option
                      key={symbol.name}
                      value={index}
                    >{`${index + 1}. ${symbol.fullName || symbol.name} · ${symbol.name}`}</option>
                  ))}
                </select>
              </label>
              <label class="min-w-0 text-editorial-12">
                Later symbol (row)
                <select
                  data-matrix-row
                  class="mt-editorial-2 block w-full rounded-editorial-md border border-editorial-border bg-editorial-surface p-editorial-2"
                  value={row}
                  onChange$={(_, select) => {
                    selectedRow.value = Number(select.value);
                  }}
                >
                  {view.symbols.map((symbol, index) => (
                    <option
                      key={symbol.name}
                      value={index}
                    >{`${index + 1}. ${symbol.fullName || symbol.name} · ${symbol.name}`}</option>
                  ))}
                </select>
              </label>
            </div>
            <div
              data-matrix-detail
              aria-live="polite"
              class="mt-editorial-4 break-words text-editorial-12"
            >
              <p class="font-editorial-mono">
                {preceding.fullName || preceding.name} → {later.fullName || later.name}
              </p>
              <p class="mt-editorial-2">
                {row === column
                  ? `Self relationship: ${score.toFixed(2)} / 1 (muted in the matrix)`
                  : score === 0
                    ? 'No modeled connection: 0.00 / 1'
                    : `Relationship score: ${score.toFixed(2)} / 1${score < minimumScore.value ? ' (hidden by minimum score)' : ''}`}
              </p>
              <p class="mt-editorial-2 font-editorial-mono text-editorial-secondary">
                {preceding.name} → {later.name}
              </p>
              <p class="mt-editorial-2 text-editorial-secondary">
                {preceding.fileSrc || 'Source metadata unavailable'} →{' '}
                {later.fileSrc || 'Source metadata unavailable'}
              </p>
            </div>
            <div class="mt-editorial-5 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-editorial-2">
              <span class="text-editorial-12 text-editorial-secondary [writing-mode:vertical-rl]">
                Later symbol (row) ↓
              </span>
              <div class="min-w-0">
                <p class="mb-editorial-2 text-center text-editorial-12 text-editorial-secondary">
                  Preceding symbol (column) →
                </p>
                <svg
                  class="aspect-square w-full border border-editorial-border"
                  viewBox={`0 0 ${size} ${size}`}
                  role="img"
                  aria-label={`Directional relationship matrix for ${size} symbols. Use the preceding and later symbol selectors to inspect cells.`}
                  onClick$={(event, svg) => {
                    const bounds = svg.getBoundingClientRect();
                    selectedColumn.value = Math.max(
                      0,
                      Math.min(
                        size - 1,
                        Math.floor(((event.clientX - bounds.left) * size) / bounds.width)
                      )
                    );
                    selectedRow.value = Math.max(
                      0,
                      Math.min(
                        size - 1,
                        Math.floor(((event.clientY - bounds.top) * size) / bounds.height)
                      )
                    );
                  }}
                >
                  {view.matrix.map((cells, rowIndex) =>
                    cells.map((cell) =>
                      rowIndex === cell.column || cell.value >= minimumScore.value ? (
                        <rect
                          key={`${rowIndex}:${cell.column}`}
                          x={cell.column}
                          y={rowIndex}
                          width="1"
                          height="1"
                          fill={
                            rowIndex === cell.column
                              ? 'var(--color-editorial-data-band)'
                              : getMatrixCellColor(cell.value)
                          }
                        />
                      ) : null
                    )
                  )}
                  {view.groups.slice(1).map((group) => (
                    <g
                      key={group.label}
                      stroke="var(--color-editorial-muted)"
                      stroke-width="1"
                      vector-effect="non-scaling-stroke"
                    >
                      <line
                        x1={group.start}
                        x2={group.start}
                        y1="0"
                        y2={size}
                        vector-effect="non-scaling-stroke"
                      />
                      <line
                        y1={group.start}
                        y2={group.start}
                        x1="0"
                        x2={size}
                        vector-effect="non-scaling-stroke"
                      />
                    </g>
                  ))}
                  <rect
                    x="0"
                    y={row}
                    width={size}
                    height="1"
                    fill="var(--color-editorial-data-current)"
                    fill-opacity="0.08"
                    pointer-events="none"
                  />
                  <rect
                    x={column}
                    y="0"
                    width="1"
                    height={size}
                    fill="var(--color-editorial-data-current)"
                    fill-opacity="0.08"
                    pointer-events="none"
                  />
                  <rect
                    x={column}
                    y={row}
                    width="1"
                    height="1"
                    fill="none"
                    stroke="var(--color-editorial-primary)"
                    stroke-width="2"
                    vector-effect="non-scaling-stroke"
                    pointer-events="none"
                  />
                </svg>
              </div>
            </div>
            {view.groups.length > 1 && (
              <details class="mt-editorial-3 text-editorial-12">
                <summary class="cursor-pointer">
                  Group boundaries ({view.groups.length} groups)
                </summary>
                <ol class="mt-editorial-2 grid gap-editorial-2 sm:grid-cols-2">
                  {view.groups.map((group) => (
                    <li key={group.label}>
                      {group.label}: positions {group.start + 1}–{group.start + group.size}
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </>
        )}
      </section>
    );
  }
);
