import { component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import { ErrorIcon } from '~/components/icons/error';
import { SlowIcon } from '~/components/icons/slow';
import { SymbolIcon } from '~/components/icons/symbol';
import { getDB } from '~/db';
import { getAppInfo, getEdgeCount } from '~/db/query';
import { AppLink } from '~/routes.config';

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
  return (
    <div>
      <h1>
        App: {data.value.app.name} (<code>{data.value.app.publicApiKey}</code>)
      </h1>
      <p>{data.value.app.description}</p>
      <span>Edge count: {data.value.symbolCount}</span>
      <ul>
        <li>
          <AppLink
            route="/app/[publicApiKey]/symbols/"
            param:publicApiKey={data.value.app.publicApiKey}
          >
            <SymbolIcon /> Symbols View
          </AppLink>
        </li>
        <li>
          <AppLink
            route="/app/[publicApiKey]/symbols/edge/"
            param:publicApiKey={data.value.app.publicApiKey}
          >
            <SymbolIcon /> Edge View
          </AppLink>
        </li>
        <li>
          <AppLink
            route="/app/[publicApiKey]/symbols/bundles/"
            param:publicApiKey={data.value.app.publicApiKey}
          >
            <SymbolIcon /> Bundles View
          </AppLink>
        </li>
        <li>
          <AppLink
            route="/app/[publicApiKey]/symbols/slow/"
            param:publicApiKey={data.value.app.publicApiKey}
          >
            <SlowIcon /> Slow Symbols View
          </AppLink>
        </li>
        <li>
          <AppLink
            route="/app/[publicApiKey]/errors/"
            param:publicApiKey={data.value.app.publicApiKey}
          >
            <ErrorIcon /> Errors View
          </AppLink>
        </li>
      </ul>
    </div>
  );
});
