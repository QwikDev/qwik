import ReportScope from '~/components/report-scope';
import { loadReportScope } from '~/db/report-scope';
import { Slot, component$ } from '@qwik.dev/core';
import { routeLoader$, useLocation, type RequestHandler } from '@qwik.dev/router';
import ApplicationNavigation from '~/components/application-navigation';
import Header from '~/components/header';
import { getDB } from '~/db';
import { getAppInfo } from '~/db/query';
import { getInsightUser } from '../layout';

export const onRequest: RequestHandler = async ({ sharedMap, redirect, params }) => {
  const insightUser = getInsightUser(sharedMap);
  if (!insightUser.isAuthorizedForApp(params.publicApiKey)) {
    throw redirect(307, '/');
  }
};

export const useReportScope = routeLoader$(async ({ params, query }) =>
  loadReportScope(getDB(), params.publicApiKey, query)
);

export const useApplication = routeLoader$(async ({ params }) =>
  getAppInfo(getDB(), params.publicApiKey)
);

export default component$(() => {
  const location = useLocation();
  const application = useApplication();
  const path = `/app/${location.params.publicApiKey}/`;

  return (
    <div
      class="grid min-h-screen bg-editorial-canvas font-editorial-ui text-editorial-primary"
      style={{
        gridTemplateColumns: 'var(--spacing-editorial-sidebar-expanded) minmax(0, 1fr)',
      }}
    >
      <ApplicationNavigation basePath={path} applicationName={application.value.name} />
      <div class="min-w-0">
        <Header showBrand={false} />
        <main class="min-h-[calc(100vh-var(--spacing-editorial-header))] p-editorial-8 mx-auto max-w-[1264px]">
          <ReportScope />
          <Slot />
        </main>
      </div>
    </div>
  );
});
