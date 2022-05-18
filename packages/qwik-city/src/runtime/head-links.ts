import type { HeadLinks } from './types';

/**
 * @public
 */
export const setHeadLinks = (doc: Document, links: HeadLinks) => {
  if (doc && Array.isArray(links)) {
    for (const link of links) {
      try {
        if (link && typeof link === 'object') {
          let attrs = Object.entries(link);
          if (attrs.length > 0) {
            if (link.rel === 'canonical') {
              link.href = new URL(link.href! || '/', doc.defaultView!.location.href).href;
              attrs = Object.entries(link);
              setLink(doc, attrs);
            } else {
              ensureLink(doc, attrs);
            }
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
  }
};

const setLink = (doc: Document, attrs: [string, string][]) => {
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

const ensureLink = (doc: Document, attrs: [string, string][]) => {
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

const createLink = (doc: Document, attrs: [string, string][]) => {
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
