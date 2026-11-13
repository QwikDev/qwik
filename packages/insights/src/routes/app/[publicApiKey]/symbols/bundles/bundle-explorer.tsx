import { createPreviewBundles, getPreviewBundles } from './affinity-preview';
import type { MatrixPath } from '~/stats/edges';
import { groupByAffinity, type AffinityLink } from '~/stats/bundle-affinity';
import { component$, useComputed$, useSignal } from '@qwik.dev/core';
import { SymbolTile } from '~/components/symbol-tile';
import { getBundleExecutionCount, type BundleInfo } from './bundle-view';
import { RelationshipMatrix } from './relationship-matrix';

export const BundleExplorer = component$<{
  data: BundleInfo & { affinityTree?: AffinityLink[]; previewPaths?: MatrixPath[] };
}>(({ data: initialData }) => {
  const affinity = useSignal(50);
  const data = useComputed$(() => ({
    ...initialData,
    bundles:
      affinity.value === 50 || !initialData.affinityTree
        ? initialData.bundles
        : getPreviewBundles(
            groupByAffinity(initialData.symbols, initialData.affinityTree, affinity.value),
            initialData
          ),
  }));
  const selectedIndex = useSignal(0);
  const selectedView = useSignal('relationships');
  const selectedSymbol = useSignal('');
  const selectedRelationship = useSignal(-1);
  const selectedBundle = data.value.bundles.at(selectedIndex.value) ?? data.value.bundles.at(0);
  const strongestRelationships = useComputed$(() => {
    const bundle = data.value.bundles.at(selectedIndex.value) ?? data.value.bundles.at(0);
    if (!selectedSymbol.value) {
      return bundle?.relationships ?? [];
    }
    if (bundle && !initialData.bundles.includes(bundle)) {
      return (
        createPreviewBundles([bundle], initialData, selectedSymbol.value)[0].symbolRelationships[
          selectedSymbol.value
        ] ?? []
      );
    }
    return bundle?.symbolRelationships[selectedSymbol.value] ?? [];
  });
  const relationship =
    selectedRelationship.value < 0
      ? undefined
      : strongestRelationships.value.at(selectedRelationship.value);

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
          <label id="affinity-title" for="bundle-affinity" class="text-editorial-14 font-semibold">
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
                        Scores from 0 to 1 estimate directional relationships along execution paths.
                        They are not measured probabilities or statistical correlations.
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
                      {strongestRelationships.value.length ? (
                        <ol>
                          {strongestRelationships.value.map((connection, index) => {
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
                              observation counts for this modeled relationship are not available in
                              this report.
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
                  <RelationshipMatrix
                    key={`${selectedIndex.value}:${affinity.value}`}
                    data={data.value}
                    selectedIndex={selectedIndex.value}
                  />
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
});
