import { component$, useSignal, type ReadonlySignal, useComputed$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import { inArray } from 'drizzle-orm';
import AppCard from '~/components/app-card';
import Container from '~/components/container';
import Layout from '~/components/layout';
import { applicationTable, getDB, type ApplicationRow } from '~/db';
import { getInsightUser } from './layout';

export const useApps = routeLoader$<ApplicationRow[]>(async ({ sharedMap }) => {
  const insightUser = getInsightUser(sharedMap);
  let query = getDB().select().from(applicationTable).orderBy(applicationTable.name);

  if (insightUser.superUser) {
    // Select everything
  } else if (insightUser.applicationPublicApiKeys.length) {
    query = query.where(
      inArray(applicationTable.publicApiKey, insightUser.applicationPublicApiKeys)
    ) as typeof query;
  } else {
    // The user has nothing attached to it.
    return [];
  }
  return query.limit(1000).all();
});

export default component$(() => {
  const apps: ReadonlySignal<ApplicationRow[]> = useApps();
  const filter = useSignal('');
  const filteredApps = useComputed$(() => {
    return apps.value.filter(
      (app) =>
        app.name.toLowerCase().includes(filter.value) ||
        app.publicApiKey.toLowerCase().includes(filter.value) ||
        app.description?.toLowerCase().includes(filter.value) ||
        app.url?.toLowerCase().includes(filter.value)
    );
  });
  return (
    <Layout>
      <Container position="center" width="medium">
        <div class="pt-5">
          Filter:
          <input
            type="text"
            class="border border-gray-300 rounded-md px-4 py-2 w-1/2 ml-5"
            onInput$={(_e, target) => (filter.value = target.value.toLocaleLowerCase())}
          />
        </div>
        <div class="grid grid-cols-2 gap-6 py-10">
          {/* existing apps */}
          {filteredApps.value.map((app) => (
            <div class="flex-1" key={app.id}>
              <AppCard mode="show" title={app.name} publicApiKey={app.publicApiKey} />
            </div>
          ))}

          {/* create new app */}
          <div class="">
            <AppCard mode="create" title="Add new App" />
          </div>
        </div>
      </Container>
    </Layout>
  );
});
