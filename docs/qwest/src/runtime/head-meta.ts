import type { MetaOptions } from './types';

/**
 * @public
 */
export const setHeadMeta = (elm: any, meta: MetaOptions) => {
  const doc: Document = elm && elm.ownerDocument;

  if (doc && meta && typeof meta === 'object') {
    const existingMeta = Array.from(doc.head.querySelectorAll('meta'))
      .map((el) => ({
        el,
        name: el.getAttribute('name') || el.getAttribute('property'),
        content: el.getAttribute('content'),
      }))
      .filter((m) => m.name);

    Object.entries(meta).map(([metaName, metaContent]) => {
      if (metaName === 'title') {
        if (typeof metaContent === 'string' && metaContent !== doc.title) {
          doc.title = metaContent;
        }
      } else {
        const meta = existingMeta.find((m) => m.name === metaName);
        if (meta) {
          if (metaContent == null || metaContent === false) {
            meta.el.remove();
          } else {
            if (meta.content !== metaContent) {
              meta.el.setAttribute('content', metaContent);
            }
          }
        } else if (metaContent != null && metaContent !== false) {
          const metaTag = doc.createElement('meta');
          metaTag.setAttribute(metaName.startsWith('og:') ? 'property' : 'name', metaName);
          metaTag.setAttribute('content', metaContent);
          doc.head.appendChild(metaTag);
        }
      }
    });
  }
};
