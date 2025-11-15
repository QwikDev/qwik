import type { VNodeData } from '../../../server/vnode-data';
import type { _EFFECT_BACK_REF } from '../../internal';
import type { EffectProperty, EffectSubscription } from '../../reactive-primitives/types';
import type { ISsrNode, StreamWriter, SymbolToChunkResolver } from '../../ssr/ssr-types';
import type { ResourceReturnInternal } from '../../use/use-resource';
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

/** Stores the location of an object. If no parent, it's a root. */
export type SeenRef = {
  $index$: number;
  $parent$?: SeenRef | null;
};

export let isDomRef = (obj: unknown): obj is DomRef => false;

/**
 * A back reference to a previously serialized object. Before deserialization, all backrefs are
 * swapped with their original locations.
 */
export class BackRef {
  constructor(
    /** The path from root to the original object */
    public $path$: string
  ) {}
}

interface AddRootFn {
  (obj: unknown, returnRef?: never): number;
  (obj: unknown, returnRef: true): SeenRef;
}
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
  getSeenRef: (obj: unknown) => SeenRef | undefined;

  /** Returns the root index of the object, if it is a root. Otherwise returns undefined. */
  $hasRootId$: (obj: unknown) => number | undefined;

  /**
   * Root objects which need to be serialized.
   *
   * Roots are entry points into the object graph. Typically the roots are held by the listeners.
   *
   * Returns the index of the root object.
   */
  $addRoot$: AddRootFn;

  /** Mark an object as seen during serialization. This is used to handle backreferences and cycles */
  $markSeen$: (obj: unknown, parent: SeenRef | undefined, index: number) => SeenRef;

  $roots$: unknown[];

  $promoteToRoot$: (ref: SeenRef, index?: number) => void;

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
  const syncFnMap = new Map<string, number>();
  const syncFns: string[] = [];
  const roots: unknown[] = [];

  const getSeenRef = (obj: unknown) => seenObjsMap.get(obj);
  const $markSeen$ = (obj: unknown, parent: SeenRef | undefined, index: number) => {
    const ref = { $index$: index, $parent$: parent };
    seenObjsMap.set(obj, ref);
    return ref;
  };

  /**
   * Returns a path string representing the path from roots through all parents to the object.
   * Format: "3 2 0" where each number is the index within its parent, from root to leaf.
   */
  const $getObjectPath$ = (ref: SeenRef) => {
    // Traverse up through parent references to build a path
    const path = [];
    while (ref.$parent$) {
      path.unshift(ref.$index$);
      ref = ref.$parent$;
    }
    // Now we are at root, but it could be a backref
    path.unshift(ref.$index$);

    return path.join(' ');
  };

  const $promoteToRoot$ = (ref: SeenRef, index?: number) => {
    const path = $getObjectPath$(ref) as string;
    if (index === undefined) {
      index = roots.length;
    }
    roots[index] = new BackRef(path);
    ref.$parent$ = null;
    ref.$index$ = index;
  };

  const $addRoot$ = ((obj: any, returnRef?: boolean) => {
    let seen = seenObjsMap.get(obj);
    let index: number;

    if (!seen) {
      index = roots.length;
      seen = {
        $index$: index,
        // TODO benchmark with and without $parent$
        // $parent$: undefined
      };
      seenObjsMap.set(obj, seen);
      roots.push(obj);
    } else {
      if (seen.$parent$) {
        $promoteToRoot$(seen);
      }
      index = seen.$index$;
    }

    return returnRef ? seen : index;
  }) as AddRootFn;

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
    getSeenRef,
    $roots$: roots,
    $markSeen$,
    $hasRootId$: (obj: any) => {
      const id = seenObjsMap.get(obj);
      return id && (id.$parent$ ? undefined : id.$index$);
    },
    $promoteToRoot$,
    $addRoot$,
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
  };
};
