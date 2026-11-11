import { component$, useSignal } from '@qwik.dev/core';
import { type BundleInfo } from '../bundles/bundle-view';

type LabData = BundleInfo;
const views = [['groups', 'Group sizes']];
const button =
  'cursor-pointer rounded-editorial-md border border-editorial-border px-editorial-4 py-editorial-2 text-editorial-12 hover:bg-editorial-selected focus-visible:outline-2 focus-visible:outline-editorial-accent';

export const VisualizationExplorer = component$<{ data: LabData; initialView?: string }>(
  ({ data, initialView }) => {
    const activeView = views.some(([key]) => key === initialView) ? initialView! : 'groups';
    const named = new Map(
      data.symbols
        .filter((symbol) => symbol.fullName)
        .map((symbol) => [symbol.name, symbol.fullName!])
    );
    const selectedGroup = useSignal(0);
    const showAllGroups = useSignal(false);
    const name = (hash: string) => named.get(hash) || hash;
    const group = data.bundles.at(selectedGroup.value);

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
              href={`?view=${key}`}
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
                    Members with source metadata
                  </p>
                  <ul class="mt-editorial-2 space-y-editorial-3 text-editorial-12">
                    {group.symbols
                      .filter((symbol) => symbol.fullName)
                      .slice(0, 6)
                      .map((symbol) => (
                        <li key={symbol.name} class="break-words">
                          <code>{name(symbol.name)}</code>
                          <p class="text-editorial-secondary">{symbol.fileSrc}</p>
                        </li>
                      ))}
                  </ul>
                  <p class="mt-editorial-4 text-editorial-12 text-editorial-secondary">
                    A large group can be joined through chains; its members need not all be strongly
                    connected.
                  </p>
                </aside>
              )}
            </div>
          </section>
        )}
      </div>
    );
  }
);
