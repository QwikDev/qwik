import { type ApplicationRow, applicationTable, getDB } from '~/db';
import AppCard from '~/components/app-card';
import Container from '~/components/container';
import Layout from '~/components/layout';
import { type ReadonlySignal, component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';

export const useApps = routeLoader$<ApplicationRow[]>(async () => {
  const db = getDB();
  return await db.select().from(applicationTable).orderBy(applicationTable.name).all();
});

export default component$(() => {
  const apps: ReadonlySignal<ApplicationRow[]> = useApps();
  return (
    <Layout>
      <Container position="center" width="medium">
        <div class="grid grid-cols-2 gap-6 py-10">
          {/* existing apps */}
          {apps.value.map((app) => (
            <div class="flex-1" key={app.id}>
              <AppCard mode="show" title={app.name} publicApiKey={app.publicApiKey} />
            </div>
          ))}

          {/* create new app */}
          <div class="">
            <AppCard mode="create" title="Add new App" />
          </div>
          {/* link existing app */}
          <div class="">
            <AppCard mode="link" title="Add link to an existing App" />
          </div>
        </div>
      </Container>
    </Layout>
  );
});
