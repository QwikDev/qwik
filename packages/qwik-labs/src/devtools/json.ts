// IMPORTANT: This file should have no external imports!!!

export function runQwikJsonDebug(window: Window, document: Document, debug: typeof qwikJsonDebug) {
  const parseQwikJSON = () => {
    const rawData = JSON.parse(document.querySelector('script[type="qwik/json"]')!.textContent!);
    const derivedFns =
      (
        document.querySelector('script[q\\:func="qwik/json"]') as any as {
          qFuncs: Function[];
        } | null
      )?.qFuncs || [];
    const debugData = debug(document, rawData, derivedFns);
    (window as any).qwikJson = debugData;
    console.log(debugData);
  };
  if (document.querySelector('script[type="qwik/json"]')) {
    parseQwikJSON();
  } else {
    document.addEventListener('DOMContentLoaded', parseQwikJSON);
  }
}

export function qwikJsonDebug(
  document: Document,
  qwikJson: QwikJson,
  derivedFns: Function[]
): DebugState {
  class Base {
    constructor(
      public __id: number,
      public __backRefs: any[] = []
    ) {}
  }

  class number_ extends Base {
    constructor(
      public __id: number,
      public __value: number
    ) {
      super(__id);
    }
  }

  class boolean_ extends Base {
    constructor(
      public __id: number,
      public __value: boolean
    ) {
      super(__id);
    }
  }

  class string_ extends Base {
    constructor(
      public __id: number,
      public __value: string
    ) {
      super(__id);
    }
  }

  class undefined_ extends Base {
    constructor(public __id: number) {
      super(__id);
    }
  }
  class Object_ extends Base {
    constructor(public __id: number) {
      super(__id);
    }
  }

  class Array_ extends Array implements Base {
    public __id: number;
    public __backRefs: any[] = [];
    constructor(__id: number) {
      super();
      this.__id = __id;
    }
  }

  class Task extends Base {
    constructor(
      public __id: number,
      public flags: string,
      public index: number,
      public obj: any
    ) {
      super(__id);
    }
  }

  class Listener {
    constructor(
      public event: string,
      public qrl: QRL
    ) {}
  }

  interface SubscriberEffect {}
  // interface StyleAppend {}
  // interface ProcessedJSXNode {}

  class QContext {
    element: Node | null = null;
    // refMap: any[] = [];
    // flags: string = '';
    props: Record<string, any> | null = null;
    componentQrl: QRL | null = null;
    listeners: Listener[] = [];
    seq: any[] | null = [];
    tasks: SubscriberEffect[] | null = null;
    contexts: Map<string, any> | null = null;
    // appendStyles: StyleAppend[] | null = null;
    scopeIds: string[] | null = null;
    // vdom: ProcessedJSXNode | null = null;
    // slots: ProcessedJSXNode[] | null = null;
    // dynamicSlots: QContext[] | null = null;
    // parent: QContext | null = null;
    // slotParent: QContext | null = null;
  }

  class QRefs {
    constructor(
      public element: Element,
      public refMap: any[],
      public listeners: Listener[]
    ) {}
  }

  class Component extends Base {
    constructor(
      public __id: number,
      public qrl: string
    ) {
      super(__id);
    }
  }

  class SignalWrapper extends Base {
    constructor(
      public __id: number,
      public id: string,
      public prop: string
    ) {
      super(__id);
    }
  }

  class DerivedSignal extends Base {
    constructor(
      public __id: number,
      public fn: Function,
      public args: any[]
    ) {
      super(__id);
    }
  }

  class QRL extends Base {
    constructor(
      public __id: number,
      public chunk: string,
      public symbol: string,
      public capture: any[]
    ) {
      super(__id);
    }
  }

  const nodeMap = getNodeMap();
  const refs: Record<string, QRefs> = {};
  const contexts: Record<string, QContext> = {};
  const objs: any[] = [];
  const subs: any[] = [];
  qwikJson.objs.forEach((_, idx) => getObject(idx, null));
  Object.keys(qwikJson.ctx).forEach((idx) => getContext(idx));
  Object.keys(qwikJson.refs).forEach((idx) => getRef(idx));
  qwikJson.subs;
  return {
    refs,
    ctx: contexts,
    objs,
    subs,
  };
  //////////////////////////////////////////////////////////////////////////////////
  function getContext(idx: string): any {
    const rawCtx = qwikJson.ctx[idx];
    const ctx = (contexts[idx] = new QContext());
    const node = (ctx.element = nodeMap.get(idx) || null);
    if (isElement(node)) {
      const rawRefs = qwikJson.refs[idx];
      const refMap = splitParse(rawRefs, ' ', (id) => getObject(id, node));
      ctx.listeners = getDomListeners(refMap, node);
    } else if (isComment(node)) {
      const attrs = new Map<string, string>();
      node.textContent!.split(' ').forEach((keyValue) => {
        const [key, value] = keyValue.split('=');
        attrs.set(key, value);
      });
      const sstyle = attrs.get('q:sstyle');
      if (sstyle) {
        ctx.scopeIds = sstyle.split('|');
      }
    }
    if (rawCtx.h) {
      const [qrl, props] = rawCtx.h.split(' ').map((h: string) => (h ? getObject(h, ctx) : null));
      ctx.componentQrl = qrl;
      ctx.props = props;
    }
    if (rawCtx.c) {
      const contexts = (ctx.contexts = new Map());
      for (const part of rawCtx.c.split(' ')) {
        const [key, value] = part.split('=');
        contexts.set(key, getObject(value, ctx));
      }
    }
    if (rawCtx.s) {
      ctx.seq = rawCtx.s.split(' ').map((s) => getObject(parseNumber(s), ctx));
    }
    if (rawCtx.w) {
      ctx.tasks = rawCtx.w.split(' ').map((s) => getObject(parseNumber(s), ctx));
    }
  }
  //////////////////////////////////////////////////////////////////////////////////
  function getRef(idx: string): any {
    const rawRefs = qwikJson.refs[idx];
    const node = nodeMap.get(idx) || null;
    if (isElement(node)) {
      const refMap = splitParse(rawRefs, ' ', (id) => getObject(id, node));
      const listeners = getDomListeners(refMap, node);
      refs[idx] = new QRefs(node, refMap, listeners);
    }
  }
  //////////////////////////////////////////////////////////////////////////////////
  function getObject(idx: number | string, parent: any): any {
    if (typeof idx == 'string') {
      if (idx.startsWith('#')) {
        const node = nodeMap.get(idx.substring(1));
        if (!(node as unknown as Base).__backRefs) {
          (node as unknown as Base).__backRefs = [];
        }
        if ((node as unknown as Base).__backRefs.indexOf(parent) === -1) {
          (node as unknown as Base).__backRefs.push(parent);
        }
        return node;
      }
      const num = parseNumber(idx);
      if (isNaN(num)) {
        throw new Error('Invalid index: ' + idx);
      }
      idx = num;
    }
    while (objs.length < idx) {
      objs.push(null);
    }
    let obj: undefined | Base = objs[idx];
    if (!obj) {
      const rawValue = qwikJson.objs[idx];
      let value: any = rawValue;
      if (typeof value === 'number') {
        obj = new number_(idx, value);
      } else if (typeof value === 'boolean') {
        obj = new boolean_(idx, value);
      } else if (typeof value === 'undefined') {
        obj = new undefined_(idx);
      } else if (typeof value === 'object') {
        obj = Array.isArray(value) ? new Array_(idx) : new Object_(idx);
        for (const key in value) {
          if (Object.prototype.hasOwnProperty.call(value, key)) {
            (obj as any)[key] = getObject(parseNumber(value[key]), obj);
          }
        }
      } else if (typeof rawValue === 'string') {
        const data = rawValue.substring(1);
        switch (rawValue.charCodeAt(0)) {
          case 0x01: // UndefinedSerializer, ///////// \u0001
            value = new undefined_(idx);
            break;
          case 0x02: // QRLSerializer, ////////////// \u0002
            const [chunk, symbol, ...capture] = data.split(/[#[\]\s]/);
            obj = new QRL(
              idx,
              chunk,
              symbol,
              capture.map((id) => getObject(parseNumber(id), parent))
            );
            break;
          case 0x03: // TaskSerializer, ///////////// \u0003
            const [flags, index, objId] = data.split(' ');
            const flagString = [
              parseNumber(flags) & (1 << 0) ? 'Visible' : '',
              parseNumber(flags) & (1 << 1) ? 'Task' : '',
              parseNumber(flags) & (1 << 2) ? 'Resource' : '',
              parseNumber(flags) & (1 << 3) ? 'Computed' : '',
              parseNumber(flags) & (1 << 4) ? 'Dirty' : '',
              parseNumber(flags) & (1 << 5) ? 'Cleanup' : '',
            ]
              .filter(Boolean)
              .join('|');
            obj = new Task(idx, flagString, parseNumber(index), getObject(objId, parent));
            break;
          case 0x12: // SignalSerializer, /////////// \u0012
            obj = getObject(data, parent);
            break;
          case 0x11: // DerivedSignalSerializer, //// \u0011
            const fnParts = data.split(' ');
            const fn = derivedFns[parseNumber(fnParts.pop()!.substring(1))];
            obj = new DerivedSignal(
              idx,
              fn,
              fnParts.map((id) => getObject(id, parent))
            );
            break;
          case 0x05: // URLSerializer, ////////////// \u0005
            obj = new URL(data) as any;
            (obj as Base).__id = idx;
            (obj as Base).__backRefs = [];
            break;
          case 0x10: // ComponentSerializer, //////// \u0010
            obj = new Component(idx, data);
            break;
          case 0x13: // SignalWrapperSerializer, //// \u0013
            const [id, prop] = data.split(' ');
            obj = new SignalWrapper(idx, id as any, prop);
            break;
          case 0x04: // ResourceSerializer, ///////// \u0004
          case 0x06: // DateSerializer, ///////////// \u0006
          case 0x16: // FormDataSerializer, ///////// \u0016
          case 0x07: // RegexSerializer, //////////// \u0007
          case 0x0e: // ErrorSerializer, //////////// \u000E
          case 0x15: // URLSearchParamsSerializer, // \u0015
          case 0x14: // NoFiniteNumberSerializer, /// \u0014
          case 0x17: // JSXNodeSerializer, ////////// \u0017
          case 0x18: // BigIntSerializer, /////////// \u0018
          case 0x19: // SetSerializer, ////////////// \u0019
          case 0x1a: // MapSerializer, ////////////// \u001a
          case 0x0f: // DocumentSerializer, ///////// \u000F
            throw new Error(
              'Not Implemented: ' +
                rawValue.charCodeAt(0).toString(16) +
                ' ' +
                JSON.stringify(rawValue)
            );
          // console.error((value = 'Not Implemented: ' + rawValue.charCodeAt(0)));
          // break;
          default:
            obj = new string_(idx, rawValue);
        }
      } else {
        throw new Error('Unexpected type: ' + JSON.stringify(rawValue));
      }
      objs[idx] = obj;
    }
    if (parent && obj && obj.__backRefs.indexOf(parent) === -1) {
      obj.__backRefs.push(parent);
    }
    return obj;
  }

  function getNodeMap() {
    const map = new Map<string, Node>();
    const walker = document.createTreeWalker(
      document.firstElementChild!,
      NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_ELEMENT
    );
    for (let node = walker.firstChild(); node !== null; node = walker.nextNode()) {
      const id = getId(node);
      id && map.set(id, node);
    }
    return map;
  }

  function getId(node: Node): string | null {
    if (isElement(node)) {
      return node.getAttribute('q:id');
    } else if (isComment(node)) {
      const text = node.nodeValue || '';
      if (text.startsWith('t=')) {
        return text.substring(2);
      } else if (text.startsWith('qv ')) {
        const parts = text.split(' ');
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          if (part.startsWith('q:id=')) {
            return part.substring(5);
          }
        }
      }
      return null;
    } else {
      throw new Error('Unexpected node type: ' + node.nodeType);
    }
  }

  function isElement(node: any): node is Element {
    return node && typeof node == 'object' && node.nodeType === Node.ELEMENT_NODE;
  }
  function isComment(node: any): node is Comment {
    return node && typeof node == 'object' && node.nodeType === Node.COMMENT_NODE;
  }

  function splitParse(text: string | null, sep: string, fn: (part: string) => any): any[] {
    if (!text) {
      return [];
    }
    return text.split(sep).map(fn);
  }

  function getDomListeners(refMap: any[], containerEl: Element): Listener[] {
    const attributes = containerEl.attributes;
    const listeners: Listener[] = [];
    for (let i = 0; i < attributes.length; i++) {
      const { name, value } = attributes.item(i)!;
      if (
        name.startsWith('on:') ||
        name.startsWith('on-window:') ||
        name.startsWith('on-document:')
      ) {
        const urls = value.split('\n');
        for (const url of urls) {
          const [chunk, symbol, capture] = url.split(/[#[\]]/);
          const qrl = new QRL(
            -1,
            chunk,
            symbol,
            (capture || '').split(' ').map((id) => refMap[parseInt(id, 10)])
          );
          listeners.push(new Listener(name, qrl));
        }
      }
    }
    return listeners;
  }

  function parseNumber(value: string) {
    return parseInt(value, 36);
  }
}

export interface QwikJson {
  refs: Record<string, string>;
  ctx: Record<
    string,
    {
      w?: string; // q:watches
      s?: string; // q:seq
      h?: string; // q:host
      c?: string; // q:context
    }
  >;
  objs: Array<QwikJsonObjsPrimitives | QwikJsonObjsObj>;
  subs: Array<Array<string>>;
}
export type QwikJsonObjsPrimitives = string | boolean | number | null;
export type QwikJsonObjsObj = Record<string, QwikJsonObjsPrimitives>;

export interface Base {
  __id: number;
  __backRefs: any[];
}

export interface QRL extends Base {
  chunk: string;
  symbol: string;
  capture: any[];
}

export interface QRefs {
  element: Element;
  refMap: any[];
  listeners: Listener[];
}

export interface Listener {
  event: string;
  qrl: QRL;
}

export interface SubscriberEffect {}

export interface QContext {
  element: Node | null;
  props: Record<string, any> | null;
  componentQrl: QRL | null;
  listeners: Listener[];
  seq: any[] | null;
  tasks: SubscriberEffect[] | null;
  contexts: Map<string, any> | null;
  scopeIds: string[] | null;
}

export interface DebugState {
  refs: Record<string, QRefs>;
  ctx: Record<string, QContext>;
  objs: any[];
  subs: unknown;
}

export type QwikType =
  | 'string'
  | 'number'
  | 'bigint'
  | 'boolean'
  | 'function'
  | 'undefined'
  | 'object'
  | 'symbol'
  // Qwik custom types
  | 'QRL'
  | 'Signal'
  | 'SignalWrapper'
  | 'Task'
  | 'Resource'
  | 'URL'
  | 'Date'
  | 'Regex'
  | 'Error'
  | 'DerivedSignal'
  | 'FormData'
  | 'URLSearchParams'
  | 'Component'
  | 'NoFiniteNumber'
  | 'JSXNode'
  | 'BigInt'
  | 'Set'
  | 'Map'
  | 'Document';
