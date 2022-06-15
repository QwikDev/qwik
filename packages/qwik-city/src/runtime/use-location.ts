import { useDocument } from '@builder.io/qwik';

/**
 * @public
 */
export const useLocation = () => {
  const doc = useDocument();
  const loc = doc.defaultView!.location;
  const url = new URL(loc.pathname + loc.search + loc.hash, loc.origin);

  return {
    href: url.href,
    pathname: url.pathname,
    search: url.search,
    searchParams: url.searchParams,
    hash: url.hash,
    origin: url.origin,
  };
};
