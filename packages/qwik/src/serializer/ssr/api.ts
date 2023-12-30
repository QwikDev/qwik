/** @file Public APIs for the SSR */
import { isDev } from '@builder.io/qwik/build';
import { isQrl, type QRLInternal } from '../../core/qrl/qrl-class';
import type { StreamWriter } from '../../server/types';
import { QRL_RUNTIME_CHUNK, SerializationConstant, type Stringifiable } from '../shared-types';
import type { SSRContainer as ISSRContainer, SsrAttrs } from './types';
import {
  CLOSE_FRAGMENT,
  OPEN_FRAGMENT,
  VNodeDataFlag,
  vNodeData_addTextSize,
  vNodeData_closeFragment,
  vNodeData_incrementElementCount,
  vNodeData_openFragment,
  type VNodeData,
} from './vnode-data';
import { isQwikComponent } from '../../core/component/component.public';
import { SERIALIZABLE_STATE } from '../../core/container/serializers';
import { type } from 'os';
import { assertTrue } from '../../core/error/assert';
import type { QRL } from '../../core/qrl/qrl.public';

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
    }
    return id;
  }

  ////////////////////////////////////

  private breakCircularDependencies(rootObj: any) {
    console.log('BREAK', rootObj);
    const discoveredValues: object[] = [rootObj];
    let count = 100;
    while (discoveredValues.length) {
      if (count-- < 0) {
        throw new Error('INFINITE LOOP');
      }
      const obj = discoveredValues.pop();
      if (shouldTrackObj(obj)) {
        const isRoot = obj === rootObj;
        // For root objects we pretend we have not seen them to force scan.
        const id = this.objMap.get(obj);
        console.log('PROCESS', obj, id);
        if (id === undefined || isRoot) {
          // Object has not been seen yet, must scan content
          // But not for root.
          !isRoot && this.objMap.set(obj, Number.MIN_SAFE_INTEGER);
          if (obj instanceof Set) {
            obj.forEach((v) => discoveredValues.push(v));
          } else if (obj instanceof Map) {
            obj.forEach((v, k) => {
              discoveredValues.push(v);
              discoveredValues.push(k);
            });
          } else {
            for (const key in obj) {
              if (Object.prototype.hasOwnProperty.call(obj, key)) {
                discoveredValues.push((obj as any)[key]);
              }
            }
          }
        } else if (id === Number.MIN_SAFE_INTEGER) {
          // We are seeing this object second time => promoted it.
          this.objMap.set(obj, this.objRoots.length);
          this.objRoots.push(obj);
          // we don't need to scan the children, since we have already seen them.
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

  private emitStateData() {
    this.openElement('script', ['type', 'qwik/state']);
    for (let i = 0; i < this.objRoots.length; i++) {
      this.breakCircularDependencies(this.objRoots[i]);
    }
    const json = new JSONStreamingSerializer(this.writer, this.objMap, this.getObjectId.bind(this));
    json.writeValue(this.objRoots);
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

/**
 * Tracking all objects in the map would be expensive. For this reason we only track some of the
 * objects.
 *
 * For example we skip:
 *
 * - Short strings
 * - Anything which is not an object. (ie. number, boolean, null, undefined)
 *
 * @param obj
 * @returns
 */
function shouldTrackObj(obj: any) {
  return (
    (typeof obj === 'object' && obj !== null) ||
    // THINK: Not sure if we need to keep track of functions (QRLs) Let's skip them for now.
    // and see if we have a test case which requires them.
    // typeof obj === 'function' ||
    (typeof obj === 'string' && obj.length > 10)
  );
}

/**
 * When serializing the object we need check if it is URL, RegExp, Map, Set, etc. This is time
 * consuming. So if we could know that this is a basic object literal we could skip the check, and
 * only run the checks for objects which are not object literals.
 *
 * So this function is here for performance to short circuit many checks later.
 *
 * @param obj
 */
function isObjectLiteral(obj: any) {
  // We are an object literal if:
  // - we are a direct instance of object OR
  // - we are an array
  // In all other cases it is a subclass which requires more checks.
  return Object.getPrototypeOf(obj) === Object.prototype || Array.isArray(obj);
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

class JSONStreamingSerializer {
  /// For root array only, what is the index of current item being serialized
  /// We need this information because for root array we don't create references, we actually serialize the value.
  /// How deeply are we nested with objects and arrays
  private depth = -1;
  constructor(
    private writer: StreamWriter,
    private objMap: Map<any, number>,
    private getObjectId: (obj: any) => number
  ) {}

  writeString(text: string) {
    text = JSON.stringify(text);
    let angleBracketIdx: number = -1;
    let lastIdx = 0;
    while ((angleBracketIdx = text.indexOf('</', lastIdx)) !== -1) {
      this.writer.write(text.substring(lastIdx, angleBracketIdx));
      this.writer.write('<\\/');
      lastIdx = angleBracketIdx + 2;
    }
    this.writer.write(lastIdx === 0 ? text : text.substring(lastIdx));
  }

  writeValue(value: any) {
    if (typeof value === 'bigint') {
      return this.writeString(SerializationConstant.BigInt_CHAR + value.toString());
    } else if (typeof value === 'boolean') {
      this.writer.write(String(value));
    } else if (typeof value === 'function') {
      if (isQrl(value)) {
        this.writeString(SerializationConstant.QRL_CHAR + qrlToString(value, this.getObjectId));
      } else if (isQwikComponent(value)) {
        const [qrl]: [QRLInternal] = (value as any)[SERIALIZABLE_STATE];
        this.writeString(SerializationConstant.Component_CHAR + qrlToString(qrl, this.getObjectId));
      } else {
        // throw new Error('implement: ' + value);
        console.log('implement:', new Error(value));
        this.writeString(value.toString());
      }
    } else if (typeof value === 'number') {
      if (Number.isNaN(value)) {
        return this.writeString(SerializationConstant.NaN_CHAR);
      } else {
        this.writer.write(String(value));
      }
    } else if (typeof value === 'object') {
      this.depth++;
      if (value === null) {
        this.writer.write('null');
      } else if (isObjectLiteral(value)) {
        // For root objects we need to serialize them regardless if we have seen them before.
        const seen = this.depth <= 1 ? undefined : this.objMap.get(value);
        if (seen === undefined || seen === Number.MIN_SAFE_INTEGER) {
          // we have not seen it or only seen it once, serialize normally
          if (Array.isArray(value)) {
            // Serialize as array.
            this.writer.write('[');
            for (let i = 0; i < value.length; i++) {
              if (i !== 0) {
                this.writer.write(',');
              }
              this.writeValue(value[i]);
            }
            this.writer.write(']');
          } else {
            // Serialize as object.
            this.writer.write('{');
            let delimiter = false;
            for (const key in value) {
              if (Object.prototype.hasOwnProperty.call(value, key)) {
                delimiter && this.writer.write(',');
                this.writeString(key);
                this.writer.write(':');
                this.writeValue(value[key]);
                delimiter = true;
              }
            }
            this.writer.write('}');
          }
        } else {
          // We have seen it more than once, serialize as reference.
          assertTrue(seen >= 0, 'seen >= 0');
          this.writeString(SerializationConstant.REFERENCE_CHAR + seen);
        }
      } else if (value instanceof URL) {
        this.writeString(SerializationConstant.URL_CHAR + value.href);
      } else if (value instanceof Date) {
        this.writeString(SerializationConstant.Date_CHAR + value.toJSON());
      } else if (value instanceof RegExp) {
        this.writeString(SerializationConstant.Regex_CHAR + value.toString());
      } else if (value instanceof Error) {
        const errorProps = Object.assign(
          {
            message: value.message,
            /// In production we don't want to leak the stack trace.
            stack: isDev ? value.stack : '<hidden>',
          },
          value
        );
        const id = this.getObjectId(errorProps);
        this.writeString(SerializationConstant.Error_CHAR + id);
      } else if (value instanceof SsrNode) {
        const type = value.nodeType;
        if (type === SsrNode.ELEMENT_NODE) {
          throw new Error('implement: ' + type);
        } else if (type === SsrNode.TEXT_NODE) {
          throw new Error('implement: ' + type);
        } else if (type === SsrNode.DOCUMENT_NODE) {
          this.writeString(SerializationConstant.Document_CHAR);
        } else {
          throw new Error('implement: ' + type);
        }
      } else if (value instanceof URLSearchParams) {
        this.writeString(SerializationConstant.URLSearchParams_CHAR + value.toString());
      } else if (value instanceof Set) {
        this.writeString(
          SerializationConstant.Set_CHAR + this.getObjectId(Array.from(value.values()))
        );
      } else if (value instanceof Map) {
        const tuples: Array<[any, any]> = [];
        value.forEach((v, k) => tuples.push([k, v]));
        this.writeString(SerializationConstant.Map_CHAR + this.getObjectId(tuples));
      } else {
        throw new Error('implement: ' + value);
      }
      this.depth--;
    } else if (typeof value === 'string') {
      let seenIdx: number | undefined;
      if (
        shouldTrackObj(value) &&
        (seenIdx = this.depth <= 0 ? undefined : this.objMap.get(value)) !== undefined &&
        seenIdx >= 0
      ) {
        assertTrue(seenIdx >= 0, 'seenIdx >= 0');
        return this.writeString(SerializationConstant.REFERENCE_CHAR + seenIdx);
      } else if (value.length > 0 && value.charCodeAt(0) < SerializationConstant.LAST_VALUE) {
        // We need to escape the first character, because it is a special character.
        this.writeString(SerializationConstant.String_CHAR + value);
      } else {
        this.writeString(value);
      }
    } else if (typeof value === 'symbol') {
      throw new Error('implement');
    } else if (typeof value === 'undefined') {
      this.writeString(SerializationConstant.UNDEFINED_CHAR);
    } else {
      throw new Error('Unknown type: ' + typeof value);
    }
  }
}

function qrlToString(value: QRLInternal, getObjectId: (obj: any) => number) {
  if (isDev && !value.$chunk$) {
    let backChannel: Map<string, Function> = (globalThis as any)[QRL_RUNTIME_CHUNK];
    if (!backChannel) {
      backChannel = (globalThis as any)[QRL_RUNTIME_CHUNK] = new Map();
    }
    backChannel.set(value.$symbol$, (value as any)._devOnlySymbolRef);
  }
  const qrlString =
    (value.$chunk$ || QRL_RUNTIME_CHUNK) +
    '#' +
    value.$symbol$ +
    (value.$captureRef$ ? `[${value.$captureRef$.map(getObjectId).join(' ')}]` : '');
  return qrlString;
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