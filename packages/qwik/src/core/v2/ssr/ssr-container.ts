/** @file Public APIs for the SSR */
import {
  SsrNode,
  type SSRContainer as ISSRContainer,
  type SsrAttrs,
  type StreamWriter,
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
import { throwErrorAndStop } from '../../util/log';
import { assertDefined, assertTrue } from '../../error/assert';
import {
  ELEMENT_ID,
  ELEMENT_KEY,
  ELEMENT_PROPS,
  ELEMENT_SEQ,
  OnRenderProp,
  QScopedStyle,
  QSlotRef,
} from '../../util/markers';
import { isDev } from '../../../build';

export function ssrCreateContainer(
  opts: {
    tagName?: string;
    writer?: StreamWriter;
  } = {}
): SSRContainer {
  return new SSRContainer({
    tagName: opts.tagName || 'div',
    writer: opts.writer || new StringBufferWriter(),
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

  private currentElementFrame: ContainerElementFrame | null = null;
  /**
   * Current element index.
   *
   * This number must match the depth-first traversal of the DOM elements as returned by the
   * https://developer.mozilla.org/en-US/docs/Web/API/TreeWalker
   */
  private depthFirstElementCount: number = -1;
  private vNodeData: VNodeData[] = [];

  constructor(opts: Required<Required<Parameters<typeof ssrCreateContainer>>[0]>) {
    this.tag = opts.tagName;
    this.writer = opts.writer;
    this.serializationCtx = createSerializationContext(SsrNode, null, this.writer);
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
      null,
      'q:manifest-hash',
      'dev',
    ]);
  }

  closeContainer(): void {
    this.closeElement();
  }

  openElement(tag: string, attrs: SsrAttrs) {
    this.pushFrame(tag, this.depthFirstElementCount++, true);
    this.write('<');
    this.write(tag);
    this.writeAttrs(attrs);
    this.write('>');
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
  }

  openFragment(attrs: SsrAttrs) {
    vNodeData_openFragment(this.currentElementFrame!.vNodeData, attrs);
  }

  closeFragment() {
    vNodeData_closeFragment(this.currentElementFrame!.vNodeData);
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
  }

  addRoot(obj: any): any {
    return this.serializationCtx.$addRoot$(obj);
  }

  getLastNode(): SsrNode {
    return vNodeData_createSsrNodeReference(
      this.currentElementFrame!.vNodeData,
      this.depthFirstElementCount
    );
  }

  ////////////////////////////////////

  emitContainerData() {
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
                  const value = fragmentAttrs[i++] as string;
                  switch (key) {
                    case ELEMENT_ID:
                      this.write('=');
                      break;
                    case QSlotRef:
                      this.write('?');
                      break;
                    case ELEMENT_KEY:
                      this.write('@');
                      break;
                    case QScopedStyle:
                      this.write(';');
                      break;
                    case OnRenderProp:
                      this.write('<');
                      break;
                    case ELEMENT_PROPS:
                      this.write('>');
                      break;
                    case ELEMENT_SEQ:
                      this.write('[');
                      break;
                    default:
                      throwErrorAndStop('Unsupported fragment attribute: ' + key);
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

