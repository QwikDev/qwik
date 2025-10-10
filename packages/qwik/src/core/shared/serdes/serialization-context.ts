import type { VNodeData } from '../../../server/vnode-data';
import type { _EFFECT_BACK_REF } from '../../internal';
import type { EffectProperty, EffectSubscription } from '../../reactive-primitives/types';
import type { ISsrNode, StreamWriter, SymbolToChunkResolver } from '../../ssr/ssr-types';
import type { ResourceReturnInternal } from '../../use/use-resource';
import { qError, QError } from '../error/error';
import type { QRL } from '../qrl/qrl.public';
import type { ObjToProxyMap } from '../types';
import { serialize } from './serialize';

/** A selection of attributes of the real thing */
type SsrNode = {
  id: string;
  children: ISsrNode[] | null;
  vnodeData: VNodeData;
  [_EFFECT_BACK_REF]: Map<EffectProperty | string, EffectSubscription> | null;
};
type DomRef = {
  $ssrNode$: SsrNode;
};
type SeenRef = {
  $parent$: unknown | null;
  $index$: number;
  $rootIndex$: number;
};

export let isDomRef = (obj: unknown): obj is DomRef => false;

export interface SerializationContext {
  $serialize$: () => void;

  $symbolToChunkResolver$: SymbolToChunkResolver;

  /**
   * Map from object to parent and index reference.
   *
   * If object is found in `objMap` will return the parent reference and index path.
   *
   * `objMap` return:
   *
   * - `{ parent, index }` - The parent object and the index within that parent.
   * - `undefined` - Object has not been seen yet.
   */
  $wasSeen$: (obj: unknown) => SeenRef | undefined;

  $hasRootId$: (obj: unknown) => number | undefined;

  /**
   * Root objects which need to be serialized.
   *
   * Roots are entry points into the object graph. Typically the roots are held by the listeners.
   *
   * Returns a path string representing the path from roots through all parents to the object.
   * Format: "3 2 0" where each number is the index within its parent, from root to leaf.
   */
  $addRoot$: (obj: unknown, parent?: unknown) => number;

  /**
   * Get root path of the object without creating a new root.
   *
   * This is used during serialization, as new roots can't be created during serialization.
   *
   * The function throws if the root was not found.
   */
  $addRootPath$: (obj: any) => string | number;

  $seen$: (obj: unknown, parent: unknown | null, index: number) => void;

  $roots$: unknown[];
  $objectPathStringCache$: Map<unknown, string | number>;

  $addSyncFn$($funcStr$: string | null, argsCount: number, fn: Function): number;

  $isSsrNode$: (obj: unknown) => obj is SsrNode;
  $isDomRef$: (obj: unknown) => obj is DomRef;

  $writer$: StreamWriter;
  $syncFns$: string[];

  $eventQrls$: Set<QRL>;
  $eventNames$: Set<string>;
  $resources$: Set<ResourceReturnInternal<unknown>>;
  $renderSymbols$: Set<string>;
  $storeProxyMap$: ObjToProxyMap;

  $getProp$: (obj: any, prop: string) => any;
  $setProp$: (obj: any, prop: string, value: any) => void;
}

export const createSerializationContext = (
  /**
   * Node constructor, for instanceof checks.
   *
   * A node constructor can be null. For example on the client we can't serialize DOM nodes as
   * server will not know what to do with them.
   */
  NodeConstructor: {
    new (...rest: any[]): { __brand__: 'SsrNode' };
  } | null,
  /** DomRef constructor, for instanceof checks. */
  DomRefConstructor: {
    new (...rest: any[]): { __brand__: 'DomRef' };
  } | null,
  symbolToChunkResolver: SymbolToChunkResolver,
  getProp: (obj: any, prop: string) => any,
  setProp: (obj: any, prop: string, value: any) => void,
  storeProxyMap: ObjToProxyMap,
  writer?: StreamWriter
): SerializationContext => {
  if (!writer) {
    const buffer: string[] = [];
    writer = {
      write: (text: string) => buffer.push(text),
      toString: () => buffer.join(''),
    } as StreamWriter;
  }
  const seenObjsMap = new Map<unknown, SeenRef>();
  const objectPathStringCache = new Map<unknown, string | number>();
  const syncFnMap = new Map<string, number>();
  const syncFns: string[] = [];
  const roots: unknown[] = [];

  const $wasSeen$ = (obj: unknown) => seenObjsMap.get(obj);
  const $seen$ = (obj: unknown, parent: unknown | null, index: number) => {
    return seenObjsMap.set(obj, { $parent$: parent, $index$: index, $rootIndex$: -1 });
  };

  const $addRootPath$ = (obj: unknown) => {
    const rootPath = objectPathStringCache.get(obj);
    if (rootPath) {
      return rootPath;
    }
    const seen = seenObjsMap.get(obj);
    if (!seen) {
      throw qError(QError.serializeErrorMissingRootId, [obj]);
    }
    const path = [];
    let current: typeof seen | undefined = seen;

    // Traverse up through parent references to build a path
    while (current && current.$index$ >= 0) {
      path.unshift(current.$index$);
      if (typeof current.$parent$ !== 'object' || current.$parent$ === null) {
        break;
      }
      current = seenObjsMap.get(current.$parent$);
    }

    const pathStr = path.length > 1 ? path.join(' ') : path.length ? path[0] : seen.$index$;
    objectPathStringCache.set(obj, pathStr);
    return pathStr;
  };

  const $addRoot$ = (obj: any, parent: unknown = null) => {
    let seen = seenObjsMap.get(obj);
    if (!seen) {
      const rootIndex = roots.length;
      seen = { $parent$: parent, $index$: rootIndex, $rootIndex$: rootIndex };
      seenObjsMap.set(obj, seen);
      roots.push(obj);
    } else if (seen.$rootIndex$ === -1) {
      seen.$rootIndex$ = roots.length;
      roots.push(obj);
    }
    $addRootPath$(obj);
    return seen.$rootIndex$;
  };

  const isSsrNode = (
    NodeConstructor ? (obj) => obj instanceof NodeConstructor : ((() => false) as any)
  ) as (obj: unknown) => obj is SsrNode;

  isDomRef = (
    DomRefConstructor ? (obj) => obj instanceof DomRefConstructor : ((() => false) as any)
  ) as (obj: unknown) => obj is DomRef;

  return {
    async $serialize$(): Promise<void> {
      return await serialize(this);
    },
    $isSsrNode$: isSsrNode,
    $isDomRef$: isDomRef,
    $symbolToChunkResolver$: symbolToChunkResolver,
    $wasSeen$,
    $roots$: roots,
    $seen$,
    $hasRootId$: (obj: any) => {
      const id = seenObjsMap.get(obj);
      return id?.$parent$ === null ? id.$index$ : undefined;
    },
    $addRoot$,
    $addRootPath$,
    $syncFns$: syncFns,
    $addSyncFn$: (funcStr: string | null, argCount: number, fn: Function) => {
      const isFullFn = funcStr == null;
      if (isFullFn) {
        funcStr = ((fn as any).serialized as string) || fn.toString();
      }
      let id = syncFnMap.get(funcStr!);
      if (id === undefined) {
        id = syncFns.length;
        syncFnMap.set(funcStr!, id);
        if (isFullFn) {
          syncFns.push(funcStr!);
        } else {
          let code = '(';
          for (let i = 0; i < argCount; i++) {
            code += (i == 0 ? 'p' : ',p') + i;
          }
          syncFns.push((code += ')=>' + funcStr));
        }
      }
      return id;
    },
    $writer$: writer,
    $eventQrls$: new Set<QRL>(),
    $eventNames$: new Set<string>(),
    $resources$: new Set<ResourceReturnInternal<unknown>>(),
    $renderSymbols$: new Set<string>(),
    $storeProxyMap$: storeProxyMap,
    $getProp$: getProp,
    $setProp$: setProp,
    $objectPathStringCache$: objectPathStringCache,
  };
};
