import { getAppInfo, getEdgeCount } from '~/db/query';
import { routeLoader$, useLocation } from '@builder.io/qwik-city';

import AppCard from '~/components/app-card';
import { DashboardIcon } from '~/components/icons/dashboard';
import { component$ } from '@builder.io/qwik';
import { getDB } from '~/db';

export const useAppData = routeLoader$(async ({ params }) => {
  const db = getDB();
  const publicApiKey = params.publicApiKey;
  const [app, symbolCount] = await Promise.all([
    getAppInfo(db, publicApiKey),
    getEdgeCount(db, publicApiKey),
  ]);
  return { app, symbolCount };
});

export default component$(() => {
  const data = useAppData();
  const location = useLocation();

  return (
    <div>
      <h1 class="h3">
        <DashboardIcon />
        <span>Dashboard</span>
      </h1>
      <AppCard
        mode="show"
        title={data.value.app.name}
        publicApiKey={location.params.publicApiKey}
      />
    </div>
  );
});
