/** @file Public APIs for the SSR */
import {
  SsrNode,
  type SSRContainer as ISSRContainer,
  type SsrAttrs,
  type StreamWriter,
  SsrComponentFrame,
} from './types';
import {
  CLOSE_FRAGMENT,
  OPEN_FRAGMENT,
  vNodeData_addTextSize,
  vNodeData_closeFragment,
  vNodeData_incrementElementCount,
  vNodeData_openFragment,
  VNodeDataFlag,
  type VNodeData,
  vNodeData_createSsrNodeReference,
  encodeAsAlphanumeric,
} from './vnode-data';
import {
  createSerializationContext,
  serialize,
  type SerializationContext,
} from '../shared-serialization';
import { TagNesting, allowedContent, initialTag, isTagAllowed } from './tag-nesting';
import { assertDefined, assertTrue } from '../../error/assert';
import {
  ELEMENT_ID,
  ELEMENT_KEY,
  ELEMENT_PROPS,
  ELEMENT_SEQ,
  OnRenderProp,
  QCtxAttr,
  QScopedStyle,
  QSlotParent,
  QSlotRef,
} from '../../util/markers';
import { isDev } from '../../../build';
import { throwErrorAndStop } from '../../util/log';
import { syncWalkJSX } from './ssr-render';
import type { JSXChildren } from '../../render/jsx/types/jsx-qwik-attributes';
import { createSubscriptionManager, type SubscriptionManager } from '../../state/common';
import type { HostElement, fixMeAny } from '../shared/types';
import type { ContextId } from '../../use/use-context';
import type { T } from 'vitest/dist/reporters-qc5Smpt5';
import { mapArray_get, mapArray_set } from '../client/vnode';

export function ssrCreateContainer(
  opts: {
    locale?: string;
    tagName?: string;
    writer?: StreamWriter;
  } = {}
): ISSRContainer {
  return new SSRContainer({
    tagName: opts.tagName || 'div',
    writer: opts.writer || new StringBufferWriter(),
    locale: opts.locale || '',
  });
}

class StringBufferWriter {
  private buffer = [] as string[];
  write(text: string) {
    this.buffer.push(text);
  }
  toString() {
    return this.buffer.join('');
  }
}

interface ContainerElementFrame {
  tagNesting: TagNesting;
  parent: ContainerElementFrame | null;
  /** Element name. */
  elementName: string;
  /**
   * Current element index.
   *
   * This number must match the depth-first traversal of the DOM elements as returned by the
   * https://developer.mozilla.org/en-US/docs/Web/API/TreeWalker
   */
  depthFirstElementIdx: number;
  vNodeData: VNodeData;
}

class SSRContainer implements ISSRContainer {
  public tag: string;
  public writer: StreamWriter;
  public serializationCtx: SerializationContext;
  public $locale$: string;
  public $subsManager$: SubscriptionManager = null!;
  public getObjectById: (id: string | number) => unknown = () => {
    throw new Error('SSR should not have deserialize objects.');
  };
  private lastNode: SsrNode | null = null;
  private currentComponentNode: SsrNode | null = null;
  public markComponentForRender(): void {
    throw new Error('SSR can not mark components for render.');
  }

  private currentElementFrame: ContainerElementFrame | null = null;
  /**
   * Current element index.
   *
   * This number must match the depth-first traversal of the DOM elements as returned by the
   * https://developer.mozilla.org/en-US/docs/Web/API/TreeWalker
   */
  private depthFirstElementCount: number = -1;
  private vNodeData: VNodeData[] = [];
  private componentStack: SsrComponentFrame[] = [];
  private unclaimedProjections: Array<SsrNode | string | JSXChildren> = [];

  constructor(opts: Required<Required<Parameters<typeof ssrCreateContainer>>[0]>) {
    this.tag = opts.tagName;
    this.writer = opts.writer;
    this.$locale$ = opts.locale;
    this.serializationCtx = createSerializationContext(SsrNode, null, this.writer);
    this.$subsManager$ = createSubscriptionManager(this as fixMeAny);
  }

  setContext<T>(host: HostElement, context: ContextId<T>, value: T): void {
    const ssrNode: SsrNode = host as any;
    let ctx: Array<string | unknown> = ssrNode.getProp(QCtxAttr);
    if (!ctx) {
      ssrNode.setProp(QCtxAttr, (ctx = []));
    }
    mapArray_set(ctx, context.id, value, 0);
  }

  resolveContext<T>(host: HostElement, contextId: ContextId<T>): T | undefined {
    let ssrNode: SsrNode | null = host as any;
    while (ssrNode) {
      const ctx: Array<string | unknown> = ssrNode.getProp(QCtxAttr);
      if (ctx) {
        const value = mapArray_get(ctx, contextId.id, 0) as T;
        if (value) {
          return value;
        }
      }
      ssrNode = ssrNode.currentComponentNode;
    }
    return undefined;
  }

  clearLocalProps(host: HostElement): void {
    const ssrNode: SsrNode = host as any;
    ssrNode.clearLocalProps();
  }

  getParentHost(host: HostElement): HostElement | null {
    const ssrNode: SsrNode = host as any;
    return ssrNode.currentComponentNode as HostElement | null;
  }

  setHostProp<T>(host: HostElement, name: string, value: T): void {
    const ssrNode: SsrNode = host as any;
    return ssrNode.setProp(name, value);
  }

  getHostProp<T>(host: HostElement, name: string): T | null {
    const ssrNode: SsrNode = host as any;
    return ssrNode.getProp(name);
  }

  openContainer() {
    if (this.tag == 'html') {
      this.write('<!DOCTYPE html>');
    }
    this.openElement(this.tag, [
      'q:container',
      'paused',
      'q:render',
      'static-ssr',
      'q:version',
      'dev',
      'q:base',
      '/build/',
      'q:locale',
      this.$locale$,
      'q:manifest-hash',
      'dev',
    ]);
  }

  closeContainer(): void {
    this.closeElement();
  }

  openElement(tag: string, attrs: SsrAttrs) {
    this.lastNode = null;
    this.pushFrame(tag, this.depthFirstElementCount++, true);
    this.write('<');
    this.write(tag);
    this.writeAttrs(attrs);
    this.write('>');
    this.lastNode = null;
  }

  closeElement() {
    const currentFrame = this.currentElementFrame!;
    if (
      (currentFrame.parent === null && currentFrame.tagNesting !== TagNesting.HTML) ||
      currentFrame.tagNesting === TagNesting.BODY
    ) {
      this.emitContainerData();
    }
    this.write('</');
    this.write(this.popFrame().elementName!);
    this.write('>');
    // Keep track of number of elements.
    const newFrame = this.currentElementFrame;
    if (newFrame) {
      vNodeData_incrementElementCount(newFrame.vNodeData);
    }
    this.lastNode = null;
  }

  openFragment(attrs: SsrAttrs) {
    this.lastNode = null;
    vNodeData_openFragment(this.currentElementFrame!.vNodeData, attrs);
  }

  closeFragment() {
    vNodeData_closeFragment(this.currentElementFrame!.vNodeData);
    this.lastNode = null;
  }

  openProjection(attrs: SsrAttrs) {
    this.openFragment(attrs);
    this.getComponentFrame(0)!.projectionDepth++;
  }

  closeProjection() {
    this.getComponentFrame(0)!.projectionDepth--;
    this.closeFragment();
  }

  openComponent(attrs: SsrAttrs) {
    this.openFragment(attrs);
    this.currentComponentNode = this.getLastNode();
    this.componentStack.push(new SsrComponentFrame(this.getLastNode()));
  }

  /**
   * Returns the current component frame.
   *
   * @param projectionDepth - How many levels of projection to skip. This is needed when projections
   *   are nested inside other projections we need to have a way to read from a frame above.
   * @returns
   */
  getComponentFrame(projectionDepth: number = 0): SsrComponentFrame | null {
    const length = this.componentStack.length;
    const idx = length - projectionDepth - 1;
    return idx >= 0 ? this.componentStack[idx] : null;
  }

  closeComponent() {
    const componentFrame = this.componentStack.pop()!;
    componentFrame.releaseUnclaimedProjections(this.unclaimedProjections);
    this.closeFragment();
    this.currentComponentNode = this.currentComponentNode?.currentComponentNode || null;
  }

  /** Write a text node with correct escaping. Save the length of the text node in the vNodeData. */
  textNode(text: string) {
    let lastIdx = 0;
    let openAngleBracketIdx: number;
    while ((openAngleBracketIdx = text.indexOf('<')) !== -1) {
      this.write(text.substring(lastIdx, openAngleBracketIdx));
      lastIdx = openAngleBracketIdx;
    }
    this.write(lastIdx === 0 ? text : text.substring(lastIdx));
    vNodeData_addTextSize(this.currentElementFrame!.vNodeData, text.length);
    this.lastNode = null;
  }

  addRoot(obj: unknown): number {
    return this.serializationCtx.$addRoot$(obj);
  }

  getLastNode(): SsrNode {
    if (!this.lastNode) {
      this.lastNode = vNodeData_createSsrNodeReference(
        this.currentComponentNode,
        this.currentElementFrame!.vNodeData,
        this.depthFirstElementCount
      );
    }
    return this.lastNode;
  }

  addUnclaimedProjection(node: SsrNode, name: string, children: JSXChildren): void {
    this.unclaimedProjections.push(node, name, children);
  }

  ////////////////////////////////////

  emitContainerData() {
    this.emitUnclaimedProjection();
    this.emitVNodeData();
    this.emitStateData();
  }

  /**
   * Serialize the vNodeData into a string and emit it as a script tag.
   *
   * ## Encoding:
   *
   * - Alphabetical characters are text node lengths.
   * - Numbers are element counts.
   * - `{` is start of virtual node.
   * - `}` is end of virtual node.
   * - `~` Store as reference for data deserialization.
   * - `!"#$%&'()*+'-./` are separators (sequential characters in ASCII table)
   *
   * ## Attribute encoding:
   *
   * - `=` - `q:id` - ID of the element.
   * - `?` - `q:sref` - Slot reference.
   * - `@` - `q:key` - Element key.
   * - `;` - `q:sstyle` - Style attribute.
   * - `<` - `q:renderFn' - Component QRL render function (body)
   * - `>` - `q:props' - Component QRL Props
   * - `[` - `q:seq' - Seq value from `useSequentialScope()`
   *
   * ## Separator Encoding:
   *
   * - `!` is vNodeData separator skipping 0. (ie next vNode)
   * - `"` is vNodeData separator skipping 1.
   * - `#` is vNodeData separator skipping 2.
   * - `$` is vNodeData separator skipping 4.
   * - `%` is vNodeData separator skipping 8.
   * - `&` is vNodeData separator skipping 16.
   * - `'` is vNodeData separator skipping 32.
   * - `(` is vNodeData separator skipping 64.
   * - `)` is vNodeData separator skipping 128.
   * - `*` is vNodeData separator skipping 256.
   * - `+` is vNodeData separator skipping 512.
   * - `'` is vNodeData separator skipping 1024.
   * - `.` is vNodeData separator skipping 2048.
   * - `/` is vNodeData separator skipping 4096.
   *
   * NOTE: Not every element will need vNodeData. So we need to encode how many elements should be
   * skipped. By choosing different separators we can encode different numbers of elements to skip.
   */
  emitVNodeData() {
    this.openElement('script', ['type', 'qwik/vnode']);
    const vNodeAttrsStack: SsrAttrs[] = [];
    const vNodeData = this.vNodeData;
    let lastSerializedIdx = 0;
    for (let elementIdx = 0; elementIdx < vNodeData.length; elementIdx++) {
      const vNode = vNodeData[elementIdx];
      const flag = vNode[0];
      if (flag !== VNodeDataFlag.NONE) {
        lastSerializedIdx = this.emitVNodeSeparators(lastSerializedIdx, elementIdx);
        if (flag & VNodeDataFlag.REFERENCE) {
          this.write('~');
        }
        if (flag & (VNodeDataFlag.TEXT_DATA | VNodeDataFlag.VIRTUAL_NODE)) {
          let fragmentAttrs: SsrAttrs | null = null;
          for (let i = 1; i < vNode.length; i++) {
            const value = vNode[i];
            if (Array.isArray(value)) {
              vNodeAttrsStack.push(fragmentAttrs!);
              fragmentAttrs = value;
            } else if (value === OPEN_FRAGMENT) {
              this.write('{');
            } else if (value === CLOSE_FRAGMENT) {
              // write out fragment attributes
              if (fragmentAttrs) {
                for (let i = 0; i < fragmentAttrs.length; ) {
                  const key = fragmentAttrs[i++] as string;
                  let value = fragmentAttrs[i++] as string;
                  if (typeof value !== 'string') {
                    value = String(this.addRoot(value));
                  }
                  switch (key) {
                    case QScopedStyle:
                      this.write(';');
                      break;
                    case OnRenderProp:
                      this.write('<');
                      break;
                    case ELEMENT_ID:
                      this.write('=');
                      break;
                    case ELEMENT_PROPS:
                      this.write('>');
                      break;
                    case QSlotRef:
                      this.write('?');
                      break;
                    case ELEMENT_KEY:
                      this.write('@');
                      break;
                    case ELEMENT_SEQ:
                      this.write('[');
                      break;
                    // Skipping `\` character for now because it is used for escaping.
                    case QCtxAttr:
                      this.write(']');
                      break;
                    default:
                      this.write('|');
                      assertTrue(
                        !!key.match(/[\w\d_:]*/),
                        'Unsupported character in fragment attribute key: ' + key
                      );
                      this.write(key);
                      this.write('|');
                  }
                  if (isDev) {
                    assertDefined(value, 'Fragment attribute value must be defined.');
                    assertTrue(
                      !!value.match(/(\d|\w|_|:|;|<|>)*/),
                      'Unsupported character in fragment attribute value: ' + value
                    );
                  }
                  this.write(value!);
                }
                fragmentAttrs = vNodeAttrsStack.pop()!;
              }
              this.write('}');
            } else if (value >= 0) {
              // Text nodes get encoded as alphanumeric characters.
              this.write(encodeAsAlphanumeric(value));
            } else {
              // Element counts get encoded as numbers.
              this.write(String(0 - value));
            }
          }
        }
      }
    }
    this.closeElement();
  }

  private emitStateData() {
    this.openElement('script', ['type', 'qwik/state']);
    serialize(this.serializationCtx);
    this.closeElement();
  }

  private async emitUnclaimedProjection() {
    const unclaimedProjections = this.unclaimedProjections;
    if (unclaimedProjections.length) {
      this.openElement('q:template', ['style', 'display:none']);
      let idx = 0;
      let ssrComponentNode: SsrNode | null = null;
      while (idx < unclaimedProjections.length) {
        const value = unclaimedProjections[idx++];
        if (value instanceof SsrNode) {
          ssrComponentNode = value;
        } else if (typeof value === 'string') {
          const children = unclaimedProjections[idx++] as JSXChildren;
          this.openFragment([QSlotParent, ssrComponentNode!.id]);
          ssrComponentNode?.setProp(value, this.getLastNode().id);
          syncWalkJSX(this, children);
          this.closeFragment();
        } else {
          throw throwErrorAndStop('should not get here');
        }
      }
      this.closeElement();
    }
  }

  private emitVNodeSeparators(lastSerializedIdx: number, elementIdx: number): number {
    let skipCount = elementIdx - lastSerializedIdx;
    // console.log('emitVNodeSeparators', lastSerializedIdx, elementIdx, skipCount);
    while (skipCount != 0) {
      if (skipCount >= 4096) {
        this.write('/');
        skipCount -= 8192;
      } else {
        skipCount & 2096 && this.write('.');
        skipCount & 2048 && this.write('-');
        skipCount & 1024 && this.write('+');
        skipCount & 512 && this.write('*');
        skipCount & 256 && this.write(')');
        skipCount & 128 && this.write('(');
        skipCount & 64 && this.write("'");
        skipCount & 32 && this.write('&');
        skipCount & 16 && this.write('%');
        skipCount & 8 && this.write('$');
        skipCount & 4 && this.write('#');
        skipCount & 2 && this.write('"');
        skipCount & 1 && this.write('!');
        skipCount = 0;
      }
    }
    return elementIdx;
  }

  private pushFrame(tag: string, depthFirstElementIdx: number, isElement: boolean) {
    let tagNesting: TagNesting = TagNesting.ANYTHING;
    if (isDev) {
      if (tag !== tag.toLowerCase()) {
        throw newTagError(`Tag '${tag}' must be lower case, because HTML is case insensitive.`);
      }
      if (!this.currentElementFrame) {
        tagNesting = initialTag(tag);
      } else {
        let frame: ContainerElementFrame | null = this.currentElementFrame;
        const previousTagNesting = frame!.tagNesting;
        tagNesting = isTagAllowed(previousTagNesting, tag);
        if (tagNesting === TagNesting.NOT_ALLOWED) {
          const frames: ContainerElementFrame[] = [];
          while (frame) {
            frames.unshift(frame);
            frame = frame.parent;
          }
          const text: string[] = [
            `HTML rules do not allow '<${tag}>' at this location.`,
            `  (The HTML parser will try to recover by auto-closing or inserting additional tags which will confuse Qwik when it resumes.)`,
            `  Offending tag: <${tag}>`,
            `  Existing tag context:`,
          ];
          let indent = '    ';
          let lastName = '';
          for (const frame of frames) {
            const [name, example] = allowedContent(frame.tagNesting);
            text.push(
              `${indent}<${frame.elementName}>${
                lastName !== name ? ` [${name}]${example ? ` -> ${example}` : ''}` : ''
              }`
            );
            lastName = name;
            indent += ' ';
          }
          text.push(
            `${indent}<${tag}> <= is not allowed as a child of ${
              allowedContent(previousTagNesting)[0]
            }.`
          );
          throw newTagError(text.join('\n'));
        }
      }
    }
    const frame: ContainerElementFrame = {
      tagNesting: tagNesting,
      parent: this.currentElementFrame,
      elementName: tag,
      depthFirstElementIdx: depthFirstElementIdx,
      vNodeData: [VNodeDataFlag.NONE],
    };
    this.currentElementFrame = frame;
    if (isElement) {
      this.vNodeData.push(frame.vNodeData);
    }
  }
  private popFrame() {
    const closingFrame = this.currentElementFrame!;
    this.currentElementFrame = closingFrame.parent;
    return closingFrame;
  }

  ////////////////////////////////////
  private write(text: string) {
    this.writer.write(text);
  }

  private writeAttrs(attrs: (string | null)[]) {
    if (attrs.length) {
      for (let i = 0; i < attrs.length; i++) {
        const key = attrs[i++] as string;
        const value = attrs[i];
        this.write(' ');
        this.write(key);
        if (value != null) {
          this.write('="');
          let startIdx = 0;
          let quoteIdx: number;
          while ((quoteIdx = value.indexOf('"', startIdx)) != -1) {
            this.write(value.substring(startIdx, quoteIdx));
            this.write('&quot;');
            startIdx = quoteIdx;
          }
          this.write(startIdx === 0 ? value : value.substring(startIdx));
          this.write('"');
        }
      }
    }
  }
}

function newTagError(text: string) {
  return new Error('SsrError(tag): ' + text);
}
