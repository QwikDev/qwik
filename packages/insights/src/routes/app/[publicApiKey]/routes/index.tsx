import { component$, type ReadonlySignal } from '@builder.io/qwik';
import { routeLoader$, useLocation } from '@builder.io/qwik-city';
import { getDB } from '~/db';
import { dbGetManifestHashes } from '~/db/sql-manifest';
import { getRouteNames, type RouteRow } from '~/db/sql-routes';
import { AppLink } from '~/routes.config';
import { heading, link } from '~/styles';

export const useRouteData = routeLoader$(async ({ params }) => {
  const db = getDB();
  const publicApiKey = params.publicApiKey;
  const manifestHashes = await dbGetManifestHashes(db, publicApiKey);
  const routes = await getRouteNames(db, publicApiKey, manifestHashes);
  return routes;
});

export default component$(() => {
  const location = useLocation();
  const routesData: ReadonlySignal<RouteRow[]> = useRouteData();
  return (
    <div>
      <h1 class={heading}>Routes</h1>
      <ul>
        {routesData.value.map((route) => (
          <li key={route.route}>
            <AppLink
              class={link}
              route="/app/[publicApiKey]/routes/[route]/"
              param:publicApiKey={location.params.publicApiKey}
              param:route={route.route}
            >
              <code>{route.route}</code>
            </AppLink>
          </li>
        ))}
      </ul>
    </div>
  );
});
