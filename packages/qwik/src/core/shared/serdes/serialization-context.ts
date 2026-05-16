import type { VNodeData } from '../../../server/vnode-data';
import type { _EFFECT_BACK_REF } from '../../internal';
import type { EffectProperty, EffectSubscription } from '../../reactive-primitives/types';
import type { ISsrNode, SSRInternalStreamWriter, SymbolToChunkResolver } from '../../ssr/ssr-types';
import { createStringStreamWriter } from '../../ssr/stream-writer';
import type { QRL } from '../qrl/qrl.public';
import type { ObjToProxyMap } from '../types';
import type { ValueOrPromise } from '../utils/types';
import { Serializer } from './serialize';

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
export class SerializationBackRef {
  constructor(
    /** The path from root to the original object */
    public $path$: number[]
  ) {}
}

interface AddRootFn {
  (obj: unknown, returnRef?: never): number;
  (obj: unknown, returnRef: true): SeenRef;
}
export interface SerializationContext {
  $serialize$: () => ValueOrPromise<void>;
  $serializePatch$: (
    rootStart: number,
    rootIds: number[],
    extraRootId?: number | string | number[]
  ) => ValueOrPromise<void>;

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
  $addDuplicateRoot$: (obj: unknown) => SeenRef;
  $commitRoot$: (root: unknown, obj: unknown) => number;
  $formatLocalRef$: (id: number) => number;

  /** Mark an object as seen during serialization. This is used to handle backreferences and cycles */
  $markSeen$: (obj: unknown, parent: SeenRef | undefined, index: number) => SeenRef;

  $roots$: unknown[];
  $rootObjs$: unknown[];
  $onAddRoot$?: (id: number, root: unknown, obj: unknown) => void;
  $forwardRefOffset$: number;
  $serializedRootCount$: number;
  $serializedForwardRefCount$: number;
  $rootStateRootCount$: number;
  $hasRootStateForwardRefs$: boolean;

  $promoteToRoot$: (ref: SeenRef, obj: unknown, index?: number) => void;

  $addSyncFn$($funcStr$: string | null, argsCount: number, fn: Function): number;
  $setSyncFnOffset$(offset: number, existingFns?: string[]): void;

  $isSsrNode$: (obj: unknown) => obj is SsrNode;
  $isDomRef$: (obj: unknown) => obj is DomRef;

  $writer$: SSRInternalStreamWriter;
  $setWriter$(writer: SSRInternalStreamWriter): void;
  $syncFns$: string[];

  $eventQrls$: Set<QRL>;
  $eventNames$: Set<string>;
  $renderSymbols$: Set<string>;
  $storeProxyMap$: ObjToProxyMap;
  $eagerResume$: Set<unknown>;

  $setProp$: (obj: any, prop: string, value: any) => void;
}

class SerializationContextImpl implements SerializationContext {
  private $seenObjsMap$ = new Map<unknown, SeenRef>();
  private $syncFnMap$ = new Map<string, number>();
  private $syncFnOffset$ = 0;
  public $syncFns$: string[] = [];
  public $roots$: unknown[] = [];
  public $rootObjs$: unknown[] = [];
  public $onAddRoot$: ((id: number, root: unknown, obj: unknown) => void) | undefined;
  public $forwardRefOffset$ = 0;
  public $serializedRootCount$ = 0;
  public $serializedForwardRefCount$ = 0;
  public $rootStateRootCount$ = 0;
  public $hasRootStateForwardRefs$ = false;
  public $eagerResume$: Set<unknown> = new Set();
  public $eventQrls$: Set<QRL> = new Set();
  public $eventNames$: Set<string> = new Set();
  public $renderSymbols$: Set<string> = new Set();
  private $serializer$: Serializer;

  constructor(
    /**
     * Node constructor, for instanceof checks.
     *
     * A node constructor can be null. For example on the client we can't serialize DOM nodes as
     * server will not know what to do with them.
     */
    public NodeConstructor: {
      new (...rest: any[]): { __brand__: 'SsrNode' };
    } | null,
    /** DomRef constructor, for instanceof checks. */
    public DomRefConstructor: {
      new (...rest: any[]): { __brand__: 'DomRef' };
    } | null,
    public $symbolToChunkResolver$: SymbolToChunkResolver,
    public $setProp$: (obj: any, prop: string, value: any) => void,
    public $storeProxyMap$: ObjToProxyMap,
    public $writer$: SSRInternalStreamWriter
  ) {
    this.$serializer$ = new Serializer(this);
  }

  async $serialize$(): Promise<void> {
    await this.$serializer$.serialize();
  }

  async $serializePatch$(
    rootStart: number,
    rootIds: number[],
    extraRootId?: number | string | number[]
  ): Promise<void> {
    await this.$serializer$.serializePatch(rootStart, rootIds, extraRootId);
  }

  $setWriter$(writer: SSRInternalStreamWriter): void {
    this.$writer$ = writer;
    this.$serializer$.$setWriter$(writer);
  }

  getSeenRef(obj: unknown) {
    return this.$seenObjsMap$.get(obj);
  }

  $markSeen$(obj: unknown, parent: SeenRef | undefined, index: number) {
    const ref = { $index$: index, $parent$: parent };
    this.$seenObjsMap$.set(obj, ref);
    return ref;
  }

  /**
   * Returns a path representing the path from roots through all parents to the object. Format: [3,
   * 2, 0] where each number is the index within its parent, from root to leaf.
   */
  $getObjectPath$(ref: SeenRef) {
    // Traverse up through parent references to build a path
    const path = [];
    while (ref.$parent$) {
      path.unshift(ref.$index$);
      ref = ref.$parent$;
    }
    // Now we are at root, but it could be a backref
    path.unshift(ref.$index$);

    return path;
  }

  $promoteToRoot$(ref: SeenRef, obj: unknown, index?: number) {
    const path = this.$getObjectPath$(ref);
    const isNewRoot = index === undefined;
    if (index === undefined) {
      index = this.$roots$.length;
    }
    this.$roots$[index] = new SerializationBackRef(path);
    if (isNewRoot) {
      this.$rootObjs$[index] = obj;
    }
    ref.$parent$ = null;
    ref.$index$ = index;
    if (isNewRoot) {
      this.$onAddRoot$?.(index, this.$roots$[index], obj);
    }
  }

  $addRoot$(obj: any, returnRef: true): SeenRef;
  $addRoot$(obj: any, returnRef?: never): number;
  $addRoot$(obj: any, returnRef: boolean = false): number | SeenRef {
    let seen = this.$seenObjsMap$.get(obj);
    let index: number;

    if (!seen) {
      index = this.$roots$.length;
      seen = {
        $index$: index,
        // TODO benchmark with and without $parent$
        // $parent$: undefined
      };
      this.$seenObjsMap$.set(obj, seen);
      this.$roots$.push(obj);
      this.$rootObjs$.push(obj);
      this.$onAddRoot$?.(index, obj, obj);
    } else {
      if (seen.$parent$) {
        this.$promoteToRoot$(seen, obj);
      }
      index = seen.$index$;
    }

    return returnRef ? seen : index;
  }

  $addDuplicateRoot$(obj: unknown): SeenRef {
    const index = this.$roots$.length;
    const ref = { $index$: index };
    this.$seenObjsMap$.set(obj, ref);
    this.$roots$.push(obj);
    this.$rootObjs$.push(obj);
    this.$onAddRoot$?.(index, obj, obj);
    return ref;
  }

  $commitRoot$(root: unknown, obj: unknown): number {
    const index = this.$roots$.length;
    const ref = { $index$: index };
    this.$seenObjsMap$.set(obj, ref);
    this.$roots$.push(root);
    this.$rootObjs$.push(obj);
    return index;
  }

  $formatLocalRef$(id: number): number {
    return id;
  }

  $isSsrNode$(obj: unknown): obj is SsrNode {
    return this.NodeConstructor ? obj instanceof this.NodeConstructor : false;
  }

  $isDomRef$(obj: unknown): obj is DomRef {
    return this.DomRefConstructor ? obj instanceof this.DomRefConstructor : false;
  }

  $hasRootId$(obj: any) {
    const id = this.$seenObjsMap$.get(obj);
    return id && (id.$parent$ ? undefined : id.$index$);
  }

  $addSyncFn$(funcStr: string | null, argCount: number, fn: Function): number {
    const isFullFn = funcStr == null;
    if (isFullFn) {
      funcStr = ((fn as any).serialized as string) || fn.toString();
    }
    let id = this.$syncFnMap$.get(funcStr!);
    if (id === undefined) {
      id = this.$syncFnOffset$ + this.$syncFns$.length;
      this.$syncFnMap$.set(funcStr!, id);
      if (isFullFn) {
        this.$syncFns$.push(funcStr!);
      } else {
        let code = '(';
        for (let i = 0; i < argCount; i++) {
          code += (i == 0 ? 'p' : ',p') + i;
        }
        this.$syncFns$.push((code += ')=>' + funcStr));
      }
    }
    return id;
  }

  $setSyncFnOffset$(offset: number, existingFns?: string[]): void {
    this.$syncFnOffset$ = offset;
    if (existingFns) {
      this.$syncFnMap$.clear();
      for (let i = 0; i < existingFns.length; i++) {
        this.$syncFnMap$.set(existingFns[i], i);
      }
    }
  }
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
  setProp: (obj: any, prop: string, value: any) => void,
  storeProxyMap: ObjToProxyMap,
  writer?: SSRInternalStreamWriter
): SerializationContext => {
  if (!writer) {
    const buffer: string[] = [];
    writer = Object.assign(
      createStringStreamWriter((text: string) => {
        buffer.push(text);
      }),
      {
        toString: () => buffer.join(''),
      }
    );
  }

  isDomRef = (
    DomRefConstructor ? (obj) => obj instanceof DomRefConstructor : ((() => false) as any)
  ) as (obj: unknown) => obj is DomRef;

  return new SerializationContextImpl(
    NodeConstructor,
    DomRefConstructor,
    symbolToChunkResolver,
    setProp,
    storeProxyMap,
    writer
  );
};
