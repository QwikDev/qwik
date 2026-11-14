import { component$ } from '@qwik.dev/core';
import { Form, routeLoader$, useLocation } from '@qwik.dev/router';

export const useReports = routeLoader$(({ url }) => {
  const reports = [
    { title: 'Release checklist', status: 'open' },
    { title: 'Archived release notes', status: 'closed' },
  ];
  const q = url.searchParams.get('q') ?? '';
  const scope = url.searchParams.get('scope') ?? '';
  return reports.filter(
    (report) =>
      report.title.toLowerCase().includes(q.toLowerCase()) &&
      (scope === '' || report.status === scope)
  );
});

export default component$(() => {
  const location = useLocation();
  const reports = useReports();
  return (
    <>
      <h1>Report search</h1>
      <output id="navigating">{String(location.isNavigating)}</output>
      <output id="shown">
        {`q=${location.url.searchParams.get('q') ?? ''};scope=${location.url.searchParams.get('scope') ?? ''}`}
      </output>
      <ul id="reports">
        {reports.value.map((report) => (
          <li key={report.title}>{report.title}</li>
        ))}
      </ul>
      <form id="native" method="get">
        <input type="hidden" name="q" value="release" />
        <input type="hidden" name="tag" value="a" />
        <input type="hidden" name="tag" value="b" />
        <button id="native-open" type="submit" name="scope" value="open">
          Open reports
        </button>
      </form>
      <Form id="enhanced">
        <input type="hidden" name="q" value="release" />
        <input type="hidden" name="tag" value="a" />
        <input type="hidden" name="tag" value="b" />
        <button id="enhanced-open" type="submit" name="scope" value="open">
          Open reports
        </button>
        <button id="enhanced-closed" type="submit" name="scope" value="closed">
          Closed reports
        </button>
        <button id="enhanced-all" type="submit">
          All reports
        </button>
      </Form>
      <Form id="hidden">
        <input type="hidden" name="q" value="release" />
        <input type="hidden" name="tag" value="a" />
        <input type="hidden" name="tag" value="b" />
        <input type="hidden" name="scope" value="open" />
        <button id="hidden-open" type="submit">
          Open reports
        </button>
      </Form>
    </>
  );
});
