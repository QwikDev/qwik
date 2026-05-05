import type { VNodeData } from '../../../server/vnode-data';
import type { _EFFECT_BACK_REF } from '../../internal';
import type { EffectProperty, EffectSubscription } from '../../reactive-primitives/types';
import type { ISsrNode, StreamWriter, SymbolToChunkResolver } from '../../ssr/ssr-types';
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
    public $path$: string
  ) {}
}

interface AddRootFn {
  (obj: unknown, returnRef?: never): number | string;
  (obj: unknown, returnRef: true): SeenRef;
}
export interface SerializationContext {
  $serialize$: () => ValueOrPromise<void>;

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
  $formatLocalRef$: (id: number) => number | string;
  $formatLocalPath$: (path: string) => string;

  $setSyncFnOffset$: (offset: number, existingFns?: string[]) => void;
  $addSyncFn$($funcStr$: string | null, argsCount: number, fn: Function): number;

  $isSsrNode$: (obj: unknown) => obj is SsrNode;
  $isDomRef$: (obj: unknown) => obj is DomRef;

  $writer$: StreamWriter;
  $syncFns$: string[];

  $eventQrls$: Set<QRL>;
  $eventNames$: Set<string>;
  $renderSymbols$: Set<string>;
  $storeProxyMap$: ObjToProxyMap;
  $eagerResume$: Set<unknown>;
  $statePrefix$: string | null;
  $getExternalRootId$: ((obj: unknown) => number | undefined) | null;

  $setProp$: (obj: any, prop: string, value: any) => void;
}

class SerializationContextImpl implements SerializationContext {
  private $seenObjsMap$ = new Map<unknown, SeenRef>();
  private $syncFnMap$ = new Map<string, number>();
  private $syncFnOffset$ = 0;
  public $syncFns$: string[] = [];
  public $roots$: unknown[] = [];
  public $eagerResume$: Set<unknown> = new Set();
  public $eventQrls$: Set<QRL> = new Set();
  public $eventNames$: Set<string> = new Set();
  public $renderSymbols$: Set<string> = new Set();
  public $statePrefix$: string | null = null;
  public $getExternalRootId$: ((obj: unknown) => number | undefined) | null = null;
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
    public $writer$: StreamWriter
  ) {
    this.$serializer$ = new Serializer(this);
  }

  async $serialize$(): Promise<void> {
    return await this.$serializer$.serialize();
  }

  getSeenRef(obj: unknown) {
    return this.$seenObjsMap$.get(obj);
  }

  $markSeen$(obj: unknown, parent: SeenRef | undefined, index: number) {
    const ref = { $index$: index, $parent$: parent };
    this.$seenObjsMap$.set(obj, ref);
    return ref;
  }

  $formatLocalRef$(id: number): number | string {
    return __EXPERIMENTAL__.suspense && this.$statePrefix$ ? `${this.$statePrefix$}${id}` : id;
  }

  $formatLocalPath$(path: string): string {
    return __EXPERIMENTAL__.suspense && this.$statePrefix$ && path.indexOf(':') === -1
      ? `${this.$statePrefix$}${path}`
      : path;
  }

  /**
   * Returns a path string representing the path from roots through all parents to the object.
   * Format: "3 2 0" where each number is the index within its parent, from root to leaf.
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

    return this.$formatLocalPath$(path.join(' '));
  }

  $promoteToRoot$(ref: SeenRef, index?: number) {
    const path = this.$getObjectPath$(ref) as string;
    if (index === undefined) {
      index = this.$roots$.length;
    }
    this.$roots$[index] = new SerializationBackRef(path);
    ref.$parent$ = null;
    ref.$index$ = index;
  }

  $addRoot$(obj: any, returnRef: true): SeenRef;
  $addRoot$(obj: any, returnRef?: never): number | string;
  $addRoot$(obj: any, returnRef: boolean = false): number | string | SeenRef {
    if (__EXPERIMENTAL__.suspense && !returnRef) {
      const externalRootId = this.$getExternalRootId$?.(obj);
      if (externalRootId !== undefined) {
        return externalRootId;
      }
    }
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
    } else {
      if (seen.$parent$) {
        this.$promoteToRoot$(seen);
      }
      index = seen.$index$;
    }

    return returnRef ? seen : this.$formatLocalRef$(index);
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

  $setSyncFnOffset$(offset: number, existingFns?: string[]): void {
    this.$syncFnOffset$ = offset;
    if (existingFns) {
      for (let i = 0; i < existingFns.length; i++) {
        this.$syncFnMap$.set(existingFns[i], i);
      }
    }
  }

  $addSyncFn$(funcStr: string | null, argCount: number, fn: Function): number {
    const isFullFn = funcStr == null;
    let code: string;
    if (isFullFn) {
      code = ((fn as any).serialized as string) || fn.toString();
    } else {
      code = '(';
      for (let i = 0; i < argCount; i++) {
        code += (i == 0 ? 'p' : ',p') + i;
      }
      code += ')=>' + funcStr;
    }
    let id = this.$syncFnMap$.get(code);
    if (id === undefined) {
      id = this.$syncFnOffset$ + this.$syncFns$.length;
      this.$syncFnMap$.set(code, id);
      this.$syncFns$.push(code);
    }
    return id;
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
  writer?: StreamWriter
): SerializationContext => {
  if (!writer) {
    const buffer: string[] = [];
    writer = {
      write: (text: string) => {
        buffer.push(text);
      },
      toString: () => buffer.join(''),
    } as StreamWriter;
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
