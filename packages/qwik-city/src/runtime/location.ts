import { useDocument } from '@builder.io/qwik';
import { createBrowserHistory } from 'history';
import { getDocument } from './utils';

/**
 * @public
 */
export const getLocation = (doc: Document) => {
  const history = getDocumentHistory(doc);
  const loc = history.location;
  const win = doc.defaultView!;
  const url = new URL(loc.pathname + loc.search + loc.hash, win.location.origin);
  return {
    get href() {
      return url.href;
    },
    get pathname() {
      return url.pathname;
    },
    get search() {
      return url.search;
    },
    get searchParams() {
      return url.searchParams;
    },
    get hash() {
      return url.hash;
    },
    get origin() {
      return url.origin;
    },
    listen(listener: any) {
      return history.listen(listener);
    },
  };
};

/**
 * @public
 */
export const useLocation = () => {
  return getLocation(useDocument());
};

/**
 * @public
 */
export const useNavigate = (hostElm: any) => {
  const doc = getDocument(hostElm);
  const history = getDocumentHistory(doc);
  return {
    back() {
      history.back();
    },
    forward() {
      history.forward();
    },
    navigate(to: string, opts: { replace?: boolean }) {
      if (opts?.replace) {
        history.replace(to);
      } else {
        history.push(to);
      }
    },
  };
};

const DOC_HISTORY = Symbol();

export const getDocumentHistory = (doc: any) => {
  if (!doc[DOC_HISTORY]) {
    doc[DOC_HISTORY] = createBrowserHistory({ window: doc.defaultView });
  }
  return doc[DOC_HISTORY]!;
};
