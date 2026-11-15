import { BINARY_STATE_PREFIX, BinaryCode, TypeIds } from './qwik-copy';

const float64 = /*#__PURE__*/ new DataView(new ArrayBuffer(8));
const UNIT = 128;
/** Text is written out once this many characters are waiting. */
const FLUSH_AT = 1 << 12;

/**
 * What the state scripts of one container share: the root state and its patches are one stream.
 *
 * @internal
 */
export interface BinaryStateStream {
  /** The offset every repeatable string written so far ends at. */
  $stringEnds$: Map<string, number>;
  /** Length of the stream written by the scripts before the current one. */
  $length$: number;
}

/** Characters that a script element would alter, and strings that UTF-8 cannot carry. */
const needsEscaping = (value: string): boolean =>
  /[\0\r<]/.test(value) || (value as any).isWellFormed?.() === false;

/**
 * Writes one state script: 7-bit units with the characters of strings in between, every value
 * followed by its code.
 *
 * @internal
 */
export class BinaryStateWriter {
  /** Text that is not written out yet. */
  private $text$ = BINARY_STATE_PREFIX;
  /** Units that are not part of the text yet. */
  private $units$ = new Uint8Array(1 << 12);
  private $unitCount$ = 0;
  /** Length of what this script has written. */
  $length$ = 0;
  private $previousSharedEnd$ = 0;

  /** @param $write$ Receives the content of the script, in pieces, as it is produced. */
  constructor(
    private $stream$: BinaryStateStream,
    private $write$: (text: string) => void
  ) {}

  /** The offset in the stream after the last written value. */
  get $offset$(): number {
    return this.$stream$.$length$ + this.$length$;
  }

  private $push$(unit: number): void {
    if (this.$unitCount$ === this.$units$.length) {
      this.$flush$();
    }
    // NUL, CR and `<` do not survive in a script element.
    this.$units$[this.$unitCount$++] =
      unit === 0 || unit === 13 || unit === 60 ? unit | BinaryCode.EscapeBit : unit;
    this.$length$++;
  }

  private $flushUnits$(): void {
    if (this.$unitCount$) {
      this.$text$ += String.fromCharCode.apply(
        null,
        this.$units$.subarray(0, this.$unitCount$) as any
      );
      this.$unitCount$ = 0;
    }
  }

  /** Writes out everything produced so far. */
  $flush$(): void {
    this.$flushUnits$();
    if (this.$text$) {
      this.$write$(this.$text$);
      this.$text$ = '';
    }
  }

  /** Writes `value` in the fewest units, then the code for that width. */
  private $uint$(value: number, firstCode: BinaryCode, maxUnits: number): void {
    let unitCount = 0;
    do {
      this.$push$(value % UNIT);
      value = Math.floor(value / UNIT);
      unitCount++;
    } while (value > 0);
    if (unitCount > maxUnits) {
      throw new Error('Binary state: value does not fit code ' + firstCode);
    }
    this.$push$(firstCode + unitCount - 1);
  }

  /** Whether `value` is an integer the integer codes can hold. */
  private $isInteger$(value: number): boolean {
    return Number.isInteger(value) && value > -(UNIT ** 4) && value < UNIT ** 6;
  }

  private $integer$(value: number): void {
    if (value < 0) {
      this.$uint$(-value, BinaryCode.NegInt1, 4);
    } else if (value < UNIT - BinaryCode.Num0) {
      this.$push$(BinaryCode.Num0 + value);
    } else {
      this.$uint$(value, BinaryCode.Int1, 6);
    }
  }

  $number$(value: number): void {
    if (this.$isInteger$(value)) {
      return this.$integer$(value);
    }
    // Short decimals compress better as an integer than as float bits.
    for (let digits = 1; digits <= 4; digits++) {
      const scaled = Math.round(value * 10 ** digits);
      if (this.$isInteger$(scaled) && scaled / 10 ** digits === value) {
        this.$integer$(scaled);
        return this.$push$(BinaryCode.Decimal1 + digits - 1);
      }
    }
    float64.setFloat64(0, value);
    // 64 bits in 10 units, most significant unit last so that it is read first.
    const units: number[] = [];
    let bits = 0;
    let bitCount = 6;
    for (let i = 0; i < 8; i++) {
      bits = (bits << 8) | float64.getUint8(i);
      bitCount += 8;
      while (bitCount >= 7) {
        bitCount -= 7;
        units.push((bits >> bitCount) & 127);
        bits &= (1 << bitCount) - 1;
      }
    }
    for (let i = units.length - 1; i >= 0; i--) {
      this.$push$(units[i]);
    }
    this.$push$(BinaryCode.Float);
  }

  $string$(value: string): void {
    const stringEnds = this.$stream$.$stringEnds$;
    const isRepeatable = value.length > BinaryCode.MaxRepeatedStringLength;
    const writtenEnd = isRepeatable ? stringEnds.get(value) : undefined;
    if (writtenEnd !== undefined) {
      return this.$uint$(writtenEnd, BinaryCode.StrAt1, 4);
    }
    let text = value;
    let code = BinaryCode.Str1;
    if (needsEscaping(value)) {
      text = JSON.stringify(value).slice(1, -1).replace(/</g, '\\u003c');
      code = BinaryCode.EscapedStr1;
    }
    this.$flushUnits$();
    this.$text$ += text;
    this.$length$ += text.length;
    if (this.$text$.length >= FLUSH_AT) {
      this.$flush$();
    }
    this.$uint$(text.length, code, 4);
    if (isRepeatable) {
      stringEnds.set(value, this.$offset$ - 1);
    }
  }

  $constant$(constant: number): void {
    this.$push$(constant);
  }

  $rootRef$(rootIndex: number): void {
    this.$uint$(rootIndex, BinaryCode.Root1, 3);
  }

  /** A root that is the already written value ending before the stream offset `offsetAfterValue`. */
  $sharedRoot$(offsetAfterValue: number): void {
    const end = offsetAfterValue - 1;
    const delta = end - this.$previousSharedEnd$;
    this.$previousSharedEnd$ = end;
    this.$uint$(delta >= 0 ? delta * 2 : -delta * 2 - 1, BinaryCode.Shared1, 4);
  }

  /** Closes the array whose items were written from `start` on. */
  $endArray$(start: number, itemCount: number): void {
    if (itemCount <= BinaryCode.MaxUnsizedItems) {
      this.$push$(BinaryCode.Items0);
    } else {
      this.$uint$(this.$length$ - start, BinaryCode.Items1, 4);
    }
    this.$integer$(itemCount);
    this.$push$(BinaryCode.ArrayEnd);
  }

  $type$(typeId: TypeIds): void {
    this.$push$(BinaryCode.Type0 + typeId);
  }

  /** Ends the script. */
  $finish$(): void {
    this.$flush$();
    this.$stream$.$length$ += this.$length$;
  }
}
