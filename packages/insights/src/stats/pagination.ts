export interface ResultsPage<T> {
  items: T[];
  page: number;
  pageCount: number;
  total: number;
}

export function paginateResults<T>(rows: T[], requestedPage: string | null): ResultsPage<T> {
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const parsedPage = Number(requestedPage);
  const page = Number.isInteger(parsedPage) ? Math.min(pageCount, Math.max(1, parsedPage)) : 1;
  const offset = (page - 1) * pageSize;
  return { items: rows.slice(offset, offset + pageSize), page, pageCount, total: rows.length };
}

export function getPageHref(url: URL, parameter: string, page: number): string {
  const destination = new URL(url);
  if (page === 1) {
    destination.searchParams.delete(parameter);
  } else {
    destination.searchParams.set(parameter, String(page));
  }
  return destination.pathname + destination.search + destination.hash;
}
