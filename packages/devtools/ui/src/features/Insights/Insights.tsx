import { $, component$, Slot, useSignal, useVisibleTask$ } from '@qwik.dev/core';
import type { InsightsDbData } from '@qwik.dev/devtools/kit';
import { getDevtoolsRpc } from '../../devtools/rpc';

export const Insights = component$(() => {
  const data = useSignal<InsightsDbData | null>(null);
  const isLoading = useSignal(true);
  const errorMessage = useSignal('');

  const load = $(async () => {
    isLoading.value = true;
    errorMessage.value = '';
    try {
      const rpc = await getDevtoolsRpc();
      data.value = await rpc.getInsightsData();
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'Failed to load insights data.';
    } finally {
      isLoading.value = false;
    }
  });

  useVisibleTask$(async () => {
    await load();
  });

  const value = data.value;
  const hasRows = !!value && (value.apps.length || value.edges.length || value.routes.length);
  const error = errorMessage.value || value?.error;
  // Rows from several apps can share a DB; only label them when that happens.
  const showApp =
    !!value &&
    new Set([...value.apps, ...value.edges, ...value.routes].map((row) => row.publicApiKey)).size >
      1;
  const withApp = (key: string, cells: (string | number)[]) => (showApp ? [key, ...cells] : cells);
  const appHead = (head: string[]) => (showApp ? ['App', ...head] : head);

  return (
    <div class="flex h-full min-h-0 flex-col gap-4 overflow-auto">
      <div class="border-glass-border bg-card-item-bg rounded-2xl border p-5">
        <div class="flex items-start justify-between gap-3">
          <div class="flex flex-col gap-1">
            <div class="text-lg font-semibold">Insights</div>
            <div class="text-muted-foreground max-w-3xl text-sm leading-6">
              Symbol correlation collected from real sessions, read from your libSQL/Turso database.
            </div>
          </div>
          <button
            type="button"
            onClick$={load}
            disabled={isLoading.value}
            class="border-border bg-foreground/5 hover:bg-foreground/10 rounded-xl border px-4 py-2 text-sm transition-colors disabled:opacity-50"
          >
            {isLoading.value ? 'Loading…' : 'Refresh'}
          </button>
        </div>
        {value ? (
          <code class="text-muted-foreground bg-foreground/5 mt-3 inline-block rounded-lg px-3 py-2 text-xs">
            {value.dbUrl}
            {value.configured ? '' : ' (default — set QWIK_INSIGHTS_DB_URL to point elsewhere)'}
          </code>
        ) : null}
        {error ? (
          <div class="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        ) : null}
      </div>

      {isLoading.value ? (
        <div class="border-glass-border bg-card-item-bg text-muted-foreground rounded-2xl border p-6 text-sm">
          Reading insights database…
        </div>
      ) : hasRows ? (
        <>
          {value!.apps.length ? (
            <Section title={`Applications (${value!.apps.length})`}>
              <Table head={['Name', 'Public API key', 'URL']}>
                {value!.apps.map((app, i) => (
                  <Row key={i} cells={[app.name, app.publicApiKey, app.url ?? '—']} />
                ))}
              </Table>
            </Section>
          ) : null}

          {value!.edges.length ? (
            <Section title={`Symbol edges (top ${value!.edges.length})`}>
              <Table head={appHead(['From', 'To', 'Interaction', 'Count'])}>
                {value!.edges.map((edge, i) => (
                  <Row
                    key={i}
                    cells={withApp(edge.publicApiKey, [
                      edge.from ?? '(root)',
                      edge.to,
                      edge.interaction ? 'yes' : '',
                      edge.count,
                    ])}
                  />
                ))}
              </Table>
            </Section>
          ) : null}

          {value!.routes.length ? (
            <Section title={`Routes (top ${value!.routes.length})`}>
              <Table head={appHead(['Route', 'Symbol', 'Count'])}>
                {value!.routes.map((route, i) => (
                  <Row
                    key={i}
                    cells={withApp(route.publicApiKey, [route.route, route.symbol, route.count])}
                  />
                ))}
              </Table>
            </Section>
          ) : null}
        </>
      ) : (
        <div class="border-glass-border bg-card-item-bg rounded-2xl border p-6">
          <div class="flex max-w-3xl flex-col gap-3">
            <div class="text-base font-semibold">No insights data yet</div>
            <div class="text-muted-foreground text-sm leading-6">
              Point <code class="bg-foreground/5 rounded px-1">QWIK_INSIGHTS_DB_URL</code> at the
              libSQL/Turso database your app reports to (add{' '}
              <code class="bg-foreground/5 rounded px-1">QWIK_INSIGHTS_DB_AUTH_TOKEN</code> for
              Turso cloud), then refresh once sessions have been collected.
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

const Section = component$<{ title: string }>(({ title }) => (
  <div class="border-glass-border bg-card-item-bg rounded-2xl border p-4">
    <div class="mb-3 text-sm font-semibold">{title}</div>
    <div class="overflow-x-auto">
      <Slot />
    </div>
  </div>
));

const Table = component$<{ head: string[] }>(({ head }) => (
  <table class="w-full text-left text-xs">
    <thead class="text-muted-foreground">
      <tr>
        {head.map((h, i) => (
          <th key={i} class="border-glass-border border-b px-2 py-1 font-medium">
            {h}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      <Slot />
    </tbody>
  </table>
));

const Row = component$<{ cells: (string | number)[] }>(({ cells }) => (
  <tr class="hover:bg-foreground/5">
    {cells.map((cell, i) => (
      <td key={i} class="border-glass-border/50 truncate border-b px-2 py-1 font-mono">
        {cell}
      </td>
    ))}
  </tr>
));
