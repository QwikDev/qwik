import { useLocation } from '@qwik.dev/router';
import { getReportQuery } from '~/report-scope';
import { useReportScope } from '~/routes/app/[publicApiKey]/layout';

export function useReportQuery() {
  const location = useLocation();
  const scope = useReportScope();
  return getReportQuery(location.url.searchParams, scope.value);
}
