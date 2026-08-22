import { component$, useComputed$, useSignal } from '@qwik.dev/core';
import { routeLoader$, type DocumentHead } from '@qwik.dev/router';
import { inArray } from 'drizzle-orm';
import ApplicationRow from '~/components/application-row';
import { ButtonLink } from '~/components/button';
import Layout from '~/components/layout';
import { applicationTable, getDB, type ApplicationRow as Application } from '~/db';
import { dbGetLatestManifests } from '~/db/sql-manifest';
import { getInsightUser } from './layout';

export const head: DocumentHead = {
  title: 'Applications | Qwik Insights',
};

type ApplicationSummary = Application & {
  latestManifest: {
    hash: string;
    timestamp: Date;
  } | null;
};

export const useApps = routeLoader$<ApplicationSummary[]>(async ({ sharedMap }) => {
  const insightUser = getInsightUser(sharedMap);
  const db = getDB();
  let query = db.select().from(applicationTable).orderBy(applicationTable.name);

  if (insightUser.superUser) {
    // Superusers can inspect every application.
  } else if (insightUser.applicationPublicApiKeys.length) {
    query = query.where(
      inArray(applicationTable.publicApiKey, insightUser.applicationPublicApiKeys)
    ) as typeof query;
  } else {
    return [];
  }

  const applications = await query.limit(1000).all();
  const manifests = await dbGetLatestManifests(
    db,
    applications.map((application) => application.publicApiKey)
  );
  const latestManifestByApplication = new Map(
    manifests.flatMap((manifest) =>
      manifest.publicApiKey
        ? [[manifest.publicApiKey, { hash: manifest.hash, timestamp: manifest.timestamp }] as const]
        : []
    )
  );

  return applications
    .map((application) => ({
      ...application,
      latestManifest: latestManifestByApplication.get(application.publicApiKey) ?? null,
    }))
    .sort((a, b) => {
      const timestampDifference =
        (b.latestManifest?.timestamp.getTime() ?? 0) - (a.latestManifest?.timestamp.getTime() ?? 0);
      return timestampDifference || a.name.localeCompare(b.name);
    });
});

export default component$(() => {
  const apps = useApps();
  const filter = useSignal('');
  const filteredApps = useComputed$(() => {
    const query = filter.value.trim().toLowerCase();
    if (!query) {
      return apps.value;
    }

    return apps.value.filter(
      (app) =>
        app.name.toLowerCase().includes(query) ||
        app.description?.toLowerCase().includes(query) ||
        app.url?.toLowerCase().includes(query)
    );
  });
  const applicationCount = apps.value.length;

  return (
    <Layout>
      <div class="mx-auto max-w-editorial-shell px-editorial-6 py-editorial-12">
        <div class="grid gap-editorial-12 lg:grid-cols-[minmax(0,1fr)_var(--container-editorial-sidebar)] lg:gap-editorial-14">
          <section class="min-w-0" aria-labelledby="applications-title">
            <p class="text-editorial-11 font-semibold tracking-[0.02em] text-editorial-muted uppercase">
              Applications
            </p>
            <h1
              id="applications-title"
              class="mt-editorial-3 text-editorial-44 font-bold leading-[1.2] tracking-[-0.03em] text-editorial-primary"
            >
              Choose an application
            </h1>
            <p class="mt-editorial-1 text-editorial-14 leading-[1.45] text-editorial-secondary">
              Select the Qwik Insights application whose manifests and production data you want to
              inspect.
            </p>

            <div class="relative mt-editorial-10">
              <label class="sr-only" for="application-search">
                Search applications
              </label>
              <input
                id="application-search"
                type="search"
                value={filter.value}
                placeholder="Search by name or URL"
                class="h-12 rounded-editorial-md border border-editorial-border-strong bg-editorial-surface text-editorial-14 text-editorial-primary outline-none placeholder:text-editorial-muted focus:border-editorial-accent focus:ring-2 focus:ring-editorial-accent/15 sm:pr-[var(--container-editorial-manifest)]"
                onInput$={(_event, target) => {
                  filter.value = target.value;
                }}
              />
              <span class="pointer-events-none absolute top-1/2 right-editorial-5 hidden -translate-y-1/2 text-editorial-11 font-semibold text-editorial-secondary sm:block">
                Sort: recently updated
              </span>
            </div>

            <div class="mt-editorial-10 flex flex-col gap-editorial-5">
              {filteredApps.value.length ? (
                filteredApps.value.map((app) => (
                  <ApplicationRow
                    key={app.id}
                    href={`/app/${encodeURIComponent(app.publicApiKey)}/`}
                    latestManifestHash={app.latestManifest?.hash}
                    latestManifestTimestamp={app.latestManifest?.timestamp}
                    name={app.name}
                    url={app.url}
                  />
                ))
              ) : (
                <div class="rounded-editorial-lg border border-dashed border-editorial-border-strong bg-editorial-surface p-editorial-8">
                  <h2 class="text-editorial-20 font-semibold text-editorial-primary">
                    {applicationCount ? 'No matching applications' : 'No applications yet'}
                  </h2>
                  <p class="mt-editorial-2 text-editorial-14 text-editorial-secondary">
                    {applicationCount
                      ? 'Try a different name or URL.'
                      : 'Create your first application to start collecting manifests.'}
                  </p>
                </div>
              )}
            </div>
          </section>

          <aside class="min-w-0" aria-label="Application setup">
            <section class="lg:pl-editorial-10">
              <p class="text-editorial-11 font-semibold tracking-[0.02em] text-editorial-muted uppercase">
                Applications
              </p>
              <p class="mt-editorial-2 text-editorial-20 font-semibold text-editorial-primary">
                {applicationCount}
              </p>
              <p class="mt-editorial-1 text-editorial-14 text-editorial-secondary">
                {applicationCount === 1 ? 'application available' : 'applications available'}
              </p>
            </section>

            <div class="mt-editorial-14 border-t border-editorial-border pt-editorial-8 lg:border-t-0 lg:border-l lg:pl-editorial-8">
              <section>
                <p class="text-editorial-11 font-semibold tracking-[0.02em] text-editorial-muted uppercase">
                  New application
                </p>
                <h2 class="mt-editorial-3 max-w-editorial-sidebar text-editorial-24 font-semibold leading-[1.2] tracking-[-0.01em] text-editorial-primary">
                  Connect another project
                </h2>
                <p class="mt-editorial-3 max-w-editorial-sidebar text-editorial-14 leading-[1.35] text-editorial-secondary">
                  Create an application and start collecting manifests.
                </p>
                <ButtonLink href="/app/add/" theme="primary" class="mt-editorial-8">
                  Create application
                </ButtonLink>
              </section>
            </div>
          </aside>
        </div>
      </div>
    </Layout>
  );
});
