import { component$, useSignal, useStylesScoped$ } from '@qwik.dev/core';
import { type BundleInfo } from '../bundles/bundle-view';
import { getNeighborhood, getDefaultSymbol } from './visualizations';

type LabData = BundleInfo;
const views = [
  ['groups', 'Group sizes'],
  ['neighborhood', 'Neighborhood'],
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
  ({ data, initialView, currentSearch = '' }) => {
    useStylesScoped$(`
    .lab-graph { position:relative; margin-top:24px; }
    .lab-graph svg { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
    .lab-node { position:absolute; width:28%; transform:translateY(-50%); text-align:left; overflow-wrap:anywhere; }
    .lab-center { left:36%; }
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
    const selectedGroup = useSignal(0);
    const memberLimit = useSignal(6);
    const showAllGroups = useSignal(false);
    const name = (hash: string) => named.get(hash) || hash;
    const neighborhood = getNeighborhood(data, selectedSymbol.value, 5);
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

        {activeView === 'neighborhood' && (
          <section class="pt-editorial-5" aria-labelledby="symbol-title">
            <h2 id="symbol-title" class="text-editorial-24 font-semibold">
              What connects to this symbol?
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
                    <code class="block text-editorial-12">{name(edge.from)}</code>
                    <span class="mt-editorial-2 block text-editorial-12 text-editorial-secondary">
                      → selected · {edge.score.toFixed(2)} / 1
                    </span>
                  </button>
                ))}
                <div
                  class="lab-node lab-center rounded-editorial-md border border-editorial-accent bg-editorial-selected p-editorial-4"
                  style={{ top: `${graphHeight / 2}px` }}
                >
                  <p class="text-editorial-11 text-editorial-secondary">SELECTED</p>
                  <code class="mt-editorial-2 block text-editorial-14 font-semibold">
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
                    <code class="block text-editorial-12">{name(edge.to)}</code>
                    <span class="mt-editorial-2 block text-editorial-12 text-editorial-secondary">
                      selected → · {edge.score.toFixed(2)} / 1
                    </span>
                  </button>
                ))}
              </div>
              <p class="mt-editorial-4 text-editorial-12 text-editorial-secondary">
                Line thickness represents score. Select a neighbor to make it the center. Only the
                five strongest connections on each side are shown.
              </p>
            </>
            {!neighborhood.incoming.length && !neighborhood.outgoing.length && (
              <p class="mt-editorial-4 text-editorial-14">
                No modeled connections for this symbol.
              </p>
            )}
          </section>
        )}
      </div>
    );
  }
);
