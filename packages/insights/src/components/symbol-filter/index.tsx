import { useReportQuery } from '~/components/report-scope/use-report-query';
import { component$ } from '@qwik.dev/core';
import { useLocation } from '@qwik.dev/router';

export default component$<{ defaultSort?: string }>(({ defaultSort = 'samples' }) => {
  const location = useLocation();
  const reportQuery = useReportQuery();
  return (
    <form
      method="get"
      action={location.url.pathname}
      class="my-editorial-5 flex flex-wrap items-end gap-editorial-4"
    >
      {['manifest', 'baseline'].map(
        (name) =>
          reportQuery.has(name) && (
            <input key={name} type="hidden" name={name} value={reportQuery.get(name)!} />
          )
      )}
      <label class="flex flex-1 flex-col gap-editorial-2 text-editorial-12">
        Search symbols
        <input
          type="search"
          name="q"
          value={reportQuery.get('q') ?? ''}
          placeholder="Name, hash, or source path"
          class="min-w-0 rounded-editorial-md border border-editorial-border bg-editorial-surface px-editorial-3 py-editorial-2"
        />
      </label>
      <label class="flex flex-col gap-editorial-2 text-editorial-12">
        Sort by
        <select
          name="sort"
          value={reportQuery.get('sort') ?? defaultSort}
          class="rounded-editorial-md border border-editorial-border bg-editorial-surface px-editorial-3 py-editorial-2"
        >
          <option value="samples">Most observations</option>
          <option value="p95">Highest P95</option>
          <option value="name">Symbol name</option>
        </select>
      </label>
      <button class="rounded-editorial-md bg-editorial-accent px-editorial-4 py-editorial-2 text-editorial-12 text-editorial-on-accent">
        Apply filters
      </button>
    </form>
  );
});
