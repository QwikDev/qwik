import { useReportQuery } from '~/components/report-scope/use-report-query';
import { component$ } from '@qwik.dev/core';
import { useLocation } from '@qwik.dev/router';
import Button, { ButtonLink } from '~/components/button';
import { getPageHref } from '~/stats/pagination';

export default component$<{ page: number; pageCount: number; parameter?: string }>(
  ({ page, pageCount, parameter = 'page' }) => {
    const location = useLocation();
    const reportQuery = useReportQuery();
    const reportUrl = new URL(location.url);
    reportUrl.search = reportQuery.toString();
    if (pageCount <= 1) {
      return null;
    }
    return (
      <nav
        aria-label="Report pages"
        class="my-editorial-6 flex items-center justify-end gap-editorial-6"
      >
        {page > 1 ? (
          <ButtonLink href={getPageHref(reportUrl, parameter, page - 1)} theme="secondary">
            ← Previous
          </ButtonLink>
        ) : (
          <Button disabled theme="secondary">
            ← Previous
          </Button>
        )}
        <span class="text-editorial-12 font-semibold whitespace-nowrap">
          Page {page} of {pageCount}
        </span>
        {page < pageCount ? (
          <ButtonLink href={getPageHref(reportUrl, parameter, page + 1)} theme="primary">
            Next →
          </ButtonLink>
        ) : (
          <Button disabled theme="primary">
            Next →
          </Button>
        )}
      </nav>
    );
  }
);
