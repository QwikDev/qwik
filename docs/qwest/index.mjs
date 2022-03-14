import { INDEXES, LAYOUTS, PAGES, INLINED_MODULES, BUILD_ID } from '@builder.io/qwest/build';
import { useHostElement } from '@builder.io/qwik';

const IS_CLIENT = typeof document !== 'undefined';

export const loadPage = async (opts) => {
  let mod = null;
  let pathname = opts.pathname.endsWith('/') ? opts.pathname + 'index' : opts.pathname;

  if (INLINED_MODULES) {
    // all page modules are inlined into the same bundle
    const pageImporter = PAGES[pathname];
    if (!pageImporter) {
      return null;
    }

    mod = await pageImporter();
  } else {
    // page modules are dynamically imported by the client
    try {
      // ./pages/guide/getting-started.js
      let pagePath = './pages' + pathname + '.js';
      if (IS_CLIENT) {
        pagePath += '?v=' + BUILD_ID;
      }

      mod = await import(/* @vite-ignore */ pagePath);
    } catch (e) {
      console.error(e);
      return null;
    }
  }
  if (!mod || !mod.default) {
    return null;
  }

  const layoutImporter = LAYOUTS[mod.layout] || LAYOUTS.default;
  if (!layoutImporter) {
    return null;
  }

  const layout = await layoutImporter();

  const meta = {};
  for (const k in mod) {
    if (k !== 'default') {
      meta[k] = mod[k];
    }
  }

  return {
    getContent: () => mod.default,
    getLayout: () => layout.default,
    getMetadata: () => meta,
  };
};

export const loadIndex = async (opts) => {
  let pathname = opts.pathname;

  for (let i = 0; i < 9; i++) {
    if (INDEXES[pathname]) {
      return INDEXES[pathname];
    }

    const parts = pathname.split('/');
    parts.pop();

    pathname = parts.join('/');
    if (pathname === '/') {
      break;
    }
  }

  return null;
};

export const setHeadMeta = (meta) => {
  const hostElm = useHostElement();
  const doc = hostElm && hostElm.ownerDocument;

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

export const setHeadLinks = (links) => {
  const hostElm = useHostElement();
  const doc = hostElm && hostElm.ownerDocument;

  if (doc && Array.isArray(links)) {
    for (const link of links) {
      if (link && typeof link === 'object') {
        const attrs = Object.entries(link);
        if (attrs.length > 0) {
          if (link.rel === 'canonical') {
            setLink(doc, attrs);
          } else {
            ensureLink(doc, attrs);
          }
        }
      }
    }
  }
};

const setLink = (doc, attrs) => {
  let qs = 'link';
  attrs.forEach(([attrName, attrValue]) => {
    if (typeof attrValue === 'string' || typeof attrValue === 'number' || attrValue === true) {
      qs += `[${attrName}]`;
    }
  });

  const linkElm = doc.head.querySelector(qs);
  if (linkElm) {
    attrs.forEach(([attrName, attrValue]) => {
      if (typeof attrValue === 'string' || typeof attrValue === 'number') {
        if (linkElm.getAttribute(attrName) !== String(attrValue)) {
          linkElm.setAttribute(attrName, attrValue);
        }
      } else if (attrValue === true) {
        if (linkElm.getAttribute(attrName) !== '') {
          linkElm.setAttribute(attrName, '');
        }
      } else {
        linkElm.removeAttribute(attrName);
      }
    });
  } else {
    createLink(doc, attrs);
  }
};

const ensureLink = (doc, attrs) => {
  let qs = 'link';
  attrs.forEach(([attrName, attrValue]) => {
    if (typeof attrValue === 'string' || typeof attrValue === 'number') {
      qs += `[${attrName}="${attrValue}"]`;
    } else if (attrValue === true) {
      qs += `[${attrName}]`;
    }
  });

  if (!doc.head.querySelector(qs)) {
    createLink(doc, attrs);
  }
};

const createLink = (doc, attrs) => {
  const linkElm = doc.createElement('link');
  attrs.forEach(([attrName, attrValue]) => {
    if (typeof attrValue === 'string' || typeof attrValue === 'number') {
      linkElm.setAttribute(attrName, attrValue);
    } else if (attrValue === true) {
      linkElm.setAttribute(attrName, '');
    }
  });
  doc.head.appendChild(linkElm);
};
