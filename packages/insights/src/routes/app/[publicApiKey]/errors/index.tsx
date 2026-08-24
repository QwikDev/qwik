import { component$, useSignal } from '@qwik.dev/core';
import { routeLoader$, type DocumentHead } from '@qwik.dev/router';
import { and, desc, eq, gte } from 'drizzle-orm';
import Button from '~/components/button';
import { StatusDot } from '~/components/status';
import { errorTable, getDB, type ErrorRow } from '~/db';
import {
  formatErrorDate,
  getErrorRoute,
  getErrorSince,
  groupErrors,
  type ErrorGroup,
} from './errors';

const ERROR_LIMIT = 1000;

export const head: DocumentHead = {
  title: 'Errors | Qwik Insights',
};

export const useErrors = routeLoader$(async ({ params }) => {
  const errors: ErrorRow[] = await getDB()
    .select()
    .from(errorTable)
    .where(
      and(
        eq(errorTable.publicApiKey, params.publicApiKey),
        gte(errorTable.timestamp, getErrorSince())
      )
    )
    .orderBy(desc(errorTable.timestamp), desc(errorTable.id))
    .limit(ERROR_LIMIT + 1)
    .all();
  const hasMore = errors.length > ERROR_LIMIT;

  return {
    groups: groupErrors(errors.slice(0, ERROR_LIMIT)),
    hasMore,
  };
});

export default component$(() => {
  const errors = useErrors();
  return <ErrorsView {...errors.value} />;
});

const ErrorsView = component$<{
  groups: ErrorGroup[];
  hasMore: boolean;
}>(({ groups, hasMore }) => {
  const selectedIndex = useSignal(0);
  const copied = useSignal<'source' | 'stack'>();
  const selected = groups[selectedIndex.value] ?? groups[0]!;
  const eventCount = groups.reduce((total, group) => total + group.occurrences, 0);

  return (
    <div class="font-editorial-ui text-editorial-primary">
      <p class="text-editorial-11 font-semibold tracking-[0.04em] text-editorial-muted uppercase">
        Error triage
      </p>
      <h1 class="mt-editorial-2 text-editorial-44 font-bold leading-[1.2] tracking-[-0.03em]">
        Errors
      </h1>
      <p class="mt-editorial-1 text-editorial-14 text-editorial-secondary">
        Track recurring failures by source, route, and manifest.
      </p>

      <div class="mt-editorial-8 flex flex-wrap items-baseline gap-x-editorial-2 gap-y-editorial-1 border-b border-editorial-border pb-editorial-3">
        <strong class="text-editorial-24 font-semibold text-editorial-danger">
          {hasMore ? `${ERROR_LIMIT.toLocaleString('en')}+` : eventCount} events
        </strong>
        <span class="text-editorial-14 text-editorial-secondary">
          across {groups.length} recent error {groups.length === 1 ? 'group' : 'groups'}
        </span>
      </div>

      {groups.length ? (
        <div class="grid lg:grid-cols-2">
          <section class="min-w-0 pt-editorial-6 lg:pr-editorial-6" aria-labelledby="issues-title">
            <h2
              id="issues-title"
              class="text-editorial-11 font-semibold tracking-[0.04em] text-editorial-muted uppercase"
            >
              Issues
            </h2>
            <ol class="mt-editorial-3">
              {groups.map((group, index) => {
                const isSelected = index === selectedIndex.value;
                return (
                  <li key={group.key}>
                    <button
                      type="button"
                      class={[
                        'grid min-h-24 w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto_auto] items-start gap-x-editorial-4 border-b border-editorial-border px-editorial-3 py-editorial-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-editorial-accent',
                        isSelected
                          ? 'rounded-editorial-lg bg-editorial-selected'
                          : 'hover:bg-editorial-subtle',
                      ]}
                      aria-pressed={isSelected}
                      onClick$={() => {
                        selectedIndex.value = index;
                        copied.value = undefined;
                      }}
                    >
                      <StatusDot class="mt-[0.3rem]" tone="danger" />
                      <span class="min-w-0">
                        <span class="block truncate text-editorial-14 font-semibold">
                          {group.message}
                        </span>
                        <code class="mt-editorial-2 block truncate font-editorial-mono text-editorial-12 text-editorial-link">
                          {formatSource(group)}
                        </code>
                      </span>
                      <time
                        class="text-editorial-12 text-editorial-muted"
                        dateTime={group.lastSeen}
                        title={formatErrorDate(group.lastSeen)}
                      >
                        {formatTime(group.lastSeen)}
                      </time>
                      <span class="min-w-6 text-right text-editorial-14 font-semibold text-editorial-danger">
                        {group.occurrences}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>

          <section
            class="min-w-0 pt-editorial-6 lg:border-l lg:border-editorial-border lg:pl-editorial-8"
            aria-labelledby="error-detail-title"
          >
            <p class="text-editorial-11 font-semibold tracking-[0.04em] text-editorial-muted uppercase">
              Detail
            </p>
            <h2
              id="error-detail-title"
              class="mt-editorial-6 text-editorial-24 font-semibold leading-[1.2] tracking-[-0.02em]"
            >
              {selected.message}
            </h2>
            <p class="mt-editorial-3 text-editorial-14 text-editorial-secondary">
              Latest on manifest {formatManifest(selected.manifestHash)} · {selected.occurrences}{' '}
              {selected.occurrences === 1 ? 'occurrence' : 'occurrences'} ·{' '}
              {getErrorRoute(selected.url)}
            </p>

            <section class="mt-editorial-8" aria-labelledby="stack-trace-title">
              <h3
                id="stack-trace-title"
                class="text-editorial-11 font-semibold tracking-[0.04em] text-editorial-muted uppercase"
              >
                Stack trace
              </h3>
              <div class="mt-editorial-3 min-h-40 overflow-x-auto rounded-editorial-lg border border-editorial-border bg-editorial-subtle p-editorial-6 font-editorial-mono text-editorial-12 leading-8">
                {selected.stack ? (
                  <code class="whitespace-pre-wrap break-words">
                    {selected.stack.split('\n').map((line, index) => (
                      <span
                        key={`${index}-${line}`}
                        class={[
                          'block',
                          index === 0 ? 'text-editorial-danger' : 'text-editorial-secondary',
                        ]}
                      >
                        {line}
                      </span>
                    ))}
                  </code>
                ) : (
                  <p class="font-editorial-ui text-editorial-14 text-editorial-secondary">
                    No stack trace recorded.
                  </p>
                )}
              </div>
            </section>

            <section class="mt-editorial-10" aria-labelledby="impact-title">
              <h3
                id="impact-title"
                class="text-editorial-11 font-semibold tracking-[0.04em] text-editorial-muted uppercase"
              >
                Impact
              </h3>
              <dl class="mt-editorial-4 grid grid-cols-2 gap-x-editorial-8 gap-y-editorial-6">
                <Metric label="Affected route" value={getErrorRoute(selected.url)} tone="link" />
                <Metric label="Manifest" value={formatManifest(selected.manifestHash)} />
                <Metric label="First seen" value={formatErrorDate(selected.firstSeen)} />
                <Metric label="Last seen" value={formatErrorDate(selected.lastSeen)} />
              </dl>
            </section>

            <div class="mt-editorial-10 flex flex-wrap gap-x-editorial-10 gap-y-editorial-3 border-t border-editorial-border pt-editorial-6">
              <Button
                theme="text"
                onClick$={async () => {
                  await navigator.clipboard.writeText(formatSource(selected));
                  copied.value = 'source';
                }}
              >
                {copied.value === 'source' ? 'Source copied' : 'Copy source location'}
              </Button>
              <Button
                theme="text"
                disabled={!selected.stack}
                onClick$={async () => {
                  await navigator.clipboard.writeText(selected.stack);
                  copied.value = 'stack';
                }}
              >
                {copied.value === 'stack' ? 'Stack copied' : 'Copy stack trace'}
              </Button>
            </div>
          </section>
        </div>
      ) : (
        <section class="py-editorial-16" aria-labelledby="empty-errors-title">
          <h2 id="empty-errors-title" class="text-editorial-24 font-semibold">
            No errors recorded in the last 30 days
          </h2>
          <p class="mt-editorial-2 text-editorial-14 text-editorial-secondary">
            New runtime errors will appear here automatically.
          </p>
        </section>
      )}
    </div>
  );
});

const Metric = component$<{
  label: string;
  tone?: 'link';
  value: string;
}>(({ label, tone, value }) => (
  <div>
    <dt class="text-editorial-11 font-semibold tracking-[0.04em] text-editorial-muted uppercase">
      {label}
    </dt>
    <dd
      class={[
        'mt-editorial-2 truncate text-editorial-20 font-semibold',
        tone === 'link' && 'text-editorial-link',
      ]}
      title={value}
    >
      {value}
    </dd>
  </div>
));

function formatSource(error: Pick<ErrorGroup, 'source' | 'line' | 'column'>): string {
  return `${error.source}:${error.line}:${error.column}`;
}

function formatManifest(manifestHash: string | null): string {
  return manifestHash?.slice(0, 8) || 'Unknown';
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('en', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
}
