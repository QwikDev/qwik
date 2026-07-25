import { Slot, component$ } from '@qwik.dev/core';
import { useLocation, type RequestHandler } from '@qwik.dev/router';
import ApplicationNavigation from '~/components/application-navigation';
import Header from '~/components/header';
import { getInsightUser } from '../layout';

export const onRequest: RequestHandler = async ({ sharedMap, redirect, params }) => {
  const insightUser = getInsightUser(sharedMap);
  if (!insightUser.isAuthorizedForApp(params.publicApiKey)) {
    throw redirect(307, '/');
  }
};

export default component$(() => {
  const location = useLocation();
  const path = `/app/${location.params.publicApiKey}/`;

  return (
    <div
      class="grid min-h-screen bg-editorial-canvas font-editorial-ui text-editorial-primary"
      style={{
        gridTemplateColumns: 'var(--spacing-editorial-sidebar-expanded) minmax(0, 1fr)',
      }}
    >
      <ApplicationNavigation basePath={path} />
      <div class="min-w-0">
        <Header showBrand={false} />
        <main class="min-h-[calc(100vh-var(--spacing-editorial-header))] p-editorial-8">
          <Slot />
        </main>
      </div>
    </div>
  );
});
