import { component$, useSignal, useStylesScoped$, useTask$ } from '@qwik.dev/core';
import { getMatrixCellColor, type BundleInfo } from '../bundles/bundle-view';
import {
  formatScore,
  findObservedPath,
  getExamplePath,
  getGroupDensity,
  getNeighborhood,
  getDefaultSymbol,
  type ObservedEdge,
} from './visualizations';

type LabData = BundleInfo & { observedEdges: ObservedEdge[] };
const views = [
  ['groups', 'Group sizes'],
  ['neighborhood', 'Neighborhood'],
  ['ranked', 'Ranked connections'],
  ['matrix', 'Group matrix'],
  ['paths', 'Observed paths'],
];
const control =
  'w-full min-w-0 rounded-editorial-md border border-editorial-border bg-editorial-surface p-editorial-3 text-editorial-12';
const button =
  'cursor-pointer rounded-editorial-md border border-editorial-border px-editorial-4 py-editorial-2 text-editorial-12 hover:bg-editorial-selected focus-visible:outline-2 focus-visible:outline-editorial-accent';

interface VisualizationExplorerProps {
  data: LabData;
  initialView?: string;
  currentSearch?: string;
}

export const VisualizationExplorer = component$<VisualizationExplorerProps>(
  (props) => {
    const { data, initialView, currentSearch = '' } = props;
    useStylesScoped$(`
    .lab-graph { position:relative; margin-top:24px; }
    .lab-graph svg { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
    .lab-node { position:absolute; width:28%; transform:translateY(-50%); text-align:left; overflow-wrap:anywhere; }
    .lab-node code { display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .lab-center { left:36%; }
    .lab-path { display:flex; flex-wrap:wrap; align-items:center; gap:16px; }
    .lab-path-node { flex:1 1 180px; min-width:0; overflow-wrap:anywhere; }
    @media(max-width:700px) {
      .lab-graph { height:auto !important; display:flex; flex-direction:column; gap:16px; }
      .lab-graph svg { display:none; }
      .lab-node { position:static; width:100%; transform:none; }
      .lab-center { order:-1; }
    }
  `);
    const activeView = views.some(([key]) => key === initialView) ? initialView! : 'groups';
    const named = new Map(
      data.symbols
        .filter((symbol) => symbol.fullName)
        .map((symbol) => [symbol.name, symbol.fullName!])
    );
    const selectedSymbol = useSignal(() => getDefaultSymbol(data));
    useTask$(({ track }) => {
      const report = track(() => props.data);
      if (!report.symbols.some((symbol) => symbol.name === selectedSymbol.value)) {
        selectedSymbol.value = getDefaultSymbol(report);
      }
    });
    const selectedGroup = useSignal(0);
    const memberLimit = useSignal(6);
    const showAllGroups = useSignal(false);
    const threshold = useSignal(0.5);
    const matrixRow = useSignal(0);
    const matrixColumn = useSignal(0);
    const example = useSignal(() =>
      activeView === 'paths' ? getExamplePath(data.observedEdges, new Set(named.keys())) : []
    );
    const pathFrom = useSignal(() => example.value[0] ?? '');
    const pathTo = useSignal(() => example.value[example.value.length - 1] ?? '');
    const name = (hash: string) => named.get(hash) || hash;
    const neighborhood = getNeighborhood(data, selectedSymbol.value, 5);
    const density = getGroupDensity(data, threshold.value);
    const cell = density.cells.at(matrixRow.value)?.at(matrixColumn.value);
    const path = findObservedPath(data.observedEdges, pathFrom.value, pathTo.value);
    const graphHeight =
      Math.max(3, neighborhood.incoming.length, neighborhood.outgoing.length) * 95;
    const position = (index: number, total: number) => ((index + 0.5) / total) * graphHeight;
    const group = data.bundles.at(selectedGroup.value);
    const namedMembers = group?.symbols.filter((symbol) => symbol.fullName) ?? [];

    return (
      <div class="font-editorial-ui text-editorial-primary">
        <header class="border-b border-editorial-border pb-editorial-5">
          <p class="text-editorial-11 uppercase tracking-[0.08em] text-editorial-muted">
            Exploration preview · same execution dataset
          </p>
          <h1 class="mt-editorial-2 text-editorial-36 font-semibold">Relationship lab</h1>
          <p class="mt-editorial-2 text-editorial-14 text-editorial-secondary">
            {data.symbols.length} symbols · {data.bundles.length} suggested groups · latest 100
            manifests
          </p>
        </header>
        <nav
          class="flex flex-wrap gap-editorial-2 border-b border-editorial-border py-editorial-4"
          aria-label="Visualization alternatives"
        >
          {views.map(([key, label]) => (
            <a
              key={key}
              href={(() => {
                const params = new URLSearchParams(currentSearch);
                params.set('view', key);
                return `?${params.toString()}`;
              })()}
              aria-current={activeView === key ? 'page' : undefined}
              class={[button, activeView === key ? 'bg-editorial-selected font-semibold' : '']}
            >
              {label}
            </a>
          ))}
        </nav>

        {activeView === 'groups' && (
          <section class="pt-editorial-5" aria-labelledby="groups-title">
            <h2 id="groups-title" class="text-editorial-24 font-semibold">
              How is this application divided?
            </h2>
            <p class="mt-editorial-2 text-editorial-14 text-editorial-secondary">
              Bar length is the share of recorded symbols. Groups are suggestions, not emitted build
              files.
            </p>
            <div class="mt-editorial-5 grid gap-editorial-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <div>
                {(showAllGroups.value ? data.bundles : data.bundles.slice(0, 8)).map(
                  (bundle, index) => (
                    <button
                      key={bundle.name}
                      type="button"
                      class={[
                        'block w-full cursor-pointer border-b border-editorial-border px-editorial-3 py-editorial-3 text-left hover:bg-editorial-subtle',
                        selectedGroup.value === index ? 'bg-editorial-selected' : '',
                      ]}
                      aria-pressed={selectedGroup.value === index}
                      onClick$={() => {
                        selectedGroup.value = index;
                        memberLimit.value = 6;
                      }}
                    >
                      <span class="flex justify-between gap-editorial-4 text-editorial-12">
                        <span class="font-semibold">Group {index + 1}</span>
                        <span>
                          {bundle.symbols.length} symbols ·{' '}
                          {((bundle.symbols.length / data.symbols.length) * 100).toFixed(1)}%
                        </span>
                      </span>
                      <span
                        class="mt-editorial-2 block h-3 bg-editorial-data-band"
                        aria-hidden="true"
                      >
                        <span
                          class="block h-full bg-editorial-data-current"
                          style={{
                            width: `${(bundle.symbols.length / data.symbols.length) * 100}%`,
                          }}
                        />
                      </span>
                    </button>
                  )
                )}
                {data.bundles.length > 8 && (
                  <button
                    type="button"
                    class={[button, 'mt-editorial-4']}
                    onClick$={() => {
                      showAllGroups.value = !showAllGroups.value;
                      if (!showAllGroups.value && selectedGroup.value >= 8) {
                        selectedGroup.value = 0;
                        memberLimit.value = 6;
                      }
                    }}
                  >
                    {showAllGroups.value
                      ? 'Show largest eight'
                      : `Show all ${data.bundles.length} groups`}
                  </button>
                )}
              </div>
              {group && (
                <aside
                  aria-live="polite"
                  class="min-w-0 border-l border-editorial-border pl-editorial-5"
                >
                  <h3 class="text-editorial-20 font-semibold">Group {selectedGroup.value + 1}</h3>
                  <p class="mt-editorial-2 text-editorial-14">
                    {group.symbols.length} symbols ·{' '}
                    {group.symbols
                      .reduce((sum, symbol) => sum + symbol.count, 0)
                      .toLocaleString('en')}{' '}
                    executions
                  </p>
                  <p class="mt-editorial-4 text-editorial-12 text-editorial-secondary">
                    Showing {Math.min(memberLimit.value, namedMembers.length)} of{' '}
                    {namedMembers.length} members with source metadata
                  </p>
                  <ul class="mt-editorial-2 space-y-editorial-3 text-editorial-12">
                    {namedMembers.slice(0, memberLimit.value).map((symbol) => (
                      <li key={symbol.name} class="break-words">
                        <code>{name(symbol.name)}</code>
                        <p class="text-editorial-secondary">{symbol.fileSrc}</p>
                      </li>
                    ))}
                  </ul>
                  {namedMembers.length > memberLimit.value && (
                    <button
                      type="button"
                      class={button}
                      onClick$={() => {
                        memberLimit.value += 6;
                      }}
                    >
                      Show more members
                    </button>
                  )}
                  <p class="mt-editorial-4 text-editorial-12 text-editorial-secondary">
                    A large group can be joined through chains; its members need not all be strongly
                    connected.
                  </p>
                </aside>
              )}
            </div>
          </section>
        )}

        {(activeView === 'neighborhood' || activeView === 'ranked') && (
          <section class="pt-editorial-5" aria-labelledby="symbol-title">
            <h2 id="symbol-title" class="text-editorial-24 font-semibold">
              {activeView === 'neighborhood'
                ? 'What connects to this symbol?'
                : 'Which connections are strongest?'}
            </h2>
            <p class="mt-editorial-2 text-editorial-14 text-editorial-secondary">
              Modeled preceding → later relationships, including indirect paths. Scores are not
              measured probabilities.
            </p>
            <label class="mt-editorial-4 block max-w-xl text-editorial-12">
              Selected symbol
              <select
                class={['mt-editorial-2', control]}
                value={selectedSymbol.value}
                onChange$={(_, select) => {
                  selectedSymbol.value = select.value;
                }}
              >
                {data.symbols.map((symbol) => (
                  <option
                    key={symbol.name}
                    value={symbol.name}
                    selected={symbol.name === selectedSymbol.value}
                  >
                    {symbol.fullName ? `${symbol.fullName} · ${symbol.name}` : symbol.name}
                  </option>
                ))}
              </select>
            </label>
            {activeView === 'neighborhood' ? (
              <>
                <div class="mt-editorial-5 grid grid-cols-3 gap-editorial-3 text-editorial-12 text-editorial-secondary">
                  <span>Preceding · top 5</span>
                  <span class="text-center">Selected symbol</span>
                  <span class="text-right">Later · top 5</span>
                </div>
                <div
                  class="lab-graph"
                  style={{ height: `${graphHeight}px` }}
                  aria-label="Directed neighborhood graph"
                >
                  <svg
                    viewBox={`0 0 1000 ${graphHeight}`}
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <defs>
                      <marker
                        id="lab-arrow"
                        markerWidth="4"
                        markerHeight="4"
                        refX="3.5"
                        refY="2"
                        orient="auto"
                      >
                        <path d="M0,0 L4,2 L0,4 Z" fill="var(--color-editorial-data-current)" />
                      </marker>
                    </defs>
                    {neighborhood.incoming.map((edge, index) => (
                      <path
                        key={edge.from}
                        d={`M280,${position(index, neighborhood.incoming.length)} C320,${position(index, neighborhood.incoming.length)} 320,${graphHeight / 2} 356,${graphHeight / 2}`}
                        fill="none"
                        stroke="var(--color-editorial-data-current)"
                        stroke-width={1 + edge.score * 3}
                        opacity={0.25 + edge.score * 0.75}
                        marker-end="url(#lab-arrow)"
                      />
                    ))}
                    {neighborhood.outgoing.map((edge, index) => (
                      <path
                        key={edge.to}
                        d={`M640,${graphHeight / 2} C680,${graphHeight / 2} 680,${position(index, neighborhood.outgoing.length)} 716,${position(index, neighborhood.outgoing.length)}`}
                        fill="none"
                        stroke="var(--color-editorial-data-current)"
                        stroke-width={1 + edge.score * 3}
                        opacity={0.25 + edge.score * 0.75}
                        marker-end="url(#lab-arrow)"
                      />
                    ))}
                  </svg>
                  {neighborhood.incoming.map((edge, index) => (
                    <button
                      key={edge.from}
                      type="button"
                      class={['lab-node', button, 'bg-editorial-surface']}
                      style={{ left: 0, top: `${position(index, neighborhood.incoming.length)}px` }}
                      onClick$={() => {
                        selectedSymbol.value = edge.from;
                      }}
                    >
                      <code title={name(edge.from)} class="block text-editorial-12">
                        {name(edge.from)}
                      </code>
                      <span class="mt-editorial-2 block text-editorial-12 text-editorial-secondary">
                        → selected · {formatScore(edge.score)} / 1
                      </span>
                    </button>
                  ))}
                  <div
                    class="lab-node lab-center rounded-editorial-md border border-editorial-accent bg-editorial-selected p-editorial-4"
                    style={{ top: `${graphHeight / 2}px` }}
                  >
                    <p class="text-editorial-11 text-editorial-secondary">SELECTED</p>
                    <code
                      title={name(selectedSymbol.value)}
                      class="mt-editorial-2 block text-editorial-14 font-semibold"
                    >
                      {name(selectedSymbol.value)}
                    </code>
                    <p class="mt-editorial-2 break-all text-editorial-11 text-editorial-secondary">
                      {selectedSymbol.value}
                    </p>
                  </div>
                  {neighborhood.outgoing.map((edge, index) => (
                    <button
                      key={edge.to}
                      type="button"
                      class={['lab-node', button, 'bg-editorial-surface']}
                      style={{
                        right: 0,
                        top: `${position(index, neighborhood.outgoing.length)}px`,
                      }}
                      onClick$={() => {
                        selectedSymbol.value = edge.to;
                      }}
                    >
                      <code title={name(edge.to)} class="block text-editorial-12">
                        {name(edge.to)}
                      </code>
                      <span class="mt-editorial-2 block text-editorial-12 text-editorial-secondary">
                        selected → · {formatScore(edge.score)} / 1
                      </span>
                    </button>
                  ))}
                </div>
                <p class="mt-editorial-4 text-editorial-12 text-editorial-secondary">
                  Line thickness represents score. Select a neighbor to make it the center. Only the
                  five strongest connections on each side are shown.
                </p>
              </>
            ) : (
              <div class="mt-editorial-6 grid gap-editorial-6 md:grid-cols-2">
                {[
                  ['incoming', 'Preceding symbols · top 5'],
                  ['outgoing', 'Later symbols · top 5'],
                ].map(([direction, title]) => (
                  <section key={direction} class="min-w-0">
                    <h3 class="text-editorial-20 font-semibold">{title}</h3>
                    <p class="mt-editorial-1 text-editorial-12 text-editorial-secondary">
                      Relationship score · 0 to 1
                    </p>
                    <ol class="mt-editorial-4">
                      {neighborhood[direction as 'incoming' | 'outgoing'].map((edge) => {
                        const neighbor = direction === 'incoming' ? edge.from : edge.to;
                        return (
                          <li
                            key={neighbor}
                            class="border-b border-editorial-border py-editorial-3"
                          >
                            <button
                              type="button"
                              class="w-full cursor-pointer text-left"
                              onClick$={() => {
                                selectedSymbol.value = neighbor;
                              }}
                            >
                              <span class="flex items-start justify-between gap-editorial-3 text-editorial-12">
                                <code class="min-w-0 break-words">{name(neighbor)}</code>
                                <span class="shrink-0 tabular-nums">{formatScore(edge.score)}</span>
                              </span>
                              <span class="mt-editorial-2 block h-2 bg-editorial-data-band">
                                <span
                                  class="block h-full bg-editorial-data-current"
                                  style={{ width: `${edge.score * 100}%` }}
                                />
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                ))}
              </div>
            )}
            {!neighborhood.incoming.length && !neighborhood.outgoing.length && (
              <p class="mt-editorial-4 text-editorial-14">
                No modeled connections for this symbol.
              </p>
            )}
          </section>
        )}

        {activeView === 'matrix' && (
          <section class="pt-editorial-5" aria-labelledby="density-title">
            <h2 id="density-title" class="text-editorial-24 font-semibold">
              Which groups connect?
            </h2>
            <p class="mt-editorial-2 text-editorial-14 text-editorial-secondary">
              Cell value = qualifying directed pairs ÷ possible directed pairs. Self-pairs are
              excluded.
            </p>
            <div class="mt-editorial-4 flex flex-wrap items-center justify-between gap-editorial-4">
              <label class="text-editorial-12">
                Qualifying score ≥{' '}
                <select
                  class="rounded-editorial-md border border-editorial-border bg-editorial-surface p-editorial-2"
                  value={threshold.value}
                  onChange$={(_, select) => {
                    threshold.value = Number(select.value);
                  }}
                >
                  <option value="0.1" selected={threshold.value === 0.1}>
                    0.1
                  </option>
                  <option value="0.5" selected={threshold.value === 0.5}>
                    0.5
                  </option>
                  <option value="0.8" selected={threshold.value === 0.8}>
                    0.8
                  </option>
                </select>
              </label>
              <p class="text-editorial-12 text-editorial-secondary">
                Largest 8 groups + all remaining groups combined · darker = higher density
              </p>
            </div>
            <div class="mt-editorial-5 grid gap-editorial-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(220px,1fr)]">
              <div class="min-w-0 overflow-x-auto">
                <p class="mb-editorial-3 text-center text-editorial-12 text-editorial-secondary">
                  Preceding group (column) →
                </p>
                <table
                  class="w-full min-w-[500px] border-separate text-editorial-11"
                  style={{ borderSpacing: '3px' }}
                >
                  <thead>
                    <tr>
                      <th scope="col" class="text-left font-normal text-editorial-secondary">
                        Later group ↓
                      </th>
                      {density.groups.map((group, index) => (
                        <th scope="col" key={group.label} class="py-editorial-2 font-normal">
                          {index < 8 ? `G${index + 1}` : 'Other'}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {density.groups.map((group, row) => (
                      <tr key={group.label}>
                        <th scope="row" class="pr-editorial-2 text-left font-normal">
                          {row < 8 ? `Group ${row + 1}` : 'Other'}
                        </th>
                        {density.cells[row].map((summary, column) => (
                          <td key={column}>
                            <button
                              type="button"
                              aria-label={`${density.groups[column].label} to ${group.label}: ${(summary.density * 100).toFixed(2)} percent of pairs`}
                              aria-pressed={
                                matrixRow.value === row && matrixColumn.value === column
                              }
                              class="h-11 w-full cursor-pointer rounded-editorial-sm text-editorial-11 focus-visible:outline-2 focus-visible:outline-editorial-accent"
                              style={{
                                backgroundColor: getMatrixCellColor(summary.density),
                                color:
                                  summary.density > 0.6
                                    ? 'var(--color-editorial-on-accent)'
                                    : 'var(--color-editorial-primary)',
                                outline:
                                  matrixRow.value === row && matrixColumn.value === column
                                    ? '2px solid var(--color-editorial-accent)'
                                    : undefined,
                              }}
                              onClick$={() => {
                                matrixRow.value = row;
                                matrixColumn.value = column;
                              }}
                            >
                              {summary.possible === 0
                                ? '—'
                                : summary.density === 0
                                  ? '0'
                                  : `${(summary.density * 100).toFixed(summary.density < 0.01 ? 1 : 0)}%`}
                            </button>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {cell && (
                <aside
                  aria-live="polite"
                  class="min-w-0 border-l border-editorial-border pl-editorial-4"
                >
                  <h3 class="text-editorial-20 font-semibold">
                    {density.groups[matrixColumn.value].label} →{' '}
                    {density.groups[matrixRow.value].label}
                  </h3>
                  <p class="mt-editorial-3 text-editorial-24 font-semibold">
                    {(cell.density * 100).toFixed(2)}% density
                  </p>
                  <p class="mt-editorial-2 text-editorial-12 text-editorial-secondary">
                    {cell.count.toLocaleString('en')} of {cell.possible.toLocaleString('en')}{' '}
                    possible directed pairs score at least {threshold.value}.
                  </p>
                  <h4 class="mt-editorial-5 text-editorial-14 font-semibold">
                    Strongest qualifying pairs
                  </h4>
                  <ul class="mt-editorial-2 space-y-editorial-4 text-editorial-12">
                    {cell.strongest.map((edge) => (
                      <li key={`${edge.from}:${edge.to}`} class="break-words">
                        <code>
                          {name(edge.from)} → {name(edge.to)}
                        </code>
                        <p class="mt-editorial-1 text-editorial-secondary">
                          Score {edge.score.toFixed(2)} / 1
                        </p>
                      </li>
                    ))}
                  </ul>
                  {!cell.count && (
                    <p class="mt-editorial-3 text-editorial-12 text-editorial-secondary">
                      No pairs meet this threshold.
                    </p>
                  )}
                </aside>
              )}
            </div>
          </section>
        )}

        {activeView === 'paths' && (
          <section class="pt-editorial-5" aria-labelledby="path-title">
            <h2 id="path-title" class="text-editorial-24 font-semibold">
              What observed sequence connects these symbols?
            </h2>
            <p class="mt-editorial-2 max-w-3xl text-editorial-14 text-editorial-secondary">
              Shortest path through recorded neighboring executions, up to six steps. These are
              temporal relationships, not function calls or the exact path used by the score model.
            </p>
            <div class="mt-editorial-5 grid gap-editorial-4 md:grid-cols-2">
              {[
                ['from', 'Starting symbol'],
                ['to', 'Ending symbol'],
              ].map(([side, label]) => (
                <label key={side} class="min-w-0 text-editorial-12">
                  {label}
                  <select
                    class={['mt-editorial-2', control]}
                    value={side === 'from' ? pathFrom.value : pathTo.value}
                    onChange$={(_, select) => {
                      if (side === 'from') {
                        pathFrom.value = select.value;
                      } else {
                        pathTo.value = select.value;
                      }
                    }}
                  >
                    {data.symbols.map((symbol) => (
                      <option
                        key={symbol.name}
                        value={symbol.name}
                        selected={symbol.name === (side === 'from' ? pathFrom.value : pathTo.value)}
                      >
                        {symbol.fullName ? `${symbol.fullName} · ${symbol.name}` : symbol.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div aria-live="polite" class="mt-editorial-6">
              {path.length ? (
                <>
                  <p class="mb-editorial-4 text-editorial-12 text-editorial-secondary">
                    {path.length - 1} observed {path.length === 2 ? 'step' : 'steps'} · arrow labels
                    show recorded adjacent-execution counts
                  </p>
                  <div class="lab-path">
                    {path.map((hash, index) => (
                      <div key={hash} class="lab-path-node">
                        <div class="rounded-editorial-md border border-editorial-border bg-editorial-surface p-editorial-4">
                          <p class="text-editorial-11 text-editorial-secondary">STEP {index + 1}</p>
                          <code class="mt-editorial-2 block text-editorial-14 font-semibold">
                            {name(hash)}
                          </code>
                          <p class="mt-editorial-2 break-all text-editorial-11 text-editorial-secondary">
                            {hash}
                          </p>
                        </div>
                        {index < path.length - 1 && (
                          <p class="my-editorial-3 text-editorial-12 text-editorial-link">
                            →{' '}
                            {data.observedEdges
                              .find((edge) => edge.from === hash && edge.to === path[index + 1])
                              ?.count.toLocaleString('en')}{' '}
                            adjacent executions
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  <p class="mt-editorial-5 max-w-3xl text-editorial-12 text-editorial-secondary">
                    Each edge was observed separately; this does not prove that the entire sequence
                    occurred together in one session. Counts are not multiplied into a path
                    probability.
                  </p>
                </>
              ) : (
                <p class="text-editorial-14">
                  No observed path found within six steps. A modeled relationship may still exist.
                </p>
              )}
            </div>
          </section>
        )}
      </div>
    );
  }
);
