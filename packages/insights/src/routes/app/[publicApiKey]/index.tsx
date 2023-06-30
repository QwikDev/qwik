import { component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import { eq } from 'drizzle-orm';
import { SymbolIcon } from '~/components/icons/symbol';
import { applicationTable, getDB } from '~/db';
import { AppLink } from '~/routes.config';

export const useApplication = routeLoader$(async ({ params }) => {
  const db = getDB();
  const app = await db
    .select()
    .from(applicationTable)
    .where(eq(applicationTable.publicApiKey, params.publicApiKey))
    .get();
  return app;
});

export default component$(() => {
  const app = useApplication();
  return (
    <div>
      <h1>
        App: {app.value.name} (<code>{app.value.publicApiKey}</code>)
      </h1>
      <p>{app.value.description}</p>
      <ul>
        <li>
          <AppLink route="/app/[publicApiKey]/symbols/" param:publicApiKey={app.value.publicApiKey}>
            <SymbolIcon /> Symbols View
          </AppLink>
        </li>
      </ul>
    </div>
  );
});
