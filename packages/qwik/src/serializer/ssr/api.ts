/** @file Public APIs for the SSR */
import type { StreamWriter } from '../../server/types';
import { type Stringifiable } from '../shared-types';
import type { SSRContainer as ISSRContainer, SsrAttrs } from './types';
import {
  CLOSE_FRAGMENT,
  OPEN_FRAGMENT,
  vNodeData_addTextSize,
  vNodeData_closeFragment,
  vNodeData_incrementElementCount,
  vNodeData_openFragment,
  VNodeDataFlag,
  type VNodeData,
} from './vnode-data';
import {
  createSerializationContext,
  serialize,
  type SerializationContext,
} from '../shared-serialialization';

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
  parent: ContainerElementFrame | null;
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
  private currentElementFrame: ContainerElementFrame | null = null;
  /**
   * Current element index.
   *
   * This number must match the depth-first traversal of the DOM elements as returned by the
   * https://developer.mozilla.org/en-US/docs/Web/API/TreeWalker
   */
  private depthFirstElementCount: number = 0;
  private vNodeData: VNodeData[] = [];

  private serializationContext: SerializationContext;

  constructor(opts: Required<Required<Parameters<typeof ssrCreateContainer>>[0]>) {
    this.tag = opts.tagName;
    this.writer = opts.writer;
    this.serializationContext = createSerializationContext(SsrNode, null, this.writer);
  }

  openContainer() {
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
    this.emitStateData();
    this.emitVNodeData();
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
    this.write('</');
    this.write(this.popFrame().elementName);
    this.write('>');
    // Keep track of number of elements.
    if (this.currentElementFrame) {
      vNodeData_incrementElementCount(this.currentElementFrame!.vNodeData);
    }
  }

  openVNode() {
    vNodeData_openFragment(this.currentElementFrame!.vNodeData);
  }

  closeVNode() {
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
    return this.serializationContext.$addRoot$(obj);
  }

  ////////////////////////////////////

  /**
   * Serialize the vNodeData into a string and emit it as a script tag.
   *
   * - Encoding:
   * - Alphabetical characters are text node lengths.
   * - Numbers are element counts.
   * - `{` is start of virtual node.
   * - `}` is end of virtual node.
   * - `~` Store as reference for data deserialization.
   * - `!"#$%&'()*+'-./` are separators (sequential characters in ASCII table)
   *
   *   - `!` is vNodeData separator skipping 0. (ie next vNode)
   *   - `"` is vNodeData separator skipping 1.
   *   - `#` is vNodeData separator skipping 2.
   *   - `$` is vNodeData separator skipping 4.
   *   - `%` is vNodeData separator skipping 8.
   *   - `&` is vNodeData separator skipping 16.
   *   - `'` is vNodeData separator skipping 32.
   *   - `(` is vNodeData separator skipping 64.
   *   - `)` is vNodeData separator skipping 128.
   *   - `*` is vNodeData separator skipping 256.
   *   - `+` is vNodeData separator skipping 512.
   *   - `'` is vNodeData separator skipping 1024.
   *   - `.` is vNodeData separator skipping 2048.
   *   - `/` is vNodeData separator skipping 4096.
   *
   * NOTE: Not every element will need vNodeData. So we need to encode how many elements should be
   * skipped. By choosing different separators we can encode different numbers of elements to skip.
   */
  emitVNodeData() {
    this.openElement('script', ['type', 'qwik/vnode']);
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
        for (let i = 1; i < vNode.length; i++) {
          const value = vNode[i];
          if (value === OPEN_FRAGMENT) {
            this.write('{');
          } else if (value === CLOSE_FRAGMENT) {
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
    this.closeElement();
  }

  private emitStateData() {
    this.openElement('script', ['type', 'qwik/state']);
    serialize(this.serializationContext);
    this.closeElement();
  }

  private emitVNodeSeparators(lastSerializedIdx: number, elementIdx: number): number {
    let skipCount = elementIdx - lastSerializedIdx;
    while (skipCount != 0) {
      if (skipCount >= 4096) {
        this.write('/');
        skipCount -= 4096;
      } else {
        skipCount & 2048 && this.write('.');
        skipCount & 1024 && this.write('-');
        skipCount & 512 && this.write('+');
        skipCount & 256 && this.write('*');
        skipCount & 128 && this.write(')');
        skipCount & 64 && this.write('(');
        skipCount & 32 && this.write("'");
        skipCount & 16 && this.write('&');
        skipCount & 8 && this.write('%');
        skipCount & 4 && this.write('$');
        skipCount & 2 && this.write('"');
        skipCount & 1 && this.write('!');
        skipCount = 0;
      }
    }
    return elementIdx;
  }

  private pushFrame(tag: string, depthFirstElementIdx: number, isElement: boolean) {
    const frame: ContainerElementFrame = {
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
        if (value !== null) {
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

export function toSsrAttrs(record: Record<string, Stringifiable>): SsrAttrs {
  const ssrAttrs: SsrAttrs = [];
  for (const key in record) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      ssrAttrs.push(key, String(record[key]));
    }
  }
  return ssrAttrs;
}

const ALPHANUMERIC: string[] = [];
const A = 'A'.charCodeAt(0);
const a = 'a'.charCodeAt(0);
const Z = 'Z'.charCodeAt(0);
const AZ = Z - A + 1;
export function encodeAsAlphanumeric(value: number): string {
  while (ALPHANUMERIC.length <= value) {
    let value = ALPHANUMERIC.length;
    let text = '';
    do {
      text = String.fromCharCode((text.length === 0 ? A : a) + (value % AZ)) + text;
      value = Math.floor(value / AZ);
    } while (value !== 0);
    ALPHANUMERIC.push(text);
  }
  return ALPHANUMERIC[value];
}

/**
 * Server has no DOM, so we need to create a fake node to represent the DOM for serialization
 * purposes.
 *
 * Once deserialized the client, they will be turned to actual DOM nodes.
 */
export class SsrNode {
  static ELEMENT_NODE = 1;
  static TEXT_NODE = 3;
  static DOCUMENT_NODE = 9;

  nodeType: number;
  constructor(nodeType: number) {
    this.nodeType = nodeType;
  }
}
