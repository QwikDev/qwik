/** @file Public APIs for the SSR */
import { isDev } from '@builder.io/qwik/build';
import type { StreamWriter } from '../../server/types';
import type { Stringifiable } from '../shared-types';
import type { SSRContainer as ISSRContainer, SsrAttrs } from './types';
import {
  VNodeDataFlag,
  vNodeData_incrementElementCount,
  type VNodeData,
  vNodeData_addTextSize,
  OPEN_FRAGMENT,
  CLOSE_FRAGMENT,
  vNodeData_openFragment,
  vNodeData_closeFragment,
} from './vnode-data';

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

  /**
   * Root objects which need to be serialized.
   *
   * Roots are entry points into the object graph. Typically the roots are held by the listeners.
   * Because objects can share child objects, we need a way to create secondary roots to share those
   * objects.
   */
  private objRoots: any[] = [];

  /**
   * Map from object to root index.
   *
   * If object is found in `objMap` will return the index of the object in the `objRoots` or
   * `secondaryObjRoots`.
   *
   * `objMap` return:
   *
   * - `>=0` - index of the object in `objRoots`.
   * - `Number.MIN_SAFE_INTEGER` - object has been seen, only once, and therefor does not need to be
   *   promoted into a root yet.
   */
  private objMap = new Map<any, number>();

  constructor(opts: Required<Required<Parameters<typeof ssrCreateContainer>>[0]>) {
    this.tag = opts.tagName;
    this.writer = opts.writer;
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

  getObjectId(obj: any): any {
    let id = this.objMap.get(obj);
    if (id === undefined || id === Number.MIN_SAFE_INTEGER) {
      id = this.objRoots.length;
      this.objRoots.push(obj);
      this.objMap.set(obj, id);
      this.checkIfChildObjectsNeedToBePromoted(obj);
    }
    return id;
  }

  ////////////////////////////////////

  private checkIfChildObjectsNeedToBePromoted(obj: any) {
    if (typeof obj !== 'object' || obj === null) {
      return;
    }
    const queue: object[] = [];
    // initialize the queue with the children of the object.
    // (skipping the current objects as it has already been promoted)
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const child = obj[key];
        if (shouldTrackObj(child)) {
          queue.push(child);
        }
      }
    }
    while (queue.length) {
      const obj = queue.pop();
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const child = (obj as any)[key];
          if (shouldTrackObj(child)) {
            const id = this.objMap.get(child);
            if (id === undefined) {
              // Object has not been seen yet.
              this.objMap.set(child, Number.MIN_SAFE_INTEGER);
              queue.push(child);
            } else if (id === Number.MIN_SAFE_INTEGER) {
              // We are seeing this object second time => promoted it.
              this.objMap.set(child, this.objRoots.length);
              this.objRoots.push(child);
              // we don't need to scan the children, since we have already seen them.
            }
          }
        }
      }
    }
  }

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

  emitStateData() {
    this.openElement('script', ['type', 'qwik/state']);
    this.write('[');
    for (let i = 0; i < this.objRoots.length; i++) {
      if (i !== 0) {
        this.write(',');
      }
      const obj = this.objRoots[i];
      if (isDev) {
        this.write('\n');
      }
      const objMap = this.objMap;
      this.write(
        JSON.stringify(obj, (_: string, value: any) => {
          if (value === undefined) {
            return `\u0001`;
          } else if (value !== obj && shouldTrackObj(value)) {
            const id = objMap.get(value);
            if (id !== undefined && id !== Number.MIN_SAFE_INTEGER) {
              return '\u0010' + id;
            }
          }
          return value;
        })
      );
    }
    this.write(isDev ? '\n]' : ']');
    this.closeElement();
  }

  emitVNodeSeparators(lastSerializedIdx: number, elementIdx: number): number {
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

function shouldTrackObj(obj: any) {
  return (typeof obj === 'object' && obj !== null) || (typeof obj === 'string' && obj.length > 10);
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


