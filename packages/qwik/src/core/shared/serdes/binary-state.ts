import { QError, qError } from '../error/error';
import { TypeIds } from './constants';

/**
 * Byte codes of the binary state stream.
 *
 * Every value is its data followed by one code byte, so the stream is read backwards from its last
 * byte. Codes 0-21 are the `Constants`.
 *
 * @internal
 */
export const enum BinaryCode {
  /** - 1 byte */
  Int8 = 22,
  NegInt8,
  /** - 2 bytes */
  Int16,
  NegInt16,
  /** - 4 bytes */
  Int32,
  NegInt32,
  /** - 8 bytes float64 */
  Float,
  /** - 1-3 bytes string index */
  Str8,
  Str16,
  Str24,
  /** - 1-3 bytes root index */
  Root8,
  Root16,
  Root24,
  /** - 1-4 bytes: the value ending at that byte offset. Only valid as a root. */
  Offset8,
  Offset16,
  Offset24,
  Offset32,
  /** Reserved */
  Unused,
  /** - 1-4 bytes: byte length of the array items that precede it */
  Items8,
  Items16,
  Items24,
  Items32,
  /** Preceded by the item count (an integer value) and an `Items*` marker */
  ArrayEnd,
  /** `Type0 + TypeIds`, preceded by the payload value */
  Type0,
  /** Integers 0-63 */
  Num0 = 100,
  /** Root refs 0-27 */
  Root0 = 164,
  /** String indexes 0-63 */
  Str0 = 192,
}

const MAX_ROOTS = 0x100000;
const float64 = /*#__PURE__*/ new Float64Array(1);
const float64Bytes = /*#__PURE__*/ new Uint8Array(float64.buffer);

const decodeBase64 = (base64: string): Uint8Array => {
  const fromBase64 = (Uint8Array as any).fromBase64 as ((s: string) => Uint8Array) | undefined;
  if (fromBase64) {
    return fromBase64(base64);
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

/** JSON state starts with `[`, which is not a base64 character. */
export const isBinaryState = (text: string): boolean => text.charCodeAt(0) !== 91;

/**
 * Reads roots on demand from the binary state stream, producing the `[typeId, value]` pairs that
 * `allocate()` and `inflate()` consume.
 *
 * @internal
 */
export class BinaryStateReader {
  $bytes$: Uint8Array;
  $strings$: string[];
  $pos$ = 0;
  /** Offset of the last byte of every root. */
  $rootEnds$: Uint32Array;
  /**
   * Nested values that are also a root, sorted, each `endOffset * MAX_ROOTS + rootIndex`.
   *
   * Shortcut: caps the state at 2^20 roots (float64 keys stay exact); split the key to go higher.
   */
  $sharedValues$: Float64Array;
  $forwardRefs$: Array<number | string> | null = null;

  /** @param text `<base64 bytes>\n<JSON array of strings>` */
  constructor(text: string) {
    const separator = text.indexOf('\n');
    this.$bytes$ = decodeBase64(text.slice(0, separator));
    this.$strings$ = JSON.parse(text.slice(separator + 1));
    this.$sharedValues$ = new Float64Array(0);
    this.$rootEnds$ = this.$indexRoots$();
  }

  /** Writes the typeId and value of root `index` to `out[0]` and `out[1]`. */
  $readRoot$(index: number, out: unknown[]): void {
    this.$pos$ = this.$rootEnds$[index];
    const code = this.$bytes$[this.$pos$];
    if (code >= BinaryCode.Offset8 && code <= BinaryCode.Offset32) {
      this.$pos$--;
      this.$pos$ = this.$uint$(code - BinaryCode.Offset8 + 1);
    }
    this.$read$(out, 0, false);
  }

  private $indexRoots$(): Uint32Array {
    const bytes = this.$bytes$;
    this.$pos$ = bytes.length - 2; // before ArrayEnd
    const count = this.$openArray$();
    if (count >= MAX_ROOTS) {
      throw qError(QError.serializeErrorNotImplemented, [BinaryCode.ArrayEnd]);
    }
    const rootEnds = new Uint32Array(count);
    const sharedValues = new Float64Array(count);
    let sharedCount = 0;
    const pair: unknown[] = [0, 0];
    for (let i = count - 1; i >= 0; i--) {
      const end = (rootEnds[i] = this.$pos$);
      const code = bytes[end];
      if (code >= BinaryCode.Offset8 && code <= BinaryCode.Offset32) {
        this.$pos$--;
        const target = this.$uint$(code - BinaryCode.Offset8 + 1);
        const targetCode = bytes[target];
        // Plain values have no identity, they can be read twice.
        if (targetCode >= BinaryCode.ArrayEnd && targetCode < BinaryCode.Num0) {
          sharedValues[sharedCount++] = target * MAX_ROOTS + i;
        }
      } else if (code === BinaryCode.Type0 + TypeIds.ForwardRefs) {
        this.$read$(pair, 0, false);
        this.$forwardRefs$ = pair[1] as Array<number | string>;
      } else {
        this.$skip$();
      }
    }
    this.$sharedValues$ = sharedValues.slice(0, sharedCount).sort();
    return rootEnds;
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

  private $uint$(byteCount: number): number {
    const bytes = this.$bytes$;
    let value = 0;
    for (let i = 0; i < byteCount; i++) {
      value = value * 256 + bytes[this.$pos$ - i];
    }
    this.$pos$ -= byteCount;
    return value;
  }

  /** After an ArrayEnd code: returns the item count and leaves the position on the last item. */
  private $openArray$(): number {
    const countCode = this.$bytes$[this.$pos$--];
    const count =
      countCode >= BinaryCode.Num0
        ? countCode - BinaryCode.Num0
        : this.$uint$(countCode === BinaryCode.Int8 ? 1 : countCode === BinaryCode.Int16 ? 2 : 4);
    const byteLength = this.$uint$(this.$bytes$[this.$pos$--] - BinaryCode.Items8 + 1);
    // Every item is at least one byte; reject counts that would over-allocate.
    if (!(count <= byteLength && byteLength <= this.$pos$ + 1)) {
      throw qError(QError.serializeErrorNotImplemented, [BinaryCode.ArrayEnd]);
    }
    this.$arrayByteLength$ = byteLength;
    return count;
  }
  private $arrayByteLength$ = 0;

  /** Moves past one value without decoding it. */
  private $skip$(): void {
    const code = this.$bytes$[this.$pos$--];
    if (code < BinaryCode.Int8 || code >= BinaryCode.Num0) {
      return;
    }
    if (code >= BinaryCode.Type0) {
      return this.$skip$();
    }
    if (code === BinaryCode.ArrayEnd) {
      this.$openArray$();
      this.$pos$ -= this.$arrayByteLength$;
    } else if (code === BinaryCode.Float) {
      this.$pos$ -= 8;
    } else if (code <= BinaryCode.NegInt32) {
      this.$pos$ -= code <= BinaryCode.NegInt8 ? 1 : code <= BinaryCode.NegInt16 ? 2 : 4;
    } else if (code <= BinaryCode.Str24) {
      this.$pos$ -= code - BinaryCode.Str8 + 1;
    } else if (code <= BinaryCode.Root24) {
      this.$pos$ -= code - BinaryCode.Root8 + 1;
    } else {
      this.$pos$ -= code - BinaryCode.Offset8 + 1;
    }
  }

  /** Reads the value ending at the current position into `out[at]` (typeId) and `out[at + 1]`. */
  private $read$(out: unknown[], at: number, isNested: boolean): void {
    const end = this.$pos$;
    const code = this.$bytes$[this.$pos$--];
    let typeId: TypeIds = TypeIds.Plain;
    let value: unknown;
    if (code >= BinaryCode.Str0) {
      value = this.$strings$[code - BinaryCode.Str0];
    } else if (code >= BinaryCode.Root0) {
      typeId = TypeIds.RootRef;
      value = code - BinaryCode.Root0;
    } else if (code >= BinaryCode.Num0) {
      value = code - BinaryCode.Num0;
    } else if (code >= BinaryCode.ArrayEnd) {
      const sharedRoot = isNested ? this.$sharedRoot$(end) : -1;
      if (sharedRoot !== -1) {
        // The root owns the value so that every reference resolves to one object.
        this.$pos$ = end;
        this.$skip$();
        typeId = TypeIds.RootRef;
        value = sharedRoot;
      } else if (code === BinaryCode.ArrayEnd) {
        const count = this.$openArray$();
        const pairs: unknown[] = new Array(count * 2);
        for (let i = count - 1; i >= 0; i--) {
          this.$read$(pairs, i * 2, true);
        }
        typeId = TypeIds.Array;
        value = pairs;
      } else {
        typeId = code - BinaryCode.Type0;
        // The payload is a plain value or an array; its own typeId is replaced below.
        this.$read$(out, at, false);
        value = out[at + 1];
        if (typeId === TypeIds.ForwardRefs) {
          value = (value as unknown[]).filter((_, i) => i & 1);
        }
      }
    } else if (code < BinaryCode.Int8) {
      typeId = TypeIds.Constant;
      value = code;
    } else if (code === BinaryCode.Float) {
      for (let i = 7; i >= 0; i--) {
        float64Bytes[i] = this.$bytes$[this.$pos$--];
      }
      value = float64[0];
    } else if (code <= BinaryCode.NegInt32) {
      value = this.$uint$(code <= BinaryCode.NegInt8 ? 1 : code <= BinaryCode.NegInt16 ? 2 : 4);
      if ((code - BinaryCode.Int8) & 1) {
        value = -(value as number);
      }
    } else if (code <= BinaryCode.Str24) {
      value = this.$strings$[this.$uint$(code - BinaryCode.Str8 + 1)];
    } else if (code <= BinaryCode.Root24) {
      typeId = TypeIds.RootRef;
      value = this.$uint$(code - BinaryCode.Root8 + 1);
    } else {
      throw qError(QError.serializeErrorNotImplemented, [code]);
    }
    out[at] = typeId;
    out[at + 1] = value;
  }
}
