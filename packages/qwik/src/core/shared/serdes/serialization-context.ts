import { isPromise, thenInLifetime } from '../utils/promises';
import { SerializationJournal } from './serialization-journal';
import type { Subscriber } from '../../runtime/subscriber';
import { isSubscriberDisposed } from '../../runtime/subscriber';
import { SubscriberFlags } from '../../reactive/flags';
import type { QRL } from '../qrl/qrl.public';
import type { ValueOrPromise } from '../utils/types';
import { Serializer } from './serialize';
import { SerializationBackRef } from './serialization-back-ref';
import { _UNINITIALIZED } from '../utils/constants';
import { createStringSerdesWriter, type SerdesWriter } from './writer';
import { isServer } from '@qwik.dev/core/build';

type DomRef = { $nodeId$: string | number };
type SymbolToChunkResolver = (symbol: string) => string;
type QrlMapper = (
  symbol: string,
  chunk: string | null,
  parent?: string
) => readonly [symbol: string, chunk: string] | undefined;
type ObjToProxyMap = WeakMap<object, object>;

/** Stores the location of an object. If no parent, it's a root. */
export type SeenRef = {
  $index$: number;
  $parent$?: SeenRef | null;
};

export interface SerializedStateRange {
  readonly base: number;
  readonly len: number;
  readonly state: string;
  readonly forwardRefs?: readonly (number | string | number[])[];
}

export let isDomRef = (obj: unknown): obj is DomRef => false;

interface AddRootFn {
  (obj: unknown, returnRef?: never): number;
  (obj: unknown, returnRef: true): SeenRef;
}
export interface SerializationTransaction {
  readonly cancelled: Promise<void>;
  readonly isCancelled: boolean;
  cancel(): void;
  waitFor<T>(value: ValueOrPromise<T>): ValueOrPromise<T | undefined>;
  commit(): void;
  rollback(): void;
}

export interface SerializationContext {
  $journal$?: SerializationJournal;
  $onSerializeRoot$?: (id: number) => void;
  $onSerializationError$?: (error: unknown, id: number) => void;
  $selectedSubscribers$?: ReadonlySet<Subscriber>;
  $isSubscriberSelected$(subscriber: Subscriber): boolean;
  $beginTransaction$(canRollback?: boolean): SerializationTransaction;
  $serialize$: () => ValueOrPromise<void>;
  $serializeNext$: () => ValueOrPromise<SerializedStateRange | null>;
  $serializePatch$: (
    rootStart: number,
    rootIds: number[],
    extraRootId?: number | string | number[],
    streamedRootLimit?: number
  ) => ValueOrPromise<void>;

  $symbolToChunkResolver$: SymbolToChunkResolver;
  $qrlMapper$?: QrlMapper;

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
  $retireRoot$(id: number): void;

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

  /** Mark an object as seen during serialization. This is used to handle backreferences and cycles */
  $markSeen$: (obj: unknown, parent: SeenRef | undefined, index: number) => SeenRef;

  $roots$: unknown[];
  $rootObjs$: unknown[];
  $onAddRoot$?: (id: number, root: unknown, obj: unknown, isNew: boolean) => void;
  $forwardRefOffset$: number;
  $serializedRootCount$: number;
  $serializedForwardRefCount$: number;
  $rootStateRootCount$: number;

  $promoteToRoot$: (ref: SeenRef, obj: unknown, index?: number) => void;

  $isDomRef$: (obj: unknown) => obj is DomRef;

  $writer$: SerdesWriter;
  $setWriter$(writer: SerdesWriter): void;
  /**
   * Keyed sync handlers whose definition the compiler could not place — cross-module `sync$`
   * resolves through a chunk, so the container emits the table entry instead.
   */
  $pendingSyncFns$: Map<string, string>;
  $requireSyncFn$(key: string, source: string): void;

  $eventQrls$: Set<QRL>;
  $eventNames$: Set<string>;
  $renderSymbols$: Set<string>;
  $storeProxyMap$: ObjToProxyMap;
  $eagerResume$: Set<unknown>;

  $setProp$: (obj: any, prop: string, value: any) => void;
}

class SerializationContextImpl implements SerializationContext {
  public $journal$?: SerializationJournal;
  private rootCheckpoint = 0;
  private newSeenKeys?: unknown[];
  private transactionOpen = false;
  declare private hasRetiredRoots: boolean;
  public $selectedSubscribers$?: ReadonlySet<Subscriber>;

  $isSubscriberSelected$(subscriber: Subscriber): boolean {
    return (
      !isSubscriberDisposed(subscriber) &&
      (this.$selectedSubscribers$ === undefined ||
        (subscriber.flags & SubscriberFlags.Published) !== 0 ||
        this.$selectedSubscribers$.has(subscriber))
    );
  }

  $beginTransaction$(canRollback = true): SerializationTransaction {
    if (!isServer) {
      throw new Error('Serialization transactions require SSR');
    }
    if (this.transactionOpen) {
      throw new Error('A serialization packet is already being prepared');
    }
    this.$serializer$.$assertSettled$();
    this.transactionOpen = true;
    const journal = (this.$journal$ = canRollback ? new SerializationJournal() : undefined);
    if (journal !== undefined) {
      this.rootCheckpoint = this.$roots$.length;
      const keys = (this.newSeenKeys = []);
      journal.record(() => {
        for (let i = 0; i < keys.length; i++) {
          this.$seenObjsMap$.delete(keys[i]);
        }
      });
      journal.assign(this.$roots$, 'length', this.$roots$.length);
      journal.assign(this.$rootObjs$, 'length', this.$rootObjs$.length);
      const forwardRefOffset = this.$forwardRefOffset$;
      const serializedRootCount = this.$serializedRootCount$;
      const serializedForwardRefCount = this.$serializedForwardRefCount$;
      const rootStateRootCount = this.$rootStateRootCount$;
      const hasRetiredRoots = this.hasRetiredRoots;
      journal.record(() => {
        this.$forwardRefOffset$ = forwardRefOffset;
        this.$serializedRootCount$ = serializedRootCount;
        this.$serializedForwardRefCount$ = serializedForwardRefCount;
        this.$rootStateRootCount$ = rootStateRootCount;
        this.hasRetiredRoots = hasRetiredRoots;
      });
      this.$serializer$.$checkpoint$(journal);
    }
    let cancel!: () => void;
    const cancelled = new Promise<void>((resolve) => {
      cancel = resolve;
    });
    let isCancelled = false;
    let isClosed = false;
    const close = (rollback: boolean) => {
      this.$serializer$.$assertSettled$();
      if (isClosed) {
        throw new Error('Serialization transaction is already closed');
      }
      if (rollback) {
        journal?.rollback();
      } else {
        journal?.commit();
      }
      isClosed = true;
      this.transactionOpen = false;
      this.$journal$ = undefined;
      this.newSeenKeys = undefined;
    };
    const transaction: SerializationTransaction = {
      cancelled,
      get isCancelled() {
        return isCancelled;
      },
      cancel: () => {
        if (isClosed) {
          return;
        }
        isCancelled = true;
        cancel();
        this.$serializer$.$cancel$();
      },
      waitFor: (value) => {
        if (!isPromise(value)) {
          return value;
        }
        return thenInLifetime(transaction, value, (value) => value);
      },
      commit: () => close(false),
      rollback: () => close(true),
    };
    return transaction;
  }

  private setSeen(obj: unknown, ref: SeenRef, canOverwrite = false): void {
    if (isServer && this.$journal$ !== undefined && canOverwrite && this.$seenObjsMap$.has(obj)) {
      this.$journal$.set(this.$seenObjsMap$, obj, ref);
      return;
    }
    if (isServer) {
      this.newSeenKeys?.push(obj);
    }
    this.$seenObjsMap$.set(obj, ref);
  }
  private $seenObjsMap$ = new Map<unknown, SeenRef>();
  public $pendingSyncFns$ = new Map<string, string>();
  public $roots$: unknown[] = [];
  public $rootObjs$: unknown[] = [];
  public $onSerializeRoot$?: (id: number) => void;
  public $onSerializationError$?: (error: unknown, id: number) => void;
  public $onAddRoot$:
    | ((id: number, root: unknown, obj: unknown, isNew: boolean) => void)
    | undefined;
  public $forwardRefOffset$ = 0;
  public $serializedRootCount$ = 0;
  public $serializedForwardRefCount$ = 0;
  public $rootStateRootCount$ = 0;
  public $eagerResume$: Set<unknown> = new Set();
  public $eventQrls$: Set<QRL> = new Set();
  public $eventNames$: Set<string> = new Set();
  public $renderSymbols$: Set<string> = new Set();
  private $serializer$: Serializer;
  constructor(
    /** DomRef constructor, for instanceof checks. */
    public DomRefConstructor: {
      new (...rest: any[]): { __brand__: 'DomRef' };
    } | null,
    public $symbolToChunkResolver$: SymbolToChunkResolver,
    public $setProp$: (obj: any, prop: string, value: any) => void,
    public $storeProxyMap$: ObjToProxyMap,
    public $writer$: SerdesWriter
  ) {
    if (isServer) {
      this.hasRetiredRoots = false;
    }
    this.$serializer$ = new Serializer(this);
  }

  async $serialize$(): Promise<void> {
    await this.$serializer$.serialize();
  }

  async $serializeNext$(): Promise<SerializedStateRange | null> {
    const base = this.$rootStateRootCount$;
    if (base === this.$roots$.length) {
      return null;
    }
    const chunks: string[] = [];
    const writer = createStringSerdesWriter((chunk) => {
      chunks.push(chunk);
    });
    const previousWriter = this.$writer$;
    this.$setWriter$(writer);
    try {
      const forwardRefs = await this.$serializer$.serializeNext();
      return {
        base,
        len: this.$rootStateRootCount$ - base,
        state: chunks.join(''),
        ...(forwardRefs ? { forwardRefs: forwardRefs.slice() } : {}),
      };
    } finally {
      this.$setWriter$(previousWriter);
    }
  }

  async $serializePatch$(
    rootStart: number,
    rootIds: number[],
    extraRootId?: number | string | number[],
    streamedRootLimit?: number
  ): Promise<void> {
    await this.$serializer$.serializePatch(rootStart, rootIds, extraRootId, streamedRootLimit);
  }

  $setWriter$(writer: SerdesWriter): void {
    this.$writer$ = writer;
    this.$serializer$.$setWriter$(writer);
  }

  getSeenRef(obj: unknown) {
    const ref = this.$seenObjsMap$.get(obj);
    if (!isServer || !this.hasRetiredRoots || ref === undefined) {
      return ref;
    }
    let root = ref;
    while (root.$parent$) {
      root = root.$parent$;
    }
    return this.$rootObjs$[root.$index$] === _UNINITIALIZED &&
      this.$roots$[root.$index$] === undefined
      ? undefined
      : ref;
  }

  $retireRoot$(id: number): void {
    if (!isServer) {
      throw new Error('Root retirement requires SSR');
    }
    this.hasRetiredRoots = true;
    if (this.$journal$ === undefined) {
      this.$roots$[id] = undefined;
      this.$rootObjs$[id] = _UNINITIALIZED;
    } else {
      this.$journal$.assign(this.$roots$, id, undefined);
      this.$journal$.assign(this.$rootObjs$, id, _UNINITIALIZED);
    }
  }

  $markSeen$(obj: unknown, parent: SeenRef | undefined, index: number) {
    const ref = { $index$: index, $parent$: parent };
    this.setSeen(obj, ref);
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
    const backref = new SerializationBackRef(path);
    if (isServer && this.$journal$ !== undefined) {
      if (index < this.rootCheckpoint) {
        this.$journal$.assign(this.$roots$, index, backref);
      } else {
        this.$roots$[index] = backref;
      }
      const parent = ref.$parent$;
      const previousIndex = ref.$index$;
      this.$journal$.record(() => {
        ref.$parent$ = parent;
        ref.$index$ = previousIndex;
      });
    } else {
      this.$roots$[index] = backref;
    }
    ref.$parent$ = null;
    ref.$index$ = index;
    if (isNewRoot) {
      this.$rootObjs$[index] = obj;
    }
    if (isServer && isNewRoot) {
      this.$onAddRoot$?.(index, this.$roots$[index], obj, true);
    }
  }

  $addRoot$(obj: any, returnRef: true): SeenRef;
  $addRoot$(obj: any, returnRef?: never): number;
  $addRoot$(obj: any, returnRef: boolean = false): number | SeenRef {
    let seen = this.getSeenRef(obj);
    const isNew = seen === undefined;
    let index: number;

    if (!seen) {
      index = this.$roots$.length;
      seen = {
        $index$: index,
        // TODO benchmark with and without $parent$
        // $parent$: undefined
      };
      this.setSeen(obj, seen, true);
      this.$roots$.push(obj);
      this.$rootObjs$.push(obj);
    } else {
      if (seen.$parent$) {
        this.$promoteToRoot$(seen, obj);
      }
      index = seen.$index$;
    }

    if (isServer) {
      this.$onAddRoot$?.(index, this.$roots$[index], obj, isNew);
    }

    return returnRef ? seen : index;
  }

  $addDuplicateRoot$(obj: unknown): SeenRef {
    const index = this.$roots$.length;
    const ref = { $index$: index };
    this.setSeen(obj, ref, true);
    this.$roots$.push(obj);
    this.$rootObjs$.push(obj);
    if (isServer) {
      this.$onAddRoot$?.(index, obj, obj, true);
    }
    return ref;
  }

  $commitRoot$(root: unknown, obj: unknown): number {
    const index = this.$roots$.length;
    const ref = { $index$: index };
    this.setSeen(obj, ref, true);
    this.$roots$.push(root);
    this.$rootObjs$.push(obj);
    return index;
  }

  $isDomRef$(obj: unknown): obj is DomRef {
    return this.DomRefConstructor ? obj instanceof this.DomRefConstructor : false;
  }

  $hasRootId$(obj: any) {
    const id = this.getSeenRef(obj);
    return id && (id.$parent$ ? undefined : id.$index$);
  }

  $requireSyncFn$(key: string, source: string): void {
    if (isServer && this.$journal$ !== undefined) {
      this.$journal$.set(this.$pendingSyncFns$, key, source);
    } else {
      this.$pendingSyncFns$.set(key, source);
    }
  }
}

export const createSerializationContext = (
  /** DomRef constructor, for instanceof checks. */
  DomRefConstructor: {
    new (...rest: any[]): { __brand__: 'DomRef' };
  } | null,
  symbolToChunkResolver: SymbolToChunkResolver,
  setProp: (obj: any, prop: string, value: any) => void,
  storeProxyMap: ObjToProxyMap,
  writer?: SerdesWriter
): SerializationContext => {
  if (!writer) {
    const buffer: string[] = [];
    writer = Object.assign(
      createStringSerdesWriter((text: string) => {
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
    DomRefConstructor,
    symbolToChunkResolver,
    setProp,
    storeProxyMap,
    writer
  );
};
