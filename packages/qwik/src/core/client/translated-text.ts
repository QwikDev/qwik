/**
 * Page translators (Google Translate) replace every text node with a `<font>` wrapper and keep the
 * original node detached. This tracks which DOM node stands in for the node of a text vnode.
 */
import { Q_PROPS_SEPARATOR } from '../shared/utils/markers';

type TranslatedGlobal = typeof globalThis & {
  /** Shared by core and the preloader, which starts tracking before core loads. */
  qTranslated?: {
    /** Node of a text vnode -> the DOM node that stands in for it. */
    standIns?: WeakMap<Node, Element | Text>;
    /** Stand-in -> node of the text vnode it stands in for. */
    textNodes?: WeakMap<Node, Text>;
    /** Wrapper -> the text it replaced, when the swap was seen. */
    originalTexts?: WeakMap<Node, string>;
    observedDocuments?: WeakSet<Document>;
    /** What the observer runs: the preloader's capture, until core replaces it. */
    track?: (records: MutationRecord[]) => void;
  };
};

const translated = ((globalThis as TranslatedGlobal).qTranslated ||= {});

export const isTranslatedText = (node: Node | null): node is Element =>
  !!node &&
  node.nodeName === 'FONT' &&
  !(node as Element).hasAttribute(Q_PROPS_SEPARATOR) &&
  !!(node as Element).getAttribute('style')?.includes('vertical-align: inherit');

export const getTranslatedStandIn = (textNode: Node): Element | Text | undefined =>
  translated.standIns?.get(textNode);

/** The text a wrapper replaced, or `undefined` when it was translated before tracking started. */
export const getOriginalText = (wrapper: Node): string | undefined =>
  translated.originalTexts?.get(wrapper);

/** The DOM node to operate on for a node held by a vnode. */
export const getDomNode = <T extends Node>(node: T): T | Element | Text =>
  translated.standIns?.get(node) || node;

export const unlinkTranslatedText = (textNode: Node): Element | Text | undefined => {
  const standIn = translated.standIns?.get(textNode);
  if (standIn) {
    translated.standIns!.delete(textNode);
    if (translated.textNodes!.get(standIn) === textNode) {
      translated.textNodes!.delete(standIn);
    }
  }
  return standIn;
};

const linkTranslatedText = (textNode: Text, standIn: Element | Text): Text => {
  unlinkTranslatedText(textNode);
  (translated.standIns ||= new WeakMap()).set(textNode, standIn);
  (translated.textNodes ||= new WeakMap()).set(standIn, textNode);
  return textNode;
};

/** A new text node for a vnode to use in place of the stand-in, holding the stand-in's text. */
export const createTranslatedTextNode = (standIn: Element | Text): Text =>
  linkTranslatedText(standIn.ownerDocument.createTextNode(standIn.textContent!), standIn);

/** The text node that vnodes use for a translated wrapper found in the DOM. */
export const getTranslatedTextNode = (wrapper: Element): Text =>
  translated.textNodes?.get(wrapper) || createTranslatedTextNode(wrapper);

type TextSwapRecord = Pick<MutationRecord, 'removedNodes' | 'previousSibling'>;

/**
 * Remembers the text that a new wrapper replaced: the translator inserts the wrapper in front of
 * the text node and then removes that node.
 *
 * @returns Whether the record is such a swap.
 */
const captureOriginalText = (removed: Node, wrapper: Node | null): wrapper is Element => {
  if (
    removed.nodeType !== 3 ||
    !isTranslatedText(wrapper) ||
    // A text node that is removed after a known wrapper is not what the wrapper replaced.
    translated.originalTexts?.has(wrapper) ||
    translated.textNodes?.has(wrapper)
  ) {
    return false;
  }
  (translated.originalTexts ||= new WeakMap()).set(wrapper, removed.nodeValue!);
  return true;
};

/** All the preloader does: without the original text a translated sentence can't be split. */
const captureOriginalTexts = (records: TextSwapRecord[]): void => {
  for (let i = 0; i < records.length; i++) {
    const removed = records[i].removedNodes[0];
    if (removed) {
      captureOriginalText(removed, records[i].previousSibling);
    }
  }
};

/** Follows the text nodes that a translator swaps, as reported by a `MutationObserver`. */
export const trackTranslatedText = (records: TextSwapRecord[]): void => {
  for (let i = 0; i < records.length; i++) {
    const removed = records[i].removedNodes[0];
    const previous = records[i].previousSibling;
    if (!removed) {
      continue;
    }
    if (captureOriginalText(removed, previous)) {
      linkTranslatedText(translated.textNodes?.get(removed) || (removed as Text), previous);
      continue;
    }
    const textNode = translated.textNodes?.get(removed);
    if (textNode) {
      // Show original: the translator puts its own text node back in front of the wrapper.
      unlinkTranslatedText(textNode);
      if (previous && previous !== textNode && previous.nodeType === 3) {
        linkTranslatedText(textNode, previous as Text);
      }
    }
  }
};

/**
 * Tracks translations once the translator marks `<html>`, which it does before replacing text.
 *
 * @param track - Core passes its own tracking, which replaces the capture of the preloader.
 */
export const observeTranslatedText = (document: Document, track?: typeof trackTranslatedText) => {
  translated.track = track || translated.track || captureOriginalTexts;
  if (typeof MutationObserver === 'undefined' || translated.observedDocuments?.has(document)) {
    return;
  }
  (translated.observedDocuments ||= new WeakSet()).add(document);
  const html = document.documentElement;
  const markObserver = new MutationObserver(() => observeWhenTranslated());
  const observeWhenTranslated = () => {
    if (html.className.includes('translated-')) {
      markObserver.disconnect();
      new MutationObserver((records) => translated.track!(records)).observe(document, {
        childList: true,
        subtree: true,
      });
    }
  };
  markObserver.observe(html, { attributeFilter: ['class'] });
  observeWhenTranslated();
};
