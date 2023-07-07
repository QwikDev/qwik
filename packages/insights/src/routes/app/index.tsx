import { applicationTable, getDB } from '~/db';

import AppCard from '~/components/app-card';
import Container from '~/components/container';
import Layout from '~/components/layout';
import { component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import styles from './styles.module.css';

export const useApps = routeLoader$(async () => {
  const db = getDB();
  return await db.select().from(applicationTable).orderBy(applicationTable.name).all();
});

export default component$(() => {
  const apps = useApps();
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
