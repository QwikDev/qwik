import { getOrCreateStore } from '../../reactive-primitives/impl/store';
import { StoreFlags } from '../../reactive-primitives/types';
import { QError, qError } from '../error/error';
import type { DeserializeContainer } from '../types';
import { allocate } from './allocate';
import { _constants, TypeIds } from './constants';
import { needsInflation } from './deser-proxy';
import { inflateRestored } from './inflate';

/**
 * Codes of the binary state stream.
 *
 * The stream is a sequence of 7-bit units, with the characters of strings in between. Every value
 * is its data followed by one code, so the stream is read backwards from its last unit. Codes 0-21
 * are the `Constants`.
 *
 * @internal
 */
export const enum BinaryCode {
  /** - 1-6 units: positive integer */
  Int1 = 22,
  /** - 1-4 units: negative integer */
  NegInt1 = 28,
  /** - 1-3 units: root index */
  Root1 = 32,
  /**
   * - 1-4 units, only valid as a root: the root is the value that ends at this offset, stored as the
   *   zigzag distance from the previous such root's offset.
   */
  Shared1 = 35,
  /** The array has at most `MaxUnsizedItems` items and no stored length */
  Items0 = 39,
  /** - 1-4 units: number of units of the array items that precede it */
  Items1 = 40,
  /** Preceded by an integer value: that integer divided by 10^(1-4) */
  Decimal1 = 44,
  /** - 10 units: float64 */
  Float = 48,
  /** - The characters of a string, then 1-4 units: their count */
  Str1 = 49,
  /** As `Str1`, but the characters are the inside of a JSON string literal */
  EscapedStr1 = 53,
  /** - 1-4 units: the string that ends at this offset */
  StrAt1 = 57,
  /** Preceded by the item count (an integer value) and an `Items*` marker */
  ArrayEnd = 61,
  /** `Type0 + TypeIds`, preceded by the payload value */
  Type0 = 62,
  /** Integers 0-18 */
  Num0 = 109,

  MaxUnsizedItems = 8,
  /** Strings up to this length are written again instead of referred to. */
  MaxRepeatedStringLength = 3,
  /**
   * A longer string is written again for every typed value made from it, so that the stream grows
   * with the work of parsing it.
   */
  MaxSharedPayloadLength = 64,
  /** The reader's index of shared values holds root ids below this. */
  MaxRoots = 0x100000,
}

/**
 * The character a unit is written as. Control characters and `<` do not survive in a script
 * element, and whitespace invites reformatting, so those units are written as Latin-1 letters and
 * symbols.
 *
 * @internal
 */
export const unitToCharCode = (unit: number): number =>
  unit <= 32 || unit === 60 ? unit + 192 : unit === 127 ? 191 : unit;

/** The unit a character of the stream stands for. */
const charCodeToUnit = (charCode: number): number =>
  charCode < 128 ? charCode : (charCode - 192) & 127;

/** Marks a state script as binary; JSON state starts with `[`. */
export const BINARY_STATE_PREFIX = '~';
/**
 * Whether the content of a state script is binary.
 *
 * @internal
 */
export const isBinaryState = (text: string): boolean => text.charCodeAt(0) === 126;

/**
 * The first character of binary vnode data. Text vnode data can start with `~`, never with `}`.
 *
 * @internal
 */
export const BINARY_VNODE_PREFIX = '}';
export const isBinaryVNodeData = (text: string): boolean => text.charCodeAt(0) === 125;

const MAX_ROOTS = BinaryCode.MaxRoots;

const isVNodeRef = (typeId: TypeIds) => typeId === TypeIds.VNode || typeId === TypeIds.RefVNode;

/** A vnode ref may be written as `[elementIdx, ...childIdx]`; `vnode_locate` walks it. */
const isVNodeRefPath = (typeId: TypeIds, payload: unknown): payload is number[] => {
  if (!isVNodeRef(typeId) || !Array.isArray(payload)) {
    return false;
  }
  for (let i = 0; i < payload.length; i++) {
    if (!Number.isInteger(payload[i])) {
      return false;
    }
  }
  return payload.length > 1;
};

const float64 = /*#__PURE__*/ new DataView(new ArrayBuffer(8));

/** Removes what was remembered about the offsets from `firstOffset` on. */
const forgetFrom = (byOffset: Map<number, unknown> | null, firstOffset: number): void => {
  const offsets = byOffset ? Array.from(byOffset.keys()) : [];
  for (let i = 0; i < offsets.length; i++) {
    if (offsets[i] >= firstOffset) {
      byOffset!.delete(offsets[i]);
    }
  }
};

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
  /** The strings that other values refer to, by the offset they end at. */
  private $referencedStrings$ = new Map<number, string>();
  protected $pos$ = 0;
  /** Offset of the last unit of every root. */
  $rootEnds$ = new Uint32Array(0);
  /** Number of units in the stream. */
  $unitCount$ = 0;
  /**
   * Where the larger arrays without a stored length start, by their end offset, so that nested
   * shared values are not walked again by every value around them. Null while indexing roots, which
   * walks everything once.
   */
  private $skippedArrayStarts$: Map<number, number> | null = null;
  /** Work done so far; crafted input can make values overlap and be read over and over. */
  private $unitsRead$ = 0;
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

  /** @param text - The content of the root state script, if the container has one. */
  constructor(text?: string) {
    if (text) {
      this.$appendScript$(text);
      this.$seekArrayEnd$(this.$unitCount$ - 1);
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
    const previousUnitsRead = this.$unitsRead$;
    this.$appendScript$(text);
    let extraRootId: number | undefined;
    let forwardRefs: Array<number | string> | 0;
    const firstRoot = this.$rootEnds$.length;
    try {
      this.$seekArrayEnd$(this.$unitCount$ - 1);
      this.$openArray$();
      extraRootId = this.$restore$(null!, -1, false) as number | undefined;
      forwardRefs = this.$restore$(null!, -1, false) as Array<number | string> | 0;
      const rootListEnd = this.$pos$;
      this.$skip$();
      if (this.$restore$(null!, -1, false) !== firstRoot) {
        this.$dropScriptsFrom$(previousUnitCount, previousUnitsRead);
        return null;
      }
      this.$pos$ = rootListEnd - 1;
      this.$appendRoots$();
    } catch (error) {
      this.$dropScriptsFrom$(previousUnitCount, previousUnitsRead);
      throw error;
    }
    this.$onRootsAdded$();
    // A new root can be a value that was already restored inside its parent. Settle those now:
    // the offsets of restored values are forgotten once the stream is done.
    const restoredByOffset = this.$restoredByOffset$;
    for (let i = firstRoot; restoredByOffset && i < this.$rootEnds$.length; i++) {
      const restored = restoredByOffset.get(this.$rootEnds$[i]);
      if (restored !== undefined) {
        this.$onRootAllocated$(i, restored);
      }
    }
    return { $forwardRefs$: forwardRefs, $extraRootId$: extraRootId };
  }

  /**
   * Positions on the last item of the array root `rootIndex`, to read it backwards with
   * `$readNext$`.
   */
  $openArrayRoot$(rootIndex: number): number {
    this.$seekArrayEnd$(this.$rootEnds$[rootIndex]);
    return this.$openArray$();
  }

  /** Positions right before the ArrayEnd code at `end`, which must be there. */
  private $seekArrayEnd$(end: number): void {
    this.$seek$(end);
    if (this.$unit$(this.$pos$--) !== BinaryCode.ArrayEnd) {
      throw qError(QError.serializeErrorNotImplemented, [BinaryCode.ArrayEnd]);
    }
  }

  /** Forgets a rejected state patch: its units, its work and what was remembered about them. */
  private $dropScriptsFrom$(unitCount: number, unitsRead: number): void {
    this.$chunks$.pop();
    this.$chunkEnd$ = 0;
    this.$unitCount$ = unitCount;
    this.$unitsRead$ = unitsRead;
    forgetFrom(this.$skippedArrayStarts$, unitCount);
    forgetFrom(this.$referencedStrings$, unitCount);
  }

  /** Restores the plain value at the current position and moves before it. */
  $readNext$(): unknown {
    const code = this.$unit$(this.$pos$);
    if (code >= BinaryCode.Num0) {
      // Most tokens are small integers; skip the general restore.
      this.$charge$(1);
      this.$pos$--;
      return code - BinaryCode.Num0;
    }
    return this.$restore$(null!, -1, false);
  }

  $restoreRoot$(container: DeserializeContainer, rootIndex: number): unknown {
    this.$seek$(this.$rootEnds$[rootIndex]);
    return this.$restore$(container, rootIndex, false);
  }

  /** A unit of the chunk that holds the current position; a value never spans chunks. */
  protected $unit$(pos: number): number {
    return charCodeToUnit(this.$text$.charCodeAt(this.$base$ + pos));
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
    return charCodeToUnit(chunk.$text$.charCodeAt(chunk.$base$ + pos));
  }

  /** Moves the current position, to another chunk if needed. */
  protected $seek$(pos: number): void {
    this.$pos$ = pos;
    if (pos < this.$chunkStart$ || pos >= this.$chunkEnd$) {
      const chunk = this.$chunkAt$(pos);
      this.$text$ = chunk.$text$;
      this.$base$ = chunk.$base$;
      this.$chunkStart$ = chunk.$start$;
      this.$chunkEnd$ = chunk.$end$;
    }
  }

  /** Appends a state script: `~` followed by its part of the stream. */
  protected $appendScript$(script: string): void {
    const start = this.$unitCount$;
    const end = start + script.length - 1;
    this.$chunks$.push({ $text$: script, $base$: 1 - start, $start$: start, $end$: end });
    this.$unitCount$ = end;
  }

  /**
   * Written state is indexed once, restored once and has its shared values skipped once; a plain
   * value that is also a root is restored twice.
   */
  private $charge$(units: number): void {
    this.$unitsRead$ += units;
    if (this.$unitsRead$ > 8 * this.$unitCount$) {
      throw qError(QError.serializeErrorNotImplemented, [BinaryCode.ArrayEnd]);
    }
  }

  /** Reads the string whose code was just read. */
  protected $string$(code: number): string {
    if (code >= BinaryCode.StrAt1) {
      return this.$stringAt$(this.$uint$(code - BinaryCode.StrAt1 + 1));
    }
    const isEscaped = code >= BinaryCode.EscapedStr1;
    const length = this.$uint$(code - (isEscaped ? BinaryCode.EscapedStr1 : BinaryCode.Str1) + 1);
    if (length > this.$pos$ + 1 - this.$chunkStart$) {
      throw qError(QError.serializeErrorNotImplemented, [code]);
    }
    this.$charge$(length);
    const textEnd = this.$base$ + this.$pos$ + 1;
    this.$pos$ -= length;
    const text = this.$text$.slice(textEnd - length, textEnd);
    if (isEscaped) {
      return JSON.parse('"' + text + '"');
    }
    return text;
  }

  /** The string that ends at `offset`; every reference to it gets the same string. */
  private $stringAt$(offset: number): string {
    let value = this.$referencedStrings$.get(offset);
    if (value === undefined) {
      const resume = this.$pos$;
      this.$seek$(offset);
      const code = this.$unit$(this.$pos$--);
      if (code < BinaryCode.Str1 || code >= BinaryCode.StrAt1) {
        throw qError(QError.serializeErrorNotImplemented, [code]);
      }
      value = this.$string$(code);
      this.$referencedStrings$.set(offset, value);
      this.$seek$(resume);
    }
    return value;
  }

  /** Indexes the root list whose ArrayEnd is right after the current position. */
  private $appendRoots$(): void {
    const skippedArrayStarts = this.$skippedArrayStarts$;
    this.$skippedArrayStarts$ = null;
    try {
      this.$indexRoots$();
    } finally {
      this.$skippedArrayStarts$ = skippedArrayStarts || new Map();
    }
  }

  private $indexRoots$(): void {
    const firstRoot = this.$rootEnds$.length;
    const count = this.$openArray$();
    if (firstRoot + count >= MAX_ROOTS) {
      throw qError(QError.serializeErrorNotImplemented, [BinaryCode.ArrayEnd]);
    }
    const rootEnds = new Uint32Array(firstRoot + count);
    rootEnds.set(this.$rootEnds$);
    for (let i = firstRoot + count - 1; i >= firstRoot; i--) {
      rootEnds[i] = this.$pos$;
      this.$skip$();
    }
    // Skipping trusts operand widths; roots must not reach before their script.
    if (this.$pos$ < this.$chunkStart$ - 1) {
      throw qError(QError.serializeErrorNotImplemented, [BinaryCode.ArrayEnd]);
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
    this.$sharedValues$ = sharedValues.slice(0, sharedCount).sort();
  }

  /** The root that owns the nested value ending at `end`, or -1. */
  protected $sharedRoot$(end: number): number {
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

  /** Rejects an operand that would start before the chunk that holds the current position. */
  private $checkOperand$(unitCount: number): void {
    if (this.$pos$ - unitCount + 1 < this.$chunkStart$) {
      throw qError(QError.serializeErrorNotImplemented, [BinaryCode.ArrayEnd]);
    }
  }

  protected $uint$(unitCount: number): number {
    this.$checkOperand$(unitCount);
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
  protected $openArray$(): number {
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
  protected $skip$(): void {
    this.$charge$(1);
    const end = this.$pos$;
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
        const skippedArrayStarts = this.$skippedArrayStarts$;
        const start = skippedArrayStarts?.get(end);
        if (start !== undefined) {
          this.$pos$ = start;
          return;
        }
        for (let i = 0; i < count; i++) {
          this.$skip$();
        }
        if (skippedArrayStarts && end - this.$pos$ > BinaryCode.MaxUnsizedItems) {
          skippedArrayStarts.set(end, this.$pos$);
        }
      }
    } else if (code >= BinaryCode.StrAt1) {
      this.$pos$ -= code - BinaryCode.StrAt1 + 1;
    } else if (code >= BinaryCode.Str1) {
      // Str1-4 and EscapedStr1-4: the characters, then their count
      const length = this.$uint$(((code - BinaryCode.Str1) & 3) + 1);
      this.$pos$ -= length;
    } else if (code === BinaryCode.Float) {
      this.$pos$ -= 10;
    } else if (code < BinaryCode.NegInt1) {
      this.$pos$ -= code - BinaryCode.Int1 + 1;
    } else if (code < BinaryCode.Root1) {
      this.$pos$ -= code - BinaryCode.NegInt1 + 1;
    } else if (code < BinaryCode.Shared1) {
      this.$pos$ -= code - BinaryCode.Root1 + 1;
    } else {
      this.$pos$ -= code - BinaryCode.Shared1 + 1;
    }
  }

  protected $float$(): number {
    this.$checkOperand$(10);
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
   * @param rootIndex - The root this value is, or -1.
   * @param isNested - Whether the value is an item of another value.
   */
  private $restore$(
    container: DeserializeContainer,
    rootIndex: number,
    isNested: boolean
  ): unknown {
    this.$charge$(1);
    const end = this.$pos$;
    const code = this.$unit$(this.$pos$--);
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
    if (code > BinaryCode.Float) {
      return this.$string$(code);
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
    if (code < BinaryCode.Root1) {
      return -this.$uint$(code - BinaryCode.NegInt1 + 1);
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
    if (this.$unit$(this.$pos$) !== BinaryCode.ArrayEnd || isVNodeRef(typeId)) {
      const payload = this.$restore$(container, -1, false);
      const resume = this.$pos$;
      if (typeof payload === 'string') {
        if (payload.length > BinaryCode.MaxSharedPayloadLength) {
          // A referenced string is read once, but every value made from it parses it again.
          this.$charge$(payload.length);
        }
      } else if (typeof payload !== 'number' && !isVNodeRefPath(typeId, payload)) {
        // Anything else would go through the inflate of JSON state, which is not counted.
        throw qError(QError.serializeErrorNotImplemented, [typeId]);
      }
      if (typeId === TypeIds.Array) {
        // An array is written as its items; binary-only builds have no other way to fill one.
        throw qError(QError.serializeErrorNotImplemented, [typeId]);
      }
      const value = allocate(container, typeId, payload);
      if (needsInflation(typeId)) {
        inflateRestored(container, value, typeId, payload);
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
