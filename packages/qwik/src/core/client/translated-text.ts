/**
 * Page translators (Google Translate) replace every text node with a `<font>` wrapper and keep the
 * original node detached. This tracks which DOM node stands in for the node of a text vnode.
 */
import { Q_PROPS_SEPARATOR } from '../shared/utils/markers';
import { fastGetAttribute, fastNodeName } from './vnode-utils';

type TranslatedGlobal = typeof globalThis & {
  /** Shared by core and the preloader, which starts tracking before core loads. */
  qTranslated?: {
    /** Node of a text vnode -> the DOM node that stands in for it. */
    standIns?: WeakMap<Node, Element | Text>;
    /** Stand-in -> node of the text vnode it stands in for. */
    textNodes?: WeakMap<Node, Text>;
    /** Wrapper -> the text it replaced, when the swap was seen. */
    originalTexts?: WeakMap<Node, string>;
    /**
     * Text nodes Qwik created for a stand-in; the translator never held them, so they are safe to
     * write.
     */
    ownTextNodes?: WeakSet<Node>;
    /** What the observer runs: the preloader's capture, until core replaces it. */
    track?: (records: MutationRecord[]) => void;
  };
};

const translated = ((globalThis as TranslatedGlobal).qTranslated ||= {});

export const isTranslatedText = (node: Node | null): node is Element =>
  !!node &&
  fastNodeName(node as Element) === 'FONT' &&
  fastGetAttribute(node as Element, Q_PROPS_SEPARATOR) === null &&
  !!fastGetAttribute(node as Element, 'style')?.includes('vertical-align: inherit');

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
    // Linking creates both maps, so a stand-in means both exist.
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
export const createTranslatedTextNode = (standIn: Element | Text): Text => {
  const textNode = standIn.ownerDocument.createTextNode(standIn.textContent!);
  (translated.ownTextNodes ||= new WeakSet()).add(textNode);
  return linkTranslatedText(textNode, standIn);
};

/**
 * Whether the translator holds the text node. It restores its own saved text into such a node, so a
 * new text has to go into a new node.
 */
export const isTranslatorTextNode = (textNode: Node): boolean =>
  !!translated.standIns?.has(textNode) && !translated.ownTextNodes?.has(textNode);

/** The text node that vnodes use for a translated wrapper found in the DOM. */
export const getTranslatedTextNode = (wrapper: Element): Text =>
  translated.textNodes?.get(wrapper) || createTranslatedTextNode(wrapper);

type TextSwapRecord = Pick<MutationRecord, 'removedNodes' | 'previousSibling'>;

/**
 * Remembers the text node that a new `<font>` replaced: the translator inserts its wrapper in front
 * of the text node and then removes that node. Kept loose because this is all the preloader
 * carries; core checks that the `<font>` is a wrapper before it uses the text.
 *
 * @returns Whether the text was not known yet.
 */
const captureOriginalText = (removed: Node | undefined, wrapper: Node | null): boolean => {
  if (
    removed?.nodeType !== 3 ||
    wrapper?.nodeName !== 'FONT' ||
    // A text node that is removed after a known wrapper is not what the wrapper replaced.
    translated.originalTexts?.has(wrapper)
  ) {
    return false;
  }
  (translated.originalTexts ||= new WeakMap()).set(wrapper, removed.nodeValue!);
  return true;
};

/** All the preloader runs: without the original text a translated sentence can't be split. */
export const captureOriginalTexts = (records: TextSwapRecord[]): void => {
  for (let i = 0; i < records.length; i++) {
    captureOriginalText(records[i].removedNodes[0], records[i].previousSibling);
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
    if (
      isTranslatedText(previous) &&
      !translated.textNodes?.has(previous) &&
      captureOriginalText(removed, previous)
    ) {
      // The translator now holds the removed node, even if Qwik created it.
      translated.ownTextNodes?.delete(removed);
      linkTranslatedText(translated.textNodes?.get(removed) || (removed as Text), previous);
      continue;
    }
    const textNode = translated.textNodes?.get(removed);
    if (textNode) {
      // Show original: the translator puts its own text node back in front of the wrapper.
      unlinkTranslatedText(textNode);
      if (previous && previous !== textNode && previous.nodeType === 3) {
        linkTranslatedText(textNode, previous as Text);
        // The vnodes still hold the exact texts if the wrapper's original was recorded.
        const originalText = translated.originalTexts?.get(removed);
        if (originalText !== undefined) {
          translated.originalTexts!.set(previous, originalText);
        }
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
  const isObserved = !!translated.track;
  translated.track = track || translated.track || captureOriginalTexts;
  if (isObserved || typeof MutationObserver === 'undefined') {
    return;
  }
  const html = document.documentElement;
  let isTracking = false;
  const startTracking = () => {
    if (html.className.includes('translated-')) {
      isTracking = true;
      observer.observe(document, { childList: true, subtree: true });
    }
  };
  const observer = new MutationObserver((records) =>
    isTracking ? translated.track!(records) : startTracking()
  );
  observer.observe(html, { attributeFilter: ['class'] });
  startTracking();
};
