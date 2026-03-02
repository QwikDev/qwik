import { component$ } from '@qwik.dev/core';
import { routeLoader$, useLocation } from '@qwik.dev/router';
import { RoutesIcon } from '~/components/icons/routes';
import { getDB } from '~/db';
import { dbGetManifestHashes } from '~/db/sql-manifest';
import { getRouteNames } from '~/db/sql-routes';

export const useRouteData = routeLoader$(async ({ params }) => {
  const db = getDB();
  const publicApiKey = params.publicApiKey;
  const manifestHashes = await dbGetManifestHashes(db, publicApiKey);
  const routes = await getRouteNames(db, publicApiKey, manifestHashes);
  return routes;
});

export default component$(() => {
  const location = useLocation();
  const routesData = useRouteData();
  const baseLink = `/app/${location.params.publicApiKey}/routes/`;
  return (
    <div>
      <h1 class="h3">
        <RoutesIcon />
        Routes
      </h1>
      <table class="w-full text-sm text-left">
        <thead class="text-xs text-slate-700 uppercase">
          <tr class="border-b border-slate-200">
            <th scope="col" class="px-6 py-3 bg-slate-50">
              Path
            </th>
            <th scope="col" class="px-6 py-3  bg-slate-50">
              Action
            </th>
          </tr>
        </thead>
        <tbody>
          {routesData.value.map((route) => (
            <tr key={route.route} class="border-b border-slate-200 text-xs">
              <th scope="col" class="px-6 py-3">
                <code>{route.route}</code>
              </th>
              <td scope="col" class="px-6 py-3 w-32">
                <a href={baseLink + route.route + '/'}>View details</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
