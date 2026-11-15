import { getOrCreateStore } from '../../reactive-primitives/impl/store';
import { StoreFlags } from '../../reactive-primitives/types';
import { QError, qError } from '../error/error';
import type { DeserializeContainer } from '../types';
import { allocate } from './allocate';
import { _constants, TypeIds } from './constants';
import { needsInflation } from './deser-proxy';
import { inflate, inflateRestored } from './inflate';

/**
 * Codes of the binary state stream.
 *
 * The stream is a sequence of 7-bit units. Every value is its data followed by one code, so the
 * stream is read backwards from its last unit. Codes 0-21 are the `Constants`.
 *
 * @internal
 */
export const enum BinaryCode {
  /** - 1-6 units: positive integer */
  Int1 = 22,
  /** - 1-4 units: negative integer */
  NegInt1 = 28,
  /** - 1-3 units: string index */
  Str1 = 32,
  /** - 1-3 units: root index */
  Root1 = 35,
  /**
   * - 1-4 units, only valid as a root: the root is the value that ends at this offset, stored as the
   *   zigzag distance from the previous such root's offset.
   */
  Shared1 = 38,
  /** The array has at most `MaxUnsizedItems` items and no stored length */
  Items0 = 42,
  /** - 1-4 units: number of units of the array items that precede it */
  Items1 = 43,
  /** Preceded by an integer value: that integer divided by 10^(1-4) */
  Decimal1 = 47,
  /** - 10 units: float64 */
  Float = 51,
  /** Preceded by the item count (an integer value) and an `Items*` marker */
  ArrayEnd = 52,
  /** `Type0 + TypeIds`, preceded by the payload value */
  Type0 = 53,
  /** Integers 0-17 */
  Num0 = 100,
  /** String indexes 0-9 */
  Str0 = 118,

  MaxUnsizedItems = 8,
  /** NUL, CR and `<` do not survive in a script element; they are stored with this bit set. */
  EscapeBit = 128,
}

/** Marks a state script as binary; JSON state starts with `[`. */
export const BINARY_STATE_PREFIX = '~';
export const isBinaryState = (text: string): boolean => text.charCodeAt(0) === 126;

const MAX_ROOTS = 0x100000;
const float64 = /*#__PURE__*/ new DataView(new ArrayBuffer(8));

/**
 * Restores roots on demand, straight from the text of the binary state script.
 *
 * @internal
 */
interface BinaryStateChunk {
  /** `~<JSON array of strings>\n<units>` */
  $text$: string;
  /** Add a stream offset to get the index in the text. */
  $base$: number;
  /** Stream offsets of the first unit and after the last unit. */
  $start$: number;
  $end$: number;
}

export class BinaryStateReader {
  /** The state scripts received so far; together their units are one stream. */
  private $chunks$: BinaryStateChunk[] = [];
  /** The chunk that holds the current position: its text, offset correction and unit range. */
  private $text$ = '';
  private $base$ = 0;
  private $chunkStart$ = 0;
  private $chunkEnd$ = 0;
  private $strings$: string[] = [];
  private $pos$ = 0;
  /** Offset of the last unit of every root. */
  $rootEnds$ = new Uint32Array(0);
  /** Number of units each root occupies in its root list. */
  $rootSizes$ = new Uint32Array(0);
  /** Number of units in the stream. */
  $unitCount$ = 0;
  /**
   * Nested values that are also a root, sorted, each `endOffset * MAX_ROOTS + rootIndex`.
   *
   * Shortcut: caps the state at 2^20 roots (float64 keys stay exact); split the key to go higher.
   */
  private $sharedValues$ = new Float64Array(0);
  $forwardRefs$: Array<number | string> | null = null;
  /**
   * While state patches can still arrive: the nested objects restored so far, by end offset. A
   * patch can add a root for a value that was already restored inside its parent.
   */
  $restoredByOffset$: Map<number, unknown> | null = null;
  /** Called with a root's object before it is filled, so that cycles find it. */
  $onRootAllocated$: (rootIndex: number, value: unknown) => void = () => {};
  /** Called when a state patch has added roots. */
  $onRootsAdded$: () => void = () => {};

  /** @param text The content of the root state script, if the container has one. */
  constructor(text?: string) {
    if (text) {
      this.$appendScript$(text);
      this.$seek$(this.$unitCount$ - 2); // before the ArrayEnd of the root list
      this.$appendRoots$();
    }
  }

  /**
   * Adds the roots of a state patch: `[rootStart, roots, forwardRefs | 0, extraRootId]`.
   *
   * @returns Null when the patch does not continue the roots received so far.
   */
  $addPatch$(
    text: string
  ): { $forwardRefs$: Array<number | string> | 0; $extraRootId$: number | undefined } | null {
    const previousUnitCount = this.$unitCount$;
    const previousStringCount = this.$strings$.length;
    this.$appendScript$(text);
    this.$seek$(this.$unitCount$ - 2); // before the ArrayEnd of the patch
    this.$openArray$();
    const extraRootId = this.$restore$(null!, -1, false) as number | undefined;
    const forwardRefs = this.$restore$(null!, -1, false) as Array<number | string> | 0;
    const rootListEnd = this.$pos$;
    this.$skip$();
    const rootStart = this.$restore$(null!, -1, false);
    if (rootStart !== this.$rootEnds$.length) {
      this.$chunks$.pop();
      this.$chunkEnd$ = 0;
      this.$unitCount$ = previousUnitCount;
      this.$strings$.length = previousStringCount;
      return null;
    }
    this.$pos$ = rootListEnd - 1;
    this.$appendRoots$();
    this.$onRootsAdded$();
    return { $forwardRefs$: forwardRefs, $extraRootId$: extraRootId };
  }

  $restoreRoot$(container: DeserializeContainer, rootIndex: number): unknown {
    const end = this.$rootEnds$[rootIndex];
    const restored = this.$restoredByOffset$?.get(end);
    if (restored !== undefined) {
      return restored;
    }
    this.$seek$(end);
    return this.$restore$(container, rootIndex, false);
  }

  /** A unit of the chunk that holds the current position; a value never spans chunks. */
  private $unit$(pos: number): number {
    return this.$text$.charCodeAt(this.$base$ + pos) & 127;
  }

  private $chunkAt$(pos: number): BinaryStateChunk {
    const chunks = this.$chunks$;
    let i = chunks.length - 1;
    while (i > 0 && chunks[i].$start$ > pos) {
      i--;
    }
    return chunks[i];
  }

  /** A unit anywhere in the stream, without moving the current position. */
  private $unitAt$(pos: number): number {
    const chunk = this.$chunkAt$(pos);
    return chunk.$text$.charCodeAt(chunk.$base$ + pos) & 127;
  }

  /** Moves the current position, to another chunk if needed. */
  private $seek$(pos: number): void {
    this.$pos$ = pos;
    if (pos < this.$chunkStart$ || pos >= this.$chunkEnd$) {
      const chunk = this.$chunkAt$(pos);
      this.$text$ = chunk.$text$;
      this.$base$ = chunk.$base$;
      this.$chunkStart$ = chunk.$start$;
      this.$chunkEnd$ = chunk.$end$;
    }
  }

  /** Appends the strings and units of a state script. */
  private $appendScript$(script: string): void {
    const separator = script.indexOf('\n');
    const strings = JSON.parse(script.slice(1, separator)) as string[];
    for (let i = 0; i < strings.length; i++) {
      this.$strings$.push(strings[i]);
    }
    const start = this.$unitCount$;
    const end = start + script.length - separator - 1;
    this.$chunks$.push({
      $text$: script,
      $base$: separator + 1 - start,
      $start$: start,
      $end$: end,
    });
    this.$unitCount$ = end;
  }

  /** Indexes the root list whose ArrayEnd is right after the current position. */
  private $appendRoots$(): void {
    const firstRoot = this.$rootEnds$.length;
    const count = this.$openArray$();
    if (firstRoot + count >= MAX_ROOTS) {
      throw qError(QError.serializeErrorNotImplemented, [BinaryCode.ArrayEnd]);
    }
    const rootEnds = new Uint32Array(firstRoot + count);
    const rootSizes = new Uint32Array(firstRoot + count);
    rootEnds.set(this.$rootEnds$);
    rootSizes.set(this.$rootSizes$);
    for (let i = firstRoot + count - 1; i >= firstRoot; i--) {
      rootEnds[i] = this.$pos$;
      this.$skip$();
      rootSizes[i] = rootEnds[i] - this.$pos$;
    }
    const previousShared = this.$sharedValues$;
    const sharedValues = new Float64Array(previousShared.length + count);
    sharedValues.set(previousShared);
    let sharedCount = previousShared.length;
    let sharedEnd = 0;
    for (let i = firstRoot; i < rootEnds.length; i++) {
      const end = rootEnds[i];
      const code = this.$unit$(end);
      if (code >= BinaryCode.Shared1 && code < BinaryCode.Items0) {
        this.$pos$ = end - 1;
        const zigzag = this.$uint$(code - BinaryCode.Shared1 + 1);
        sharedEnd += zigzag % 2 ? -(zigzag + 1) / 2 : zigzag / 2;
        rootEnds[i] = sharedEnd;
        // Plain values have no identity, they can be read twice.
        const sharedCode = this.$unitAt$(sharedEnd);
        if (sharedCode >= BinaryCode.ArrayEnd && sharedCode < BinaryCode.Num0) {
          sharedValues[sharedCount++] = sharedEnd * MAX_ROOTS + i;
        }
      } else if (code === BinaryCode.Type0 + TypeIds.ForwardRefs) {
        this.$pos$ = end;
        this.$forwardRefs$ = this.$restore$(null!, -1, false) as Array<number | string>;
      }
    }
    this.$rootEnds$ = rootEnds;
    this.$rootSizes$ = rootSizes;
    this.$sharedValues$ = sharedValues.slice(0, sharedCount).sort();
  }

  /** The root that owns the nested value ending at `end`, or -1. */
  private $sharedRoot$(end: number): number {
    const sharedValues = this.$sharedValues$;
    const key = end * MAX_ROOTS;
    let low = 0;
    let high = sharedValues.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (sharedValues[middle] < key) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    const found = sharedValues[low];
    return found < key + MAX_ROOTS ? found - key : -1;
  }

  private $uint$(unitCount: number): number {
    let value = 0;
    for (let i = 0; i < unitCount; i++) {
      value = value * 128 + this.$unit$(this.$pos$ - i);
    }
    this.$pos$ -= unitCount;
    return value;
  }

  /**
   * After an ArrayEnd code: returns the item count and leaves the position on the last item. The
   * unit length of the items is in `$itemsLength$`, or -1 when it is not stored.
   */
  private $openArray$(): number {
    const countCode = this.$unit$(this.$pos$--);
    const count =
      countCode >= BinaryCode.Num0
        ? countCode - BinaryCode.Num0
        : this.$uint$(countCode - BinaryCode.Int1 + 1);
    const marker = this.$unit$(this.$pos$--);
    const itemsLength =
      marker === BinaryCode.Items0 ? -1 : this.$uint$(marker - BinaryCode.Items1 + 1);
    // Every item is at least one unit; reject counts that would over-allocate.
    const isValid =
      itemsLength === -1
        ? count <= BinaryCode.MaxUnsizedItems
        : count <= itemsLength && itemsLength <= this.$pos$ + 1;
    if (!isValid) {
      throw qError(QError.serializeErrorNotImplemented, [BinaryCode.ArrayEnd]);
    }
    this.$itemsLength$ = itemsLength;
    return count;
  }
  private $itemsLength$ = 0;

  /** Moves past one value without restoring it. */
  private $skip$(): void {
    const code = this.$unit$(this.$pos$--);
    if (code < BinaryCode.Int1 || code >= BinaryCode.Num0) {
      return;
    }
    if (code >= BinaryCode.Type0 || (code >= BinaryCode.Decimal1 && code < BinaryCode.Float)) {
      return this.$skip$();
    }
    if (code === BinaryCode.ArrayEnd) {
      const count = this.$openArray$();
      if (this.$itemsLength$ !== -1) {
        this.$pos$ -= this.$itemsLength$;
      } else {
        for (let i = 0; i < count; i++) {
          this.$skip$();
        }
      }
    } else if (code === BinaryCode.Float) {
      this.$pos$ -= 10;
    } else if (code < BinaryCode.NegInt1) {
      this.$pos$ -= code - BinaryCode.Int1 + 1;
    } else if (code < BinaryCode.Str1) {
      this.$pos$ -= code - BinaryCode.NegInt1 + 1;
    } else if (code < BinaryCode.Root1) {
      this.$pos$ -= code - BinaryCode.Str1 + 1;
    } else if (code < BinaryCode.Shared1) {
      this.$pos$ -= code - BinaryCode.Root1 + 1;
    } else {
      this.$pos$ -= code - BinaryCode.Shared1 + 1;
    }
  }

  private $float$(): number {
    let bits = 0;
    let bitCount = 0;
    let byteIndex = 0;
    for (let i = 0; i < 10; i++) {
      bits = (bits << 7) | this.$unit$(this.$pos$--);
      bitCount += 7;
      // 70 bits hold a 64 bit float; the first unit carries 6 unused bits.
      if (i === 0) {
        bitCount = 1;
      }
      if (bitCount >= 8) {
        bitCount -= 8;
        float64.setUint8(byteIndex++, (bits >> bitCount) & 255);
        bits &= (1 << bitCount) - 1;
      }
    }
    return float64.getFloat64(0);
  }

  /** Other roots may be restored while calling out, which moves the position. */
  private $getRoot$(container: DeserializeContainer, rootIndex: number): unknown {
    const resume = this.$pos$;
    const value = container.$getObjectById$(rootIndex);
    this.$seek$(resume);
    return value;
  }

  /** Reads the items of the array ending at the current position into `target`. */
  private $restoreItems$(container: DeserializeContainer, target: unknown[]): void {
    for (let i = target.length - 1; i >= 0; i--) {
      target[i] = this.$restore$(container, -1, true);
    }
  }

  /** Fills an allocated object from the typed array payload that ends at the current position. */
  private $fill$(container: DeserializeContainer, target: unknown, typeId: TypeIds): void {
    this.$pos$--; // ArrayEnd
    const values: unknown[] = Array(this.$openArray$());
    this.$restoreItems$(container, values);
    const resume = this.$pos$;
    inflateRestored(container, target, typeId, values);
    this.$seek$(resume);
  }

  /**
   * Restores the value that ends at the current position and moves before it.
   *
   * @param rootIndex The root this value is, or -1.
   * @param isNested Whether the value is an item of another value.
   */
  private $restore$(
    container: DeserializeContainer,
    rootIndex: number,
    isNested: boolean
  ): unknown {
    const end = this.$pos$;
    const code = this.$unit$(this.$pos$--);
    if (code >= BinaryCode.Str0) {
      return this.$strings$[code - BinaryCode.Str0];
    }
    if (code >= BinaryCode.Num0) {
      return code - BinaryCode.Num0;
    }
    if (code < BinaryCode.Int1) {
      return _constants[code];
    }
    if (code >= BinaryCode.ArrayEnd) {
      const sharedRoot = isNested ? this.$sharedRoot$(end) : -1;
      if (sharedRoot !== -1) {
        // The root owns the value so that every reference resolves to one object.
        this.$pos$ = end;
        this.$skip$();
        return this.$getRoot$(container, sharedRoot);
      }
      let value: unknown;
      if (code === BinaryCode.ArrayEnd) {
        const array: unknown[] = (value = Array(this.$openArray$()));
        if (rootIndex !== -1) {
          this.$onRootAllocated$(rootIndex, array);
        }
        this.$restoreItems$(container, array);
      } else {
        value = this.$restoreTyped$(container, code - BinaryCode.Type0, rootIndex);
      }
      if (isNested && this.$restoredByOffset$) {
        this.$restoredByOffset$.set(end, value);
      }
      return value;
    }
    if (code === BinaryCode.Float) {
      return this.$float$();
    }
    if (code >= BinaryCode.Decimal1) {
      const integer = this.$restore$(container, -1, false) as number;
      return integer / 10 ** (code - BinaryCode.Decimal1 + 1);
    }
    if (code < BinaryCode.NegInt1) {
      return this.$uint$(code - BinaryCode.Int1 + 1);
    }
    if (code < BinaryCode.Str1) {
      return -this.$uint$(code - BinaryCode.NegInt1 + 1);
    }
    if (code < BinaryCode.Root1) {
      return this.$strings$[this.$uint$(code - BinaryCode.Str1 + 1)];
    }
    if (code < BinaryCode.Shared1) {
      return this.$getRoot$(container, this.$uint$(code - BinaryCode.Root1 + 1));
    }
    throw qError(QError.serializeErrorNotImplemented, [code]);
  }

  /** The current position is on the payload of a value of type `typeId`. */
  private $restoreTyped$(
    container: DeserializeContainer,
    typeId: TypeIds,
    rootIndex: number
  ): unknown {
    if (this.$unit$(this.$pos$) !== BinaryCode.ArrayEnd) {
      const payload = this.$restore$(container, -1, false);
      const resume = this.$pos$;
      const value = allocate(container, typeId, payload);
      if (needsInflation(typeId)) {
        inflate(container, value, typeId, payload);
      }
      this.$seek$(resume);
      return value;
    }
    if (typeId === TypeIds.Store) {
      return this.$restoreStore$(container, rootIndex);
    }
    if (typeId === TypeIds.ForwardRefs) {
      this.$pos$--;
      const forwardRefs: unknown[] = Array(this.$openArray$());
      this.$restoreItems$(container, forwardRefs);
      return forwardRefs;
    }
    if (!needsInflation(typeId)) {
      throw qError(QError.serializeErrorNotImplemented, [typeId]);
    }
    const value = allocate(container, typeId, undefined);
    if (rootIndex !== -1) {
      this.$onRootAllocated$(rootIndex, value);
    }
    this.$fill$(container, value, typeId);
    return value;
  }

  /**
   * A store is `[target, flags, effects, ...innerStores]`. The store must exist before anything
   * else is restored, because its effects and its own content can refer back to it.
   */
  private $restoreStore$(container: DeserializeContainer, rootIndex: number): unknown {
    this.$pos$--; // ArrayEnd
    const values: unknown[] = Array(this.$openArray$());
    const lastItemEnd = this.$pos$;
    for (let i = values.length - 1; i > 0; i--) {
      this.$skip$();
    }
    const targetEnd = this.$pos$;
    const targetCode = this.$unit$(targetEnd);
    const isSharedTarget = this.$sharedRoot$(targetEnd) !== -1;
    let target: unknown;
    let fillTypeId: TypeIds | -1 = -1;
    if (!isSharedTarget && targetCode === BinaryCode.ArrayEnd) {
      this.$pos$--;
      target = Array(this.$openArray$());
      fillTypeId = TypeIds.Array;
    } else if (
      !isSharedTarget &&
      targetCode >= BinaryCode.Type0 &&
      targetCode < BinaryCode.Num0 &&
      this.$unit$(targetEnd - 1) === BinaryCode.ArrayEnd &&
      needsInflation(targetCode - BinaryCode.Type0)
    ) {
      fillTypeId = targetCode - BinaryCode.Type0;
      target = allocate(container, fillTypeId, undefined);
    } else {
      target = this.$restore$(container, -1, true);
    }
    this.$pos$ = targetEnd;
    this.$skip$();
    const start = this.$pos$;

    this.$restoredByOffset$?.set(targetEnd, target);
    const store = getOrCreateStore(target as object, StoreFlags.NONE, container as any);
    if (rootIndex !== -1) {
      this.$onRootAllocated$(rootIndex, store);
    }
    values[0] = target;
    this.$pos$ = lastItemEnd;
    for (let i = values.length - 1; i > 0; i--) {
      values[i] = this.$restore$(container, -1, true);
    }
    if (fillTypeId === TypeIds.Array) {
      this.$pos$ = targetEnd - 1;
      this.$openArray$();
      this.$restoreItems$(container, target as unknown[]);
    } else if (fillTypeId !== -1) {
      this.$pos$ = targetEnd - 1;
      this.$fill$(container, target, fillTypeId);
    }
    inflateRestored(container, store, TypeIds.Store, values);
    this.$seek$(start);
    return store;
  }
}
