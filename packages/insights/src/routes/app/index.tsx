import { type ApplicationRow, applicationTable, getDB } from '~/db';
import AppCard from '~/components/app-card';
import Container from '~/components/container';
import Layout from '~/components/layout';
import { type ReadonlySignal, component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import styles from './styles.module.css';
import { getInsightUser } from './layout';
import { inArray } from 'drizzle-orm';

export const useApps = routeLoader$<ApplicationRow[]>(async ({ sharedMap }) => {
  const insightUser = getInsightUser(sharedMap);
  let query = getDB().select().from(applicationTable).orderBy(applicationTable.name);

  if (insightUser.superUser) {
    // Select everything
  } else if (insightUser.applicationPublicApiKeys.length) {
    query = query.where(
      inArray(applicationTable.publicApiKey, insightUser.applicationPublicApiKeys)
    );
  } else {
    // The user has nothing attached to it.
    return [];
  }
  return query.all();
});

export default component$(() => {
  const apps: ReadonlySignal<ApplicationRow[]> = useApps();
  return (
    <Layout>
      <Container position="center" width="medium">
        <div class={styles.wrapper}>
          {/* existing apps */}
          {apps.value.map((app) => (
            <AppCard mode="show" key={app.id} title={app.name} publicApiKey={app.publicApiKey} />
          ))}
          {/* create new app */}
          <AppCard mode="create" title="Add new App" />
        </div>
      </Container>
    </Layout>
  );
});
