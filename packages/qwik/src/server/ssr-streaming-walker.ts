/**
 * @file Streaming walker that emits HTML from the SsrNode tree built in treeOnly mode.
 *
 *   The walker traverses the orderedChildren of each SsrNode in document order, emitting HTML for
 *   elements (open tag + attrs + children + close tag), text (pre-escaped), raw HTML, and comments.
 *   Virtual nodes (fragments, components, projections) produce no HTML — only their children are
 *   emitted.
 */

import {
  SsrNodeKind,
  SSR_ATTR_HTML,
  isSsrContentChild,
  type SsrChild,
  type SsrContentChild,
} from './ssr-node';
import type { ISsrNode, StreamWriter, ValueOrPromise } from './qwik-types';
import { isSelfClosingTag } from './tag-nesting';
import { LT, GT, CLOSE_TAG } from './qwik-copy';
import { maybeThen } from './qwik-copy';

interface SsrStreamingWalkerOptions {
  writer: StreamWriter;
  /**
   * Node before whose close tag a callback should be invoked. Used for emitting container data
   * inside </body> or the container element.
   */
  containerDataNode?: ISsrNode | null;
  /** Callback invoked before the containerDataNode's close tag. May be async. */
  onBeforeContainerClose?: () => ValueOrPromise<void>;
}

export class SsrStreamingWalker {
  private writer: StreamWriter;
  private containerDataNode: ISsrNode | null;
  private onBeforeContainerClose: (() => ValueOrPromise<void>) | null;

  constructor(options: SsrStreamingWalkerOptions) {
    this.writer = options.writer;
    this.containerDataNode = options.containerDataNode ?? null;
    this.onBeforeContainerClose = options.onBeforeContainerClose ?? null;
  }

  /** Emit all HTML for the given root node (the container element). */
  emitTree(root: ISsrNode): ValueOrPromise<void> {
    return this.emitNode(root);
  }

  private write(text: string): void {
    this.writer.write(text);
  }

  private emitNode(node: ISsrNode | SsrChild): ValueOrPromise<void> {
    if (isSsrContentChild(node)) {
      this.emitContentChild(node);
      return;
    }

    const ssrNode = node as ISsrNode;
    switch ((ssrNode as any).nodeKind) {
      case SsrNodeKind.Element:
        return this.emitElement(ssrNode);
      case SsrNodeKind.Virtual:
      case SsrNodeKind.Component:
      case SsrNodeKind.Projection:
        // Virtual nodes produce no HTML — just emit their children
        return this.emitChildren(ssrNode);
      default:
        // Unknown node kind — emit children as fallback
        return this.emitChildren(ssrNode);
    }
  }

  private emitElement(node: ISsrNode): ValueOrPromise<void> {
    const tagName = (node as any).tagName as string;
    const attrHtml = node.getProp(SSR_ATTR_HTML) as string | null;

    // Opening tag
    this.write(LT);
    this.write(tagName);
    if (attrHtml) {
      this.write(attrHtml);
    }
    this.write(GT);

    // Children
    return maybeThen(this.emitChildren(node), () => {
      // Before close tag callback (for container data emission)
      if (node === this.containerDataNode && this.onBeforeContainerClose) {
        return maybeThen(this.onBeforeContainerClose(), () => {
          this.emitCloseTag(tagName);
        });
      }
      this.emitCloseTag(tagName);
    });
  }

  private emitCloseTag(tagName: string): void {
    if (!isSelfClosingTag(tagName)) {
      this.write(CLOSE_TAG);
      this.write(tagName);
      this.write(GT);
    }
  }

  private emitContentChild(child: SsrContentChild): void {
    switch (child.kind) {
      case SsrNodeKind.Text:
        this.write(child.content);
        break;
      case SsrNodeKind.RawHtml:
        this.write(child.content);
        break;
      case SsrNodeKind.Comment:
        this.write('<!--');
        this.write(child.content);
        this.write('-->');
        break;
    }
  }

  private emitChildren(node: ISsrNode): ValueOrPromise<void> {
    const children = (node as any).orderedChildren as SsrChild[] | null;
    if (!children || children.length === 0) {
      return;
    }
    let result: ValueOrPromise<void>;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (result) {
        result = maybeThen(result, () => this.emitNode(child));
      } else {
        result = this.emitNode(child);
      }
    }
    return result!;
  }
}
