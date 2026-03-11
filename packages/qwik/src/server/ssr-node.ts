import type { JSXNode } from '@qwik.dev/core';
import {
  _isJSXNode as isJSXNode,
  _EFFECT_BACK_REF,
  _VirtualVNode as VirtualVNode,
} from '@qwik.dev/core/internal';
import { isDev } from '@qwik.dev/core/build';
import {
  QSlotParent,
  mapApp_remove,
  mapArray_get,
  mapArray_set,
  mapArray_has,
  ELEMENT_SEQ,
  QSlot,
  QDefaultSlot,
  NON_SERIALIZABLE_MARKER_PREFIX,
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

  /** Serializable attributes — standalone object, may be shared with vNodeData entry. */
  private attrs: Props;

  /** Local props which don't serialize (prefixed with NON_SERIALIZABLE_MARKER_PREFIX). */
  private localProps: Props | null = null;

  private cleanupQueue: CleanupQueue;

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
      null, // props (used for cursor data like NODE_DIFF_DATA_KEY)
      null, // firstChild
      null // lastChild
    );

    this.id = id;
    this.parentComponent = parentComponent;
    this.cleanupQueue = cleanupQueue;
    this.currentFile = currentFile;
    this.dirty = ChoreBits.NONE;
    this.attrs = attrs;

    this.parentComponent?.addChild(this);

    // Override VNode's [_EFFECT_BACK_REF] field with getter/setter that delegates to
    // serializable attrs (QBackRefs), so back refs are included in vnodeData serialization.
    Object.defineProperty(this, _EFFECT_BACK_REF, {
      get: () => this.getProp(QBackRefs),
      set: (value: any) => {
        if (value !== undefined) {
          this.setProp(QBackRefs, value);
        }
      },
      configurable: true,
    });

    if (isDev && id.indexOf('undefined') != -1) {
      throw new Error(`Invalid SSR node id: ${id}`);
    }
  }

  /** Updatable = opening tag not yet streamed */
  get updatable(): boolean {
    return !(this.flags & VNodeFlags.OpenTagEmitted);
  }

  setProp(name: string, value: any): void {
    if (name.startsWith(NON_SERIALIZABLE_MARKER_PREFIX)) {
      (this.localProps ||= {})[name] = value;
    } else {
      this.attrs[name] = value;
    }
    if (name == ELEMENT_SEQ && value) {
      // Sequential Arrays contain Tasks. And Tasks contain cleanup functions.
      // We need to collect these cleanup functions and run them when the rendering is done.
      this.cleanupQueue.push(value);
    }
  }

  getProp(name: string): any {
    if (name.startsWith(NON_SERIALIZABLE_MARKER_PREFIX)) {
      return this.localProps ? (this.localProps[name] ?? null) : null;
    } else {
      return this.attrs[name] ?? null;
    }
  }

  /** Returns the serializable attrs object. Used by the streamer to build vNodeData. */
  getSerializableAttrs(): Props {
    return this.attrs;
  }

  removeProp(name: string): void {
    if (name.startsWith(NON_SERIALIZABLE_MARKER_PREFIX)) {
      if (this.localProps) {
        delete this.localProps[name];
      }
    } else {
      delete this.attrs[name];
    }
  }

  addChild(child: ISsrNode): void {
    if (!this.children) {
      this.children = [];
    }
    this.children.push(child);
  }

  /** Add an ordered child for streaming walker emission (treeOnly mode). */
  addOrderedChild(child: SsrChild): void {
    if (!this.orderedChildren) {
      this.orderedChildren = [];
    }
    this.orderedChildren.push(child);
  }

  setTreeNonUpdatable(): void {
    if (!(this.flags & VNodeFlags.OpenTagEmitted)) {
      this.flags |= VNodeFlags.OpenTagEmitted;
      if (this.children) {
        for (const child of this.children) {
          (child as SsrNode).setTreeNonUpdatable();
        }
      }
    }
  }

  override toString(): string {
    if (isDev) {
      let stringifiedAttrs = '';
      for (const key in this.attrs) {
        const value = this.attrs[key];
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
    this.componentNode.setProp(slotName, projectionNode.id);
    projectionNode.setProp(QSlotParent, this.componentNode.id);
    return children;
  }
}
