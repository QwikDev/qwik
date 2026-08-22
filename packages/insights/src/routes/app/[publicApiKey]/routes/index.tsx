import { component$ } from '@qwik.dev/core';
import { Link, routeLoader$, useLocation, useNavigate, type DocumentHead } from '@qwik.dev/router';
import SelectField from '~/components/select-field';
import { getDB } from '~/db';
import { dbGetManifests } from '~/db/sql-manifest';
import { getRoutes } from '~/db/sql-routes';
import { MIN_PERFORMANCE_SAMPLES } from '../performance';
import {
  formatManifestDate,
  getRoutesOverview,
  getSelectedManifestIndex,
  type RouteOverview,
} from './route-performance';
import { getRouteDetailsHref } from './route-url';

export const head: DocumentHead = {
  title: 'Routes | Qwik Insights',
};

export const useRouteData = routeLoader$(async ({ params, url }) => {
  const db = getDB();
  const publicApiKey = params.publicApiKey;
  const manifestHistory = await dbGetManifests(db, publicApiKey, { limit: 101 });
  const manifests = manifestHistory.slice(0, 100).map((manifest) => ({
    hash: manifest.hash,
    timestamp: manifest.timestamp.toISOString(),
  }));
  const manifestHashes = manifests.map((manifest) => manifest.hash);
  const selectedIndex = getSelectedManifestIndex(manifestHashes, url.searchParams.get('manifest'));
  const selectedHash = manifestHashes.at(selectedIndex);
  const previousHash = manifestHistory.at(selectedIndex + 1)?.hash;
  const [selectedRows, previousRows] = await Promise.all([
    selectedHash ? getRoutes(db, publicApiKey, [selectedHash]) : [],
    previousHash ? getRoutes(db, publicApiKey, [previousHash]) : [],
  ]);

  return {
    routes: getRoutesOverview(selectedRows, previousRows),
    manifests,
    selectedHash: selectedHash ?? null,
    previousHash: previousHash ?? null,
  };
});

export default component$(() => {
  const location = useLocation();
  const data = useRouteData();
  return <RoutesView publicApiKey={location.params.publicApiKey} data={data.value} />;
});

export interface RoutesViewData {
  routes: RouteOverview[];
  manifests: { hash: string; timestamp: string }[];
  selectedHash: string | null;
  previousHash: string | null;
}

export const RoutesView = component$<{
  publicApiKey: string;
  data: RoutesViewData;
}>(({ publicApiKey, data }) => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div class="font-editorial-ui text-editorial-primary">
      <header class="flex flex-col gap-editorial-5 border-b border-editorial-border pb-editorial-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p class="text-editorial-11 font-semibold tracking-[0.04em] text-editorial-muted uppercase">
            Routes
          </p>
          <h1 class="mt-editorial-2 text-editorial-44 font-bold leading-[1.1] tracking-[-0.035em]">
            Route timelines
          </h1>
          <p class="mt-editorial-2 text-editorial-14 text-editorial-secondary">
            Compare when symbols execute on each route in the selected and previous manifests.
          </p>
        </div>
        {data.manifests.length ? (
          <SelectField
            key={data.selectedHash}
            id="route-manifest"
            label="Manifest"
            value={data.selectedHash ?? undefined}
            autocomplete="off"
            class="w-full min-w-64 font-editorial-mono md:w-auto"
            onChange$={(_, select) => {
              if (select.value === data.selectedHash) {
                return;
              }
              navigate(`${location.url.pathname}?manifest=${encodeURIComponent(select.value)}`, {
                forceReload: true,
              });
            }}
          >
            {data.manifests.map((manifest, index) => (
              <option
                key={manifest.hash}
                value={manifest.hash}
                selected={manifest.hash === data.selectedHash ? true : undefined}
              >
                {`${index === 0 ? 'Latest · ' : ''}${formatManifestDate(manifest.timestamp)} · ${manifest.hash.slice(0, 12)}`}
              </option>
            ))}
          </SelectField>
        ) : (
          <p class="text-editorial-12 text-editorial-muted">Waiting for manifest data</p>
        )}
      </header>

      <div class="flex flex-wrap items-baseline justify-between gap-editorial-4 py-editorial-6">
        <p class="text-editorial-14 text-editorial-secondary">
          <strong class="text-editorial-24 font-semibold text-editorial-primary">
            {data.routes.length}
          </strong>{' '}
          {data.routes.length === 1 ? 'route' : 'routes'} in the selected manifest
        </p>
        <div class="text-right text-editorial-12 text-editorial-muted">
          <p>P95 appears after {MIN_PERFORMANCE_SAMPLES} timeline samples per route.</p>
          {data.previousHash && (
            <p class="mt-editorial-1 font-editorial-mono">
              Compared with {data.previousHash.slice(0, 12)}
            </p>
          )}
        </div>
      </div>

      {data.routes.length ? (
        <div class="overflow-x-auto">
          <table class="w-full min-w-[760px] text-left text-editorial-12">
            <thead class="border-b border-editorial-border text-editorial-11 tracking-[0.04em] text-editorial-muted uppercase">
              <tr>
                <th class="py-editorial-3 pl-editorial-4 font-semibold">Route</th>
                <th class="py-editorial-3 font-semibold">P95 timeline</th>
                <th class="py-editorial-3 font-semibold">Change</th>
                <th class="py-editorial-3 text-right font-semibold">Samples</th>
                <th class="py-editorial-3 text-right font-semibold">Symbols</th>
                <th class="py-editorial-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.routes.map((route) => {
                const href = getRouteDetailsHref(
                  publicApiKey,
                  route.route,
                  data.selectedHash ?? undefined
                );
                return (
                  <tr
                    key={route.route}
                    class={[
                      'border-b border-l-4 border-b-editorial-border transition-colors hover:bg-editorial-subtle',
                      route.change !== null && route.change > 0
                        ? 'border-l-editorial-danger'
                        : route.change !== null && route.change < 0
                          ? 'border-l-editorial-success'
                          : 'border-l-transparent',
                    ]}
                  >
                    <th class="max-w-[420px] py-editorial-4 pl-editorial-4 font-normal">
                      <Link
                        href={href}
                        class="block truncate font-editorial-mono font-semibold text-editorial-link focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-editorial-accent"
                      >
                        {route.route}
                      </Link>
                    </th>
                    <td class="py-editorial-4 font-semibold">
                      {formatNullableDuration(route.p95)}
                    </td>
                    <td
                      class={[
                        'py-editorial-4 font-semibold',
                        route.change !== null && route.change > 0 && 'text-editorial-danger',
                        route.change !== null && route.change < 0 && 'text-editorial-success',
                      ]}
                    >
                      {formatChange(route.change)}
                    </td>
                    <td class="py-editorial-4 text-right text-editorial-secondary">
                      {route.samples.toLocaleString('en')}
                    </td>
                    <td class="py-editorial-4 text-right text-editorial-secondary">
                      {route.symbols.toLocaleString('en')}
                    </td>
                    <td class="py-editorial-4 text-right">
                      <Link
                        href={href}
                        class="font-semibold text-editorial-link hover:text-editorial-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-editorial-accent"
                      >
                        View details →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <section class="border-t border-editorial-border py-editorial-16">
          <h2 class="text-editorial-24 font-semibold">No route timelines yet</h2>
          <p class="mt-editorial-2 text-editorial-14 text-editorial-secondary">
            Routes will appear after the first symbol executions are recorded.
          </p>
        </section>
      )}
    </div>
  );
});

function formatNullableDuration(milliseconds: number | null): string {
  if (milliseconds === null) {
    return 'Collecting data';
  }
  return milliseconds >= 1000
    ? `${(milliseconds / 1000).toFixed(2)} s`
    : `${Math.round(milliseconds)} ms`;
}

function formatChange(change: number | null): string {
  return change === null
    ? '—'
    : `${change > 0 ? '↑ ' : change < 0 ? '↓ ' : ''}${Math.abs(change)}%`;
}
