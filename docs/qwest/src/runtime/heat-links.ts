import type { HeadLinks } from './types';
import { useHostElement } from '@builder.io/qwik';

export const setHeadLinks = (links: HeadLinks) => {
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
