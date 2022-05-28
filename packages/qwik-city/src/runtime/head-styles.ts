import { useDocument } from '@builder.io/qwik';
import type { HeadStyles } from './types';

/**
 * @public
 */
 export const useHeadStyles = (meta: HeadStyles) => {
  setHeadStyles(useDocument(), meta);
}

/**
 * @public
 */
export const setHeadStyles = (doc: Document, styles: HeadStyles) => {
  if (doc && Array.isArray(styles)) {
    for (const s of styles) {
      try {
        if (s && typeof s === 'object') {
          let styleElm: HTMLStyleElement | null = null;

          if (s.uniqueId) {
            styleElm = doc.head.querySelector(`style[data-qwest="${s.uniqueId}"]`);
            if (styleElm) {
              styleElm.innerHTML = s.style;
              setStyleAttrs(styleElm, s.attributes);
              continue;
            }
          }

          styleElm = doc.createElement('style');
          styleElm.innerHTML = s.style;
          setStyleAttrs(styleElm, s.attributes);
          if (s.uniqueId) {
            styleElm.setAttribute('data-qwest', s.uniqueId);
          }
          doc.head.appendChild(styleElm);
        }
      } catch (e) {
        console.error(e);
      }
    }
  }
};

const setStyleAttrs = (styleElm: HTMLStyleElement, attrs?: { [attrName: string]: string }) => {
  if (attrs) {
    for (const attrName in attrs) {
      styleElm.setAttribute(attrName, attrs[attrName]);
    }
  }
};
