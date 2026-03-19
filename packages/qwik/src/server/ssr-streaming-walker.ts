/**
 * @file Streaming walker that emits HTML from the SsrNode tree.
 *
 *   The walker traverses the orderedChildren of each SsrNode in document order, emitting HTML for
 *   elements (open tag + attrs + children + close tag), text (pre-escaped), raw HTML, and comments.
 *   Virtual nodes (fragments, components, projections) produce no HTML — only their children are
 *   emitted.
 *
 *   Element attributes are serialized from stored props (SSR_VAR_ATTRS / SSR_CONST_ATTRS) — no
 *   pre-computed HTML strings. The walker calls serializeAttribute() for each attr pair.
 *
 *   Suspense boundaries are handled specially: the walker emits fallback content wrapped in a
 *   placeholder div. The actual content is deferred for OoO (out-of-order) streaming.
 *
 *   Two emission modes:
 *
 *   - SsrStreamingWalker: recursive, emits entire tree at once (for toHTML and OoO chunks)
 *   - IncrementalEmitter: stack-based, can pause at dirty nodes and resume (for render() loop)
 */

import {
  SsrNodeKind,
  SSR_VAR_ATTRS,
  SSR_CONST_ATTRS,
  SSR_STYLE_SCOPED_ID,
  SSR_SUSPENSE_PLACEHOLDER_ID,
  SSR_SUSPENSE_CONTENT,
  isSsrContentChild,
  ssrNode_getSerializableAttrs,
  type SsrChild,
  type SsrContentChild,
  type SsrNode,
} from './ssr-node';
import { _vnode_getProp as vnode_getProp } from '@qwik.dev/core/internal';
import type { ISsrNode, StreamWriter, ValueOrPromise } from './qwik-types';
import {
  type VNodeData,
  vNodeData_incrementElementCount,
  vNodeData_addTextSize,
  vNodeData_openFragment,
  vNodeData_closeFragment,
  WRITE_ELEMENT_ATTRS,
  encodeAsAlphanumeric,
} from './vnode-data';
import { VNodeDataFlag } from './types';
import { isSelfClosingTag } from './tag-nesting';
import {
  LT,
  GT,
  CLOSE_TAG,
  VNodeFlags,
  SPACE,
  ATTR_EQUALS_QUOTE,
  QUOTE,
  Q_PROPS_SEPARATOR,
  EMPTY_ATTR,
  ChoreBits,
  QStyle,
  QScopedStyle,
  serializeAttribute,
  escapeHTML,
  maybeThen,
} from './qwik-copy';

/** Suspense boundary info passed from the container to the streaming walker. */
export interface SuspenseBoundaryInfo {
  node: ISsrNode;
  placeholderId: string;
}

export interface SsrStreamingWalkerOptions {
  writer: StreamWriter;
  /**
   * Node before whose close tag a callback should be invoked. Used for emitting container data
   * inside </body> or the container element.
   */
  containerDataNode?: ISsrNode | null;
  /** Callback invoked before the containerDataNode's close tag. May be async. */
  onBeforeContainerClose?: () => ValueOrPromise<void>;
  /** Suspense boundaries to handle during emission. */
  suspenseBoundaries?: SuspenseBoundaryInfo[];
}

/**
 * Recursive streaming walker. Emits entire tree at once. Used by toHTML path and OoO chunk
 * emission. Cannot pause at dirty nodes.
 */
export class SsrStreamingWalker {
  private writer: StreamWriter;
  private containerDataNode: ISsrNode | null;
  private onBeforeContainerClose: (() => ValueOrPromise<void>) | null;
  /** Set of Suspense boundary nodes for fast lookup. */
  private suspenseNodes: Set<ISsrNode> | null;
  /** Map from boundary node to placeholder ID. */
  private suspensePlaceholderIds: Map<ISsrNode, string> | null;
  /** Tracks emitted bytes for qwikLoader inline heuristic. */
  public size: number = 0;

  constructor(options: SsrStreamingWalkerOptions) {
    this.writer = options.writer;
    this.containerDataNode = options.containerDataNode ?? null;
    this.onBeforeContainerClose = options.onBeforeContainerClose ?? null;

    if (options.suspenseBoundaries && options.suspenseBoundaries.length > 0) {
      this.suspenseNodes = new Set(options.suspenseBoundaries.map((b) => b.node));
      this.suspensePlaceholderIds = new Map(
        options.suspenseBoundaries.map((b) => [b.node, b.placeholderId])
      );
    } else {
      this.suspenseNodes = null;
      this.suspensePlaceholderIds = null;
    }
  }

  /** Emit all HTML for the given root node (the container element). */
  emitTree(root: ISsrNode): ValueOrPromise<void> {
    return this.emitNode(root);
  }

  write(text: string): void {
    this.size += text.length;
    this.writer.write(text);
  }

  private emitNode(node: ISsrNode | SsrChild): ValueOrPromise<void> {
    if (isSsrContentChild(node)) {
      this.emitContentChild(node);
      return;
    }

    const ssrNode = node as ISsrNode;
    // Mark node as emitted so backpatching knows this node's attrs have been streamed
    ssrNode.flags |= VNodeFlags.OpenTagEmitted;
    switch ((ssrNode as any).nodeKind) {
      case SsrNodeKind.Element:
        return this.emitElement(ssrNode);
      case SsrNodeKind.Suspense:
        return this.emitSuspenseBoundary(ssrNode);
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
    const varAttrs = vnode_getProp(node, SSR_VAR_ATTRS, null) as Record<string, any> | null;
    const constAttrs = vnode_getProp(node, SSR_CONST_ATTRS, null) as Record<string, any> | null;
    const styleScopedId = vnode_getProp(node, SSR_STYLE_SCOPED_ID, null) as string | null;

    // Opening tag
    this.write(LT);
    this.write(tagName);

    // Var attrs
    emitAttrs(this, varAttrs, styleScopedId);

    // q: separator + key
    this.write(' ' + Q_PROPS_SEPARATOR);
    const key = (node as any).key;
    if (key !== null && key !== undefined) {
      this.write(`="${key}"`);
    } else if (import.meta.env.TEST) {
      this.write(EMPTY_ATTR);
    }

    // Const attrs
    emitAttrs(this, constAttrs, styleScopedId);

    this.write(GT);

    // Children
    return maybeThen(this.emitChildren(node), () => {
      // Before close tag callback (for container data emission)
      if (node === this.containerDataNode && this.onBeforeContainerClose) {
        return maybeThen(this.onBeforeContainerClose(), () => {
          emitCloseTag(this, tagName);
        });
      }
      emitCloseTag(this, tagName);
    });
  }

  /**
   * Emit a Suspense boundary. If the boundary has deferred children (is in the suspenseBoundaries
   * list), emit the fallback wrapped in a placeholder div. Otherwise emit the content node's
   * children inline (sub-cursor completed synchronously).
   */
  private emitSuspenseBoundary(node: ISsrNode): ValueOrPromise<void> {
    const isDeferred = this.suspenseNodes?.has(node);

    if (isDeferred) {
      // Emit fallback wrapped in a placeholder div for OoO replacement
      const placeholderId =
        this.suspensePlaceholderIds?.get(node) ||
        vnode_getProp(node, SSR_SUSPENSE_PLACEHOLDER_ID, null);
      this.write(`<div id="${placeholderId}">`);
      // Emit fallback content (the boundary's orderedChildren contain the fallback)
      return maybeThen(this.emitChildren(node), () => {
        this.write('</div>');
      });
    }

    // Not deferred — emit content inline (sub-cursor completed synchronously).
    // The content node holds children built by the sub-cursor.
    const contentNode = vnode_getProp(node, SSR_SUSPENSE_CONTENT, null) as ISsrNode | null;
    if (contentNode) {
      return this.emitChildren(contentNode);
    }
    // No content node — fall back to emitting boundary's own children (fallback)
    return this.emitChildren(node);
  }

  private emitContentChild(child: SsrContentChild): void {
    emitContentChild(this, child);
  }

  emitChildren(node: ISsrNode): ValueOrPromise<void> {
    const children = (node as any).orderedChildren as SsrChild[] | null;
    if (!children || children.length === 0) {
      return;
    }
    let result: ValueOrPromise<void> = undefined;
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

// ─── Shared helpers used by both SsrStreamingWalker and IncrementalEmitter ───

/** Serialize and emit attrs from a processed attrs map. */
function emitAttrs(
  target: { write(text: string): void },
  attrs: Record<string, any> | null,
  styleScopedId: string | null
): void {
  if (!attrs) {
    return;
  }
  for (const key in attrs) {
    const serializedValue = serializeAttribute(key, attrs[key], styleScopedId);
    if (serializedValue != null && serializedValue !== false) {
      target.write(SPACE);
      target.write(key);
      if (serializedValue !== true) {
        target.write(ATTR_EQUALS_QUOTE);
        target.write(escapeHTML(String(serializedValue)));
        target.write(QUOTE);
      }
    }
  }
}

function emitCloseTag(target: { write(text: string): void }, tagName: string): void {
  if (!isSelfClosingTag(tagName)) {
    target.write(CLOSE_TAG);
    target.write(tagName);
    target.write(GT);
  }
}

function emitContentChild(target: { write(text: string): void }, child: SsrContentChild): void {
  switch (child.kind) {
    case SsrNodeKind.Text:
      target.write(child.content);
      break;
    case SsrNodeKind.RawHtml:
      target.write(child.content);
      break;
    case SsrNodeKind.Comment:
      target.write('<!--');
      target.write(child.content);
      target.write('-->');
      break;
  }
}

// ─── Incremental Emitter ─────────────────────────────────────────────────────

/** Result of an incremental emission step. */
export const enum EmitResult {
  /** All nodes emitted — streaming is complete. */
  COMPLETE = 0,
  /** Hit a dirty node — need more cursor processing before resuming. */
  BLOCKED_DIRTY = 1,
  /** Reached container data point — caller must run async callback before resuming. */
  NEEDS_CALLBACK = 2,
}

/** Phase of emission for a stack frame. */
const enum EmitPhase {
  OPEN = 0,
  CHILDREN = 1,
  CLOSE = 2,
}

/** Stack frame for incremental tree emission. */
interface EmitFrame {
  node: ISsrNode;
  /** Cached orderedChildren (populated on CHILDREN phase entry). */
  children: SsrChild[] | null;
  /** Index of next child to process. */
  childIdx: number;
  /** Current phase. */
  phase: EmitPhase;
  /** Cached tag name for element nodes. */
  tagName: string | null;
  /** Whether this is a deferred Suspense boundary (emit fallback in placeholder div). */
  isDeferred: boolean;
}

/**
 * VNodeData build state for an ancestor element. Pushed when entering an element, popped when
 * leaving. Virtual nodes write to the top state (their nearest ancestor element's vNodeData).
 */
interface VNodeDataBuildState {
  /** VNodeData being built for this element. */
  vd: VNodeData;
  /**
   * Child path for virtual node ID computation. Each entry tracks the child index within a nesting
   * level. Mirrors the stack in vNodeData_createSsrNodeReference.
   */
  path: number[];
  /** Depth-first element index of this element (for ID computation). */
  depthFirstIdx: number;
}

function getFirstBlockedChild(node: ISsrNode): ISsrNode | null {
  const dirtyChildren = (node as any).dirtyChildren as ISsrNode[] | null;
  if (!dirtyChildren || dirtyChildren.length === 0) {
    return null;
  }

  for (let i = 0; i < dirtyChildren.length; i++) {
    let candidate: ISsrNode | null = dirtyChildren[i];
    if (!((candidate as any).dirty & ChoreBits.DIRTY_MASK)) {
      continue;
    }

    while (candidate.parent !== node && candidate.slotParent !== node) {
      candidate = (candidate.parent || candidate.slotParent) as ISsrNode | null;
      if (!candidate) {
        break;
      }
    }

    if (candidate && (candidate.parent === node || candidate.slotParent === node)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Incremental tree emitter. Uses an explicit stack so it can pause at dirty nodes and resume later.
 * Used by SSRContainer.render() in the interleaving loop.
 *
 * When vNodeDatas is provided, the emitter builds vNodeData from the SsrNode tree in document
 * order, assigning IDs and vnodeData references to each SsrNode during emission. This decouples
 * vNodeData from tree-building order, enabling deferred component execution.
 */
export class IncrementalEmitter {
  private stack: EmitFrame[] = [];
  /** Whether emission is complete. */
  done = false;
  /** Tracks emitted bytes for qwikLoader inline heuristic. */
  size = 0;

  /**
   * Depth-first element index counter. Starts at -1 to match container convention (element IDs are
   * `String(depthFirstElementIdx + 1)`). Public so the container can continue counting for
   * direct-mode elements after emission.
   */
  depthFirstElementCount = -1;

  /** Stack of vNodeData being built for ancestor elements. */
  private vdStack: VNodeDataBuildState[] = [];

  constructor(
    private writer: StreamWriter,
    /** Node before whose close tag a callback should be invoked. */
    private containerDataNode: ISsrNode | null,
    /** Set of deferred Suspense boundary nodes. */
    private deferredBoundaries: Set<ISsrNode>,
    /** Map from deferred boundary node to placeholder ID. */
    private placeholderIds: Map<ISsrNode, string>,
    /**
     * VNodeData array to populate in document order. The emitter pushes each element's vNodeData as
     * it opens, ensuring correct document-order indexing regardless of tree-building order.
     */
    private vNodeDatas: VNodeData[] | null = null
  ) {}

  write(text: string): void {
    this.size += text.length;
    this.writer.write(text);
  }

  /** Start emission from the given root node. */
  init(root: ISsrNode): void {
    this.stack = [
      {
        node: root,
        children: null,
        childIdx: 0,
        phase: EmitPhase.OPEN,
        tagName: (root as any).tagName ?? null,
        isDeferred: false,
      },
    ];
    this.done = false;
  }

  /**
   * A node is "ready" when its own chores are done. Only CHILDREN may still be dirty (meaning some
   * descendants need processing). This lets us emit the open tag as soon as the node itself is
   * ready, then descend into children.
   */
  private isReady(node: ISsrNode): boolean {
    return ((node as any).dirty & ~ChoreBits.CHILDREN) === 0;
  }

  /** Track a virtual node open in the parent element's vNodeData. Assigns ID and vnodeData ref. */
  private trackVirtualOpen(ssrNode: SsrNode): void {
    if (this.vdStack.length > 0) {
      const parent = this.vdStack[this.vdStack.length - 1];
      vNodeData_openFragment(parent.vd, ssrNode_getSerializableAttrs(ssrNode));
      // Mark parent as having references (for ID-based node lookup on client)
      parent.vd[0] |= VNodeDataFlag.REFERENCE;
      parent.path[parent.path.length - 1]++;
      parent.path.push(-1);

      // Compute virtual node ID from parent element's index + path
      let refId = String(parent.depthFirstIdx + 1);
      for (let j = 0; j < parent.path.length; j++) {
        if (parent.path[j] >= 0) {
          refId += encodeAsAlphanumeric(parent.path[j]);
        }
      }
      ssrNode.id = refId;
      ssrNode.vnodeData = parent.vd;
    }
  }

  /** Track a virtual node close in the parent element's vNodeData. */
  private trackVirtualClose(): void {
    if (this.vdStack.length > 0) {
      const parent = this.vdStack[this.vdStack.length - 1];
      vNodeData_closeFragment(parent.vd);
      parent.path.pop();
    }
  }

  /** Check if an element SsrNode is a qwik style (invisible to vNodeData child counting). */
  private isQwikStyleElement(ssrNode: SsrNode): boolean {
    if ((ssrNode as any).tagName !== 'style') {
      return false;
    }
    const varAttrs = vnode_getProp(ssrNode, SSR_VAR_ATTRS, null) as Record<string, any> | null;
    const constAttrs = vnode_getProp(ssrNode, SSR_CONST_ATTRS, null) as Record<string, any> | null;
    return (
      (varAttrs != null && (QStyle in varAttrs || QScopedStyle in varAttrs)) ||
      (constAttrs != null && (QStyle in constAttrs || QScopedStyle in constAttrs))
    );
  }

  /**
   * Emit as many ready nodes as possible. Returns:
   *
   * - COMPLETE: all nodes emitted
   * - BLOCKED_DIRTY: paused at a dirty node (need more cursor processing)
   * - NEEDS_CALLBACK: reached container data point (caller must invoke async callback)
   */
  emitReady(): EmitResult {
    const stack = this.stack;

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const node = frame.node;

      switch (frame.phase) {
        case EmitPhase.OPEN: {
          // Check if node is ready to emit
          if (!this.isReady(node)) {
            return EmitResult.BLOCKED_DIRTY;
          }
          // Mark as emitted for backpatch correctness
          node.flags |= VNodeFlags.OpenTagEmitted;

          const kind = (node as any).nodeKind as SsrNodeKind;
          if (kind === SsrNodeKind.Element) {
            if (this.vNodeDatas) {
              const ssrNode = node as unknown as SsrNode;

              // Qwik style elements are invisible to vNodeData (not counted as children)
              const isQwikStyle = this.isQwikStyleElement(ssrNode);

              // Match tree-building convention: post-increment counter, use +1 for ID
              const depthFirstIdx = this.depthFirstElementCount++;

              // Reuse existing tree-built vNodeData array (preserves object identity for
              // virtual children's .vnodeData refs) or create new. Clear and rebuild.
              // Always set REFERENCE — all elements need to be locatable by ID on client.
              const existingVd = ssrNode.vnodeData;
              let vd: VNodeData;
              if (existingVd) {
                vd = existingVd;
                vd.length = 1;
                vd[0] = VNodeDataFlag.ELEMENT_NODE | VNodeDataFlag.REFERENCE;
              } else {
                vd = [VNodeDataFlag.ELEMENT_NODE | VNodeDataFlag.REFERENCE] as VNodeData;
                ssrNode.vnodeData = vd;
              }
              vd.push(ssrNode_getSerializableAttrs(ssrNode), WRITE_ELEMENT_ATTRS);

              // Increment parent element's element count in its vNodeData
              // (but not for qwik style elements — they're invisible to client)
              if (!isQwikStyle && this.vdStack.length > 0) {
                const parent = this.vdStack[this.vdStack.length - 1];
                vNodeData_incrementElementCount(parent.vd);
                parent.path[parent.path.length - 1]++;
              }

              // Push to vNodeDatas in document (open) order
              this.vNodeDatas.push(vd);
              this.vdStack.push({ vd, path: [-1], depthFirstIdx });

              // Assign element ID
              ssrNode.id = String(depthFirstIdx + 1);
            }
            this.emitOpenTag(node, frame.tagName!);
            frame.phase = EmitPhase.CHILDREN;
          } else if (kind === SsrNodeKind.Suspense) {
            if (this.vNodeDatas) {
              this.trackVirtualOpen(node as unknown as SsrNode);
            }
            this.handleSuspenseOpen(frame, node);
            // Phase set by handleSuspenseOpen
          } else {
            // Virtual/Component/Projection — no HTML output, track in parent vNodeData
            if (this.vNodeDatas) {
              this.trackVirtualOpen(node as unknown as SsrNode);
            }
            frame.phase = EmitPhase.CHILDREN;
          }
          break;
        }

        case EmitPhase.CHILDREN: {
          if (!frame.children) {
            frame.children = (node as any).orderedChildren as SsrChild[] | null;
          }
          const children = frame.children;
          if (children && frame.childIdx < children.length) {
            const blockedChild =
              ((node as any).dirty & ChoreBits.CHILDREN) !== 0 ? getFirstBlockedChild(node) : null;
            if (blockedChild && children[frame.childIdx] === blockedChild) {
              return EmitResult.BLOCKED_DIRTY;
            }
            const child = children[frame.childIdx++];
            if (isSsrContentChild(child)) {
              emitContentChild(this, child);
              // Track text in parent element's vNodeData
              if (this.vNodeDatas && child.kind === SsrNodeKind.Text && this.vdStack.length > 0) {
                const parent = this.vdStack[this.vdStack.length - 1];
                vNodeData_addTextSize(parent.vd, child.textLength ?? child.content.length);
                parent.path[parent.path.length - 1]++;
              }
            } else {
              const childNode = child as ISsrNode;
              stack.push({
                node: childNode,
                children: null,
                childIdx: 0,
                phase: EmitPhase.OPEN,
                tagName: (childNode as any).tagName ?? null,
                isDeferred: false,
              });
            }
          } else {
            frame.phase = EmitPhase.CLOSE;
          }
          break;
        }

        case EmitPhase.CLOSE: {
          // Check for container data callback before close tag
          if (node === this.containerDataNode) {
            // Signal caller to run the async container data emission
            this.containerDataNode = null; // Only fire once
            return EmitResult.NEEDS_CALLBACK;
          }

          if (frame.tagName) {
            // Element close: pop vNodeData build state
            if (this.vNodeDatas) {
              this.vdStack.pop();
            }
            emitCloseTag(this, frame.tagName);
          } else {
            // Non-element close: close virtual fragment in parent vNodeData
            if (this.vNodeDatas) {
              this.trackVirtualClose();
            }
          }

          // For deferred Suspense: close the placeholder div
          if (frame.isDeferred) {
            this.write('</div>');
          }

          stack.pop();
          break;
        }
      }
    }

    this.done = true;
    return EmitResult.COMPLETE;
  }

  private emitOpenTag(node: ISsrNode, tagName: string): void {
    const varAttrs = vnode_getProp(node, SSR_VAR_ATTRS, null) as Record<string, any> | null;
    const constAttrs = vnode_getProp(node, SSR_CONST_ATTRS, null) as Record<string, any> | null;
    const styleScopedId = vnode_getProp(node, SSR_STYLE_SCOPED_ID, null) as string | null;

    this.write(LT);
    this.write(tagName);
    emitAttrs(this, varAttrs, styleScopedId);

    // q: separator + key
    this.write(' ' + Q_PROPS_SEPARATOR);
    const key = (node as any).key;
    if (key !== null && key !== undefined) {
      this.write(`="${key}"`);
    } else if (import.meta.env.TEST) {
      this.write(EMPTY_ATTR);
    }

    emitAttrs(this, constAttrs, styleScopedId);
    this.write(GT);
  }

  /**
   * Handle Suspense boundary open. Deferred boundaries emit fallback in placeholder div. Ready
   * boundaries emit content node's children inline.
   */
  private handleSuspenseOpen(frame: EmitFrame, node: ISsrNode): void {
    if (this.deferredBoundaries.has(node)) {
      // Deferred: emit <div id="qph-N"> and walk fallback children, then close with </div>
      const placeholderId =
        this.placeholderIds.get(node) || vnode_getProp(node, SSR_SUSPENSE_PLACEHOLDER_ID, null);
      this.write(`<div id="${placeholderId}">`);
      frame.isDeferred = true;
      frame.phase = EmitPhase.CHILDREN;
      // orderedChildren contain the fallback
    } else {
      // Ready: walk content node's children
      const contentNode = vnode_getProp(node, SSR_SUSPENSE_CONTENT, null) as ISsrNode | null;
      if (contentNode) {
        // Replace this frame's children source with the content node's children
        frame.children = (contentNode as any).orderedChildren as SsrChild[] | null;
        frame.childIdx = 0;
        frame.phase = EmitPhase.CHILDREN;
      } else {
        // No content — emit boundary's own children (fallback)
        frame.phase = EmitPhase.CHILDREN;
      }
    }
  }
}
