import type { JSXNode } from '@qwik.dev/core';
import {
  _isJSXNode as isJSXNode,
  _EFFECT_BACK_REF,
  _VirtualVNode as VirtualVNode,
  _vnode_getProp as vnode_getProp,
  _vnode_setProp as vnode_setProp,
} from '@qwik.dev/core/internal';
import { isDev } from '@qwik.dev/core/build';
import {
  QSlotParent,
  mapApp_remove,
  mapArray_get,
  mapArray_set,
  mapArray_has,
  QSlot,
  QDefaultSlot,
  QBackRefs,
  ChoreBits,
  VNodeFlags,
} from './qwik-copy';
import type { ISsrNode, ISsrComponentFrame, JSXChildren, Props } from './qwik-types';
import type { CleanupQueue } from './ssr-container';
import type { VNodeData } from './vnode-data';

/**
 * Local prop keys for deferred data stored on SsrNodes during tree building. These use the
 * NON_SERIALIZABLE_MARKER_PREFIX (':') so they won't be serialized.
 */
export const SSR_VAR_ATTRS = ':varAttrs';
export const SSR_CONST_ATTRS = ':constAttrs';
export const SSR_STYLE_SCOPED_ID = ':styleScopedId';
export const SSR_INNER_HTML = ':innerHTML';
export const SSR_HAS_MOVED_CAPTURES = ':hasMovedCaptures';
export const SSR_TEXT = ':text';
export const SSR_JSX = ':jsx';
export const SSR_SCOPED_STYLE = ':scopedStyle';
export const SSR_COMPONENT_FRAME = ':componentFrame';
/** Serialized attribute HTML stored on SsrNode for streaming walker emission. */
export const SSR_ATTR_HTML = ':attrHtml';
/** Suspense fallback SsrNode stored on the boundary node. */
export const SSR_SUSPENSE_FALLBACK = ':suspenseFallback';
/** Suspense placeholder ID for OoO streaming. */
export const SSR_SUSPENSE_PLACEHOLDER_ID = ':suspensePlaceholderId';
/** Content SsrNode holding Suspense children built by sub-cursor. */
export const SSR_SUSPENSE_CONTENT = ':suspenseContent';
/** Whether Suspense children are ready (sub-cursor completed). */
export const SSR_SUSPENSE_READY = ':suspenseReady';

/**
 * Lightweight content node for text, raw HTML, and comments stored in an SsrNode's orderedChildren.
 * These don't need the full SsrNode infrastructure — just a kind tag and content string.
 */
export interface SsrContentChild {
  kind: SsrNodeKind.Text | SsrNodeKind.RawHtml | SsrNodeKind.Comment;
  content: string;
  /** Original (unescaped) text length. Only set for Text kind. Used by vNodeData builder. */
  textLength?: number;
}

/** A child entry in orderedChildren — either a full SsrNode or a lightweight content node. */
export type SsrChild = ISsrNode | SsrContentChild;

/** Type guard for SsrContentChild (has 'kind' and 'content' but not 'id'). */
export function isSsrContentChild(child: SsrChild): child is SsrContentChild {
  return 'kind' in child && !('id' in child);
}

/**
 * The type of SsrNode for emission purposes.
 *
 * @internal
 */
export const enum SsrNodeKind {
  /** HTML element (div, span, etc.) — has tagName */
  Element = 0,
  /** Text node */
  Text = 1,
  /** Virtual boundary (Fragment, InlineComponent, WrappedSignal, Awaited) */
  Virtual = 2,
  /** Qwik component — needs component execution */
  Component = 3,
  /** Slot projection */
  Projection = 4,
  /** Raw HTML */
  RawHtml = 5,
  /** Comment */
  Comment = 6,
  /** Suspense boundary */
  Suspense = 7,
}

/**
 * Server has no DOM, so we need to create a fake node to represent the DOM for serialization
 * purposes.
 *
 * Once deserialized on the client, they will be turned to ElementVNodes.
 *
 * Extends VirtualVNode to share cursor infrastructure (dirty bits, dirtyChildren,
 * parent/slotParent, sibling linked list).
 */
export class SsrNode extends VirtualVNode implements ISsrNode {
  __brand__ = 'SsrNode' as const;

  /** ID which the deserialize will use to retrieve the node. */
  public id: string;

  /**
   * VNode serialization data for this node's subtree. Set externally by
   * vNodeData_createSsrNodeReference (during tree building) or by the streamer (future).
   */
  public vnodeData: VNodeData | null = null;

  /** Source file location for dev mode diagnostics. */
  public currentFile: string | null;

  /** Component host node (for SSR component tracking). */
  public parentComponent: ISsrNode | null;

  /** HTML tag name for element nodes, null for virtual nodes. */
  public tagName: string | null = null;

  /** Node kind for emission dispatch. */
  public nodeKind: SsrNodeKind = SsrNodeKind.Virtual;

  public cleanupQueue: CleanupQueue;

  /**
   * Legacy children array for backward compatibility during migration. TODO: Remove once all
   * consumers switch to VNode linked list traversal.
   */
  public children: ISsrNode[] | null = null;

  /**
   * Ordered children for streaming walker emission. Contains ALL children (elements, text, virtual
   * nodes, raw HTML, comments) in document order. Only populated in treeOnly mode.
   */
  public orderedChildren: SsrChild[] | null = null;

  constructor(
    parentComponent: ISsrNode | null,
    id: string,
    attrs: Props,
    cleanupQueue: CleanupQueue,
    currentFile: string | null
  ) {
    super(
      null, // key
      VNodeFlags.Virtual,
      null, // parent
      null, // previousSibling
      null, // nextSibling
      attrs, // props — serializable attributes (shared reference with vNodeData)
      null, // firstChild
      null // lastChild
    );

    this.id = id;
    this.parentComponent = parentComponent;
    this.cleanupQueue = cleanupQueue;
    this.currentFile = currentFile;
    this.dirty = ChoreBits.NONE;

    if (this.parentComponent) {
      ssrNode_addChild(this.parentComponent, this);
    }

    // Override VNode's [_EFFECT_BACK_REF] field with getter/setter that delegates to
    // serializable props (QBackRefs), so back refs are included in vnodeData serialization.
    Object.defineProperty(this, _EFFECT_BACK_REF, {
      get: () => vnode_getProp(this, QBackRefs, null),
      set: (value: any) => {
        if (value !== undefined) {
          vnode_setProp(this, QBackRefs, value);
        }
      },
      configurable: true,
    });

    if (isDev && id.indexOf('undefined') != -1) {
      throw new Error(`Invalid SSR node id: ${id}`);
    }
  }

  override toString(): string {
    if (isDev) {
      let stringifiedAttrs = '';
      for (const key in this.props) {
        const value = this.props![key];
        stringifiedAttrs += `${key}=`;
        stringifiedAttrs +=
          typeof value === 'string' || typeof value === 'number' ? JSON.stringify(value) : '*';
        stringifiedAttrs += ', ';
      }
      return `<SSRNode id="${this.id}" ${stringifiedAttrs} />`;
    } else {
      return `<SSRNode id="${this.id}" />`;
    }
  }
}

// ============================================================================
// SsrNode free functions
// ============================================================================

/** Updatable = opening tag not yet streamed */
export const ssrNode_isUpdatable = (node: ISsrNode): boolean => {
  return !(node.flags & VNodeFlags.OpenTagEmitted);
};

/** Returns the serializable props object. Used by the streamer to build vNodeData. */
export const ssrNode_getSerializableAttrs = (node: ISsrNode): Props => {
  return node.props!;
};

export const ssrNode_addChild = (node: ISsrNode, child: ISsrNode): void => {
  if (!node.children) {
    node.children = [];
  }
  node.children.push(child);
};

/** Add an ordered child for streaming walker emission (treeOnly mode). */
export const ssrNode_addOrderedChild = (node: SsrNode, child: SsrChild): void => {
  if (!node.orderedChildren) {
    node.orderedChildren = [];
  }
  node.orderedChildren.push(child);
};

export const ssrNode_setTreeNonUpdatable = (node: ISsrNode): void => {
  if (!(node.flags & VNodeFlags.OpenTagEmitted)) {
    node.flags |= VNodeFlags.OpenTagEmitted;
    if (node.children) {
      for (const child of node.children) {
        ssrNode_setTreeNonUpdatable(child);
      }
    }
  }
};

/** A ref to a DOM element */
export class DomRef {
  __brand__ = 'DomRef' as const;
  constructor(public $ssrNode$: ISsrNode) {}
}

export class SsrComponentFrame implements ISsrComponentFrame {
  public slots = [];
  public projectionDepth = 0;
  public scopedStyleIds = new Set<string>();
  public projectionScopedStyle: string | null = null;
  public projectionComponentFrame: SsrComponentFrame | null = null;
  constructor(public componentNode: ISsrNode) {}

  distributeChildrenIntoSlots(
    children: JSXChildren,
    projectionScopedStyle: string | null,
    projectionComponentFrame: SsrComponentFrame | null
  ) {
    this.projectionScopedStyle = projectionScopedStyle;
    this.projectionComponentFrame = projectionComponentFrame;
    if (isJSXNode(children)) {
      const slotName = this.getSlotName(children);
      mapArray_set(this.slots, slotName, children, 0);
    } else if (Array.isArray(children) && children.length > 0) {
      const defaultSlot = [];
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (isJSXNode(child)) {
          const slotName = this.getSlotName(child);
          if (slotName === QDefaultSlot) {
            defaultSlot.push(child);
          } else {
            this.updateSlot(slotName, child);
          }
        } else {
          defaultSlot.push(child);
        }
      }
      defaultSlot.length > 0 && mapArray_set(this.slots, QDefaultSlot, defaultSlot, 0);
    } else {
      mapArray_set(this.slots, QDefaultSlot, children, 0);
    }
  }

  private updateSlot(slotName: string, child: JSXChildren) {
    // we need to check if the slot already has a value
    let existingSlots = mapArray_get<JSXChildren>(this.slots, slotName, 0);
    if (existingSlots === null) {
      existingSlots = child;
    } else if (Array.isArray(existingSlots)) {
      // if the slot already has a value and it is an array, we need to push the new value
      existingSlots.push(child);
    } else {
      // if the slot already has a value and it is not an array, we need to create an array
      existingSlots = [existingSlots, child];
    }
    // set the new value
    mapArray_set(this.slots, slotName, existingSlots, 0);
  }

  private getSlotName(jsx: JSXNode): string {
    if (jsx.props[QSlot]) {
      return jsx.props[QSlot] as string;
    }
    return QDefaultSlot;
  }

  hasSlot(slotName: string): boolean {
    return mapArray_has(this.slots, slotName, 0);
  }

  consumeChildrenForSlot(projectionNode: ISsrNode, slotName: string): JSXChildren | null {
    const children = mapApp_remove(this.slots, slotName, 0);
    // Store SsrNode references (resolved to IDs at serialization time in writeFragmentAttrs)
    vnode_setProp(this.componentNode, slotName, projectionNode);
    vnode_setProp(projectionNode, QSlotParent, this.componentNode);
    return children;
  }
}
