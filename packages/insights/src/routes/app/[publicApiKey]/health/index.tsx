import { useReportQuery } from '~/components/report-scope/use-report-query';
import { component$ } from '@qwik.dev/core';
import {
  Form,
  Link,
  routeAction$,
  routeLoader$,
  useLocation,
  z,
  zod$,
  type DocumentHead,
} from '@qwik.dev/router';
import Button from '~/components/button';
import PageHeader from '~/components/page-header';
import { getDB } from '~/db';
import { getIntegrationHealth, testSourceMapping } from '~/db/integration-health';
import { loadReportScope } from '~/db/report-scope';
import { getReportHref } from '~/report-scope';

export const head: DocumentHead = { title: 'Integration health | Qwik Insights' };

export const useHealth = routeLoader$(async ({ params, query }) => {
  const scope = await loadReportScope(getDB(), params.publicApiKey, query);
  return {
    ...(await getIntegrationHealth(getDB(), params.publicApiKey, scope.selectedHash)),
    manifestHash: scope.selectedHash,
  };
});

export const useTestSource = routeAction$(
  async ({ manifest }, { params }) => {
    return { ...(await testSourceMapping(getDB(), params.publicApiKey, manifest)), manifest };
  },
  zod$({ manifest: z.string().min(1).max(256) })
);

export default component$(() => {
  const health = useHealth().value;
  const location = useLocation();
  const reportQuery = useReportQuery();
  const sourceTest = useTestSource();
  const sourceResult =
    sourceTest.value?.manifest === health.manifestHash ? sourceTest.value : undefined;
  const base = `/app/${location.params.publicApiKey}/`;
  return (
    <div>
      <PageHeader
        report="health"
        eyebrow="Setup and data quality"
        title="Integration health"
        description="Check which parts of your Insights integration have recorded evidence."
      />
      <dl class="my-editorial-6 grid gap-editorial-5 md:grid-cols-2">
        <Check
          label="Build recorded"
          value={health.manifestHash ?? 'No build selected'}
          detail={
            health.firstSeen
              ? `First recorded: ${health.firstSeen} (UTC). This is not the last telemetry arrival.`
              : health.manifestHash
                ? 'This build is known from error telemetry. No manifest capture has been recorded.'
                : 'Choose a recorded build above. If none exist, deploy with Insights enabled and visit the application.'
          }
        />
        <Check
          label="Telemetry"
          value={`${health.observed} symbols · ${health.routes} routes`}
          detail="These counts cover the selected build. Arrival timestamps are not recorded, so current collection status is unknown."
        />
        <Check
          label="Source metadata coverage"
          value={
            health.observed
              ? `${health.mapped} / ${health.observed} observed symbols mapped`
              : 'No observed symbols to check'
          }
          detail={`${health.metadata} symbol definitions uploaded. If coverage is incomplete, check the manifest upload response and upload the selected build’s q-manifest.json again.`}
        />
        <Check
          label="GitHub source"
          value={
            sourceResult?.status === 'loaded'
              ? 'One source file verified'
              : health.source
                ? 'Configured · not yet verified'
                : 'Not configured'
          }
          detail={
            health.source
              ? `${health.source.repository} · ${health.source.revision}. This revision applies to every build; confirm it matches your selection.`
              : 'Connect a public repository in Application settings, including its source directory and revision.'
          }
        />
      </dl>
      <section class="border-t border-editorial-border py-editorial-6">
        <h2 class="text-editorial-20 font-semibold">Verify source mapping</h2>
        <p class="my-editorial-3 text-editorial-14 text-editorial-secondary">
          Test one symbol from the selected build against the saved repository settings. A
          successful fetch verifies that file is reachable; it does not prove the revision matches
          every symbol.
        </p>
        <Form action={sourceTest}>
          <input type="hidden" name="manifest" value={health.manifestHash ?? ''} />
          <Button
            type="submit"
            disabled={!health.manifestHash || !health.source || sourceTest.isRunning}
            theme="secondary"
          >
            {sourceTest.isRunning ? 'Testing source…' : 'Test saved source mapping'}
          </Button>
        </Form>
        {sourceResult && (
          <div role="status" class="mt-editorial-4 text-editorial-14">
            {sourceResult.status === 'loaded' ? (
              <p>
                Source file reached for <code>{sourceResult.symbol}</code>:{' '}
                <a class="text-editorial-link" href={sourceResult.originUrl}>
                  {sourceResult.origin}
                </a>{' '}
                at <code>{sourceResult.revision}</code>.
              </p>
            ) : (
              <p>
                Source check failed ({sourceResult.status}). Check the manifest metadata, public
                repository, revision, and source directory.
              </p>
            )}
          </div>
        )}
        <Link
          class="mt-editorial-4 inline-block text-editorial-12 font-semibold text-editorial-link"
          href={`${base}edit/`}
        >
          Configure source settings →
        </Link>
      </section>
      <section class="border-t border-editorial-border py-editorial-6">
        <h2 class="text-editorial-20 font-semibold">Complete the feedback loop</h2>
        <ol class="my-editorial-4 list-decimal space-y-editorial-3 pl-editorial-5 text-editorial-14">
          <li>
            Include <code>qwikInsights</code> from <code>@qwik.dev/core/insights/vite</code> in Vite
            with this application’s public key: <code>{location.params.publicApiKey}</code>. Set{' '}
            <code>outDir</code> to your client build output directory.
          </li>
          <li>
            Enable Insights in your Qwik Vite configuration:{' '}
            <code>{"qwikVite({ experimental: ['insights'] })"}</code>. This flag is required before
            rendering the Insights component.
          </li>
          <li>
            Render <code>&lt;Insights /&gt;</code> from <code>@qwik.dev/core/insights</code> in your
            root. Deploy a production build and exercise representative routes and interactions.
          </li>
          <li>
            Verify that the build uploads <code>q-manifest.json</code> and fetches{' '}
            <code>q-insights.json</code>. The dashboard cannot confirm whether your deployed bundle
            used that strategy; inspect your build logs and output.
          </li>
          <li>
            Investigate a symbol or route, make one optimization, deploy again, and compare it
            against the same baseline with sufficient observations.
          </li>
        </ol>
        <Link
          class="text-editorial-12 font-semibold text-editorial-link"
          href={getReportHref(base, reportQuery)}
        >
          Return to performance overview →
        </Link>
      </section>
    </div>
  );
});

function Check({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div class="min-w-0 rounded-editorial-md border border-editorial-border p-editorial-5">
      <dt class="text-editorial-11 uppercase text-editorial-muted">{label}</dt>
      <dd class="mt-editorial-2 break-words font-semibold">{value}</dd>
      <dd class="mt-editorial-3 text-editorial-12 text-editorial-secondary">{detail}</dd>
    </div>
  );
}
