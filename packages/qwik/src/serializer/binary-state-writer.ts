import { BINARY_STATE_PREFIX, BinaryCode, TypeIds } from './qwik-copy';

const float64 = /*#__PURE__*/ new DataView(new ArrayBuffer(8));
const UNIT = 128;

/**
 * Collects the binary state stream: 7-bit units, every value followed by its code.
 *
 * @internal
 */
export class BinaryStateWriter {
  private $units$ = new Uint8Array(1 << 14);
  /** Number of units written; also the offset after the last written value. */
  $length$ = 0;
  private $strings$: string[] = [];
  private $stringIndexes$ = new Map<string, number>();
  private $previousSharedEnd$ = 0;

  private $push$(unit: number): void {
    if (this.$length$ === this.$units$.length) {
      const grown = new Uint8Array(this.$length$ * 2);
      grown.set(this.$units$);
      this.$units$ = grown;
    }
    this.$units$[this.$length$++] = unit;
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
    } else if (value < BinaryCode.Str0 - BinaryCode.Num0) {
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
    let index = this.$stringIndexes$.get(value);
    if (index === undefined) {
      index = this.$strings$.length;
      this.$strings$.push(value);
      this.$stringIndexes$.set(value, index);
    }
    if (index < UNIT - BinaryCode.Str0) {
      this.$push$(BinaryCode.Str0 + index);
    } else {
      this.$uint$(index, BinaryCode.Str1, 3);
    }
  }

  $constant$(constant: number): void {
    this.$push$(constant);
  }

  $rootRef$(rootIndex: number): void {
    this.$uint$(rootIndex, BinaryCode.Root1, 3);
  }

  /** A root that is the already written value ending before `offsetAfterValue`. */
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

  /** The content of the state script. */
  toString(): string {
    const units = this.$units$.subarray(0, this.$length$);
    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      // NUL, CR and `<` do not survive in a script element.
      if (unit === 0 || unit === 13 || unit === 60) {
        units[i] = unit | BinaryCode.EscapeBit;
      }
    }
    let text = '';
    for (let i = 0; i < units.length; i += 0x8000) {
      text += String.fromCharCode.apply(null, units.subarray(i, i + 0x8000) as any);
    }
    // `<` would let string content close the script element.
    const strings = JSON.stringify(this.$strings$).replace(/</g, '\\u003c');
    return BINARY_STATE_PREFIX + strings + '\n' + text;
  }
}
