import { component$ } from '@qwik.dev/core';
import { useLocation } from '@qwik.dev/router';
import { useReportScope } from '~/routes/app/[publicApiKey]/layout';
import SelectField from '~/components/select-field';
import Button from '~/components/button';
import { formatManifestDate } from '~/routes/app/[publicApiKey]/routes/route-performance';

export default component$(() => {
  const scope = useReportScope().value;
  const location = useLocation();
  if (location.url.pathname.endsWith('/edit/') || !scope.manifests.length) {
    return null;
  }
  return (
    <section
      aria-label="Report comparison"
      class="mb-editorial-8 border-b border-editorial-border pb-editorial-6"
    >
      <form
        method="get"
        action={location.url.pathname}
        class="grid items-end gap-editorial-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
      >
        <SelectField
          id="report-manifest"
          name="manifest"
          label="Selected build (UTC)"
          value={scope.selectedHash ?? ''}
          class="w-full min-w-0 max-w-full"
        >
          {scope.problem && (
            <option value="" selected>
              Choose a build
            </option>
          )}
          {scope.manifests.map((manifest, index) => (
            <option
              key={manifest.hash}
              value={manifest.hash}
              selected={manifest.hash === scope.selectedHash}
            >
              {`${index === 0 ? 'Latest · ' : ''}${formatManifestDate(manifest.timestamp)} · ${manifest.hash}`}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="report-baseline"
          name="baseline"
          label="Baseline (UTC)"
          value={scope.previousHash ?? 'none'}
          class="w-full min-w-0 max-w-full"
        >
          <option value="none" selected={!scope.previousHash}>
            No comparison
          </option>
          {scope.manifests.map((manifest) => (
            <option
              key={manifest.hash}
              value={manifest.hash}
              selected={manifest.hash === scope.previousHash}
            >
              {`${formatManifestDate(manifest.timestamp)} · ${manifest.hash}`}
            </option>
          ))}
        </SelectField>
        <Button type="submit" theme="secondary">
          Apply comparison
        </Button>
      </form>
      {scope.problem ? (
        <p role="alert" class="mt-editorial-3 text-editorial-12 text-editorial-danger">
          {scope.problem}
        </p>
      ) : (
        <p class="mt-editorial-3 text-editorial-12 text-editorial-secondary">
          Reports use the selected build. Comparisons use the baseline where available. Manifest
          history lists the latest 100 builds.
        </p>
      )}
    </section>
  );
});
