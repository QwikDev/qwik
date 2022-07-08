import { useContext, useDocument, useWatch$ } from '@builder.io/qwik';
import { ResponseContext } from './constants';

/**
 * @public
 */
export const useResponse = () => {
  const doc = useDocument();
  const rsp = useContext(ResponseContext);

  useWatch$((track) => {
    const status = track(rsp, 'status');
    const redirect = track(rsp, 'redirect');
    const cacheControl = track(rsp, 'cacheControl');

    const httpEquiv = { status, location: redirect, 'cache-control': cacheControl };

    for (const [key, value] of Object.entries(httpEquiv)) {
      const normalizedKey = key.toLocaleLowerCase();
      let meta = doc.head.querySelector(`meta[http-equiv="${normalizedKey}"]`);
      if (meta) {
        if (value) {
          meta.setAttribute('content', String(value));
        } else {
          meta.remove();
        }
      } else if (value) {
        meta = doc.createElement('meta');
        meta.setAttribute('http-equiv', normalizedKey);
        meta.setAttribute('content', String(value));
        doc.head.appendChild(meta);
      }
    }
  });

  return rsp;
};
