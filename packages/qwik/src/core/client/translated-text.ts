/**
 * Page translators (Google Translate) replace every text node with a `<font>` wrapper and keep the
 * original node detached. This tracks which DOM node stands in for the node of a text vnode.
 */
import { Q_PROPS_SEPARATOR } from '../shared/utils/markers';

/** Node of a text vnode -> the DOM node that stands in for it. */
let standIns: WeakMap<Node, Element | Text> | undefined;
/** Stand-in -> node of the text vnode it stands in for. */
let textNodes: WeakMap<Node, Text> | undefined;

export const isTranslatedText = (node: Node | null): node is Element =>
  !!node &&
  node.nodeName === 'FONT' &&
  !(node as Element).hasAttribute(Q_PROPS_SEPARATOR) &&
  !!(node as Element).getAttribute('style')?.includes('vertical-align: inherit');

export const getTranslatedStandIn = (textNode: Node): Element | Text | undefined =>
  standIns?.get(textNode);

/** The DOM node to operate on for a node held by a vnode. */
export const getDomNode = <T extends Node>(node: T): T | Element | Text =>
  standIns?.get(node) || node;

export const unlinkTranslatedText = (textNode: Node): Element | Text | undefined => {
  const standIn = standIns?.get(textNode);
  if (standIn) {
    standIns!.delete(textNode);
    if (textNodes!.get(standIn) === textNode) {
      textNodes!.delete(standIn);
    }
  }
  return standIn;
};

const linkTranslatedText = (textNode: Text, standIn: Element | Text): Text => {
  unlinkTranslatedText(textNode);
  (standIns ||= new WeakMap()).set(textNode, standIn);
  (textNodes ||= new WeakMap()).set(standIn, textNode);
  return textNode;
};

/** A new text node for a vnode to use in place of the stand-in, holding the stand-in's text. */
export const createTranslatedTextNode = (standIn: Element | Text): Text =>
  linkTranslatedText(standIn.ownerDocument.createTextNode(standIn.textContent!), standIn);

/** The text node that vnodes use for a translated wrapper found in the DOM. */
export const getTranslatedTextNode = (wrapper: Element): Text =>
  textNodes?.get(wrapper) || createTranslatedTextNode(wrapper);

/** Follows the text nodes that a translator swaps, as reported by a `MutationObserver`. */
export const trackTranslatedText = (
  records: Pick<MutationRecord, 'removedNodes' | 'previousSibling'>[]
): void => {
  for (let i = 0; i < records.length; i++) {
    const removed = records[i].removedNodes[0];
    const previous = records[i].previousSibling;
    if (!removed) {
      continue;
    }
    if (removed.nodeType === 3 && isTranslatedText(previous)) {
      // Translated: the wrapper is inserted in front of the text node it replaces.
      linkTranslatedText(textNodes?.get(removed) || (removed as Text), previous);
      continue;
    }
    const textNode = textNodes?.get(removed);
    if (textNode) {
      // Show original: the translator puts its own text node back in front of the wrapper.
      unlinkTranslatedText(textNode);
      if (previous && previous !== textNode && previous.nodeType === 3) {
        linkTranslatedText(textNode, previous as Text);
      }
    }
  }
};

const observedDocuments = new WeakSet<Document>();

/** Tracks translations once the translator marks `<html>`, which it does before replacing text. */
export const observeTranslatedText = (document: Document): void => {
  if (typeof MutationObserver === 'undefined' || observedDocuments.has(document)) {
    return;
  }
  observedDocuments.add(document);
  const html = document.documentElement;
  const markObserver = new MutationObserver(() => observeWhenTranslated());
  const observeWhenTranslated = () => {
    if (html.className.includes('translated-')) {
      markObserver.disconnect();
      new MutationObserver(trackTranslatedText).observe(document, {
        childList: true,
        subtree: true,
      });
    }
  };
  markObserver.observe(html, { attributeFilter: ['class'] });
  observeWhenTranslated();
};
