import { component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import { getDB } from '~/db';
import { getAppInfo, getEdgeCount } from '~/db/query';

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
  return <div>App: {data.value.app.name}</div>;
});
