import { BinaryCode, BinaryStateReader } from './binary-state';
import { TypeIds } from './constants';

/** Reads binary state scripts back into the typeId/value pairs of the JSON state, for tooling. */
class BinaryStateDumper extends BinaryStateReader {
  constructor(scripts: string[]) {
    super();
    for (let i = 0; i < scripts.length; i++) {
      this.$appendScript$(scripts[i]);
    }
  }

  /** The pairs of the array that ends the last script: its root list or its patch. */
  $lastScriptPairs$(): unknown[] {
    this.$seek$(this.$unitCount$ - 1);
    const pair: unknown[] = [];
    this.$readPair$(pair, 0);
    return pair[1] as unknown[];
  }

  /** Writes the typeId and value of the value ending at the current position to `out`. */
  private $readPair$(out: unknown[], at: number): void {
    const code = this.$unit$(this.$pos$--);
    let typeId: TypeIds = TypeIds.Plain;
    let value: unknown;
    if (code >= BinaryCode.Str0) {
      value = this.$strings$[code - BinaryCode.Str0];
    } else if (code >= BinaryCode.Num0) {
      value = code - BinaryCode.Num0;
    } else if (code >= BinaryCode.Type0) {
      this.$readPair$(out, at);
      typeId = code - BinaryCode.Type0;
      value = out[at + 1];
      if (typeId === TypeIds.ForwardRefs) {
        value = (value as unknown[]).filter((_, i) => i & 1);
      }
    } else if (code === BinaryCode.ArrayEnd) {
      const pairs: unknown[] = Array(this.$openArray$() * 2);
      for (let i = pairs.length - 2; i >= 0; i -= 2) {
        this.$readPair$(pairs, i);
      }
      typeId = TypeIds.Array;
      value = pairs;
    } else if (code < BinaryCode.Int1) {
      typeId = TypeIds.Constant;
      value = code;
    } else if (code === BinaryCode.Float) {
      value = this.$float$();
    } else if (code >= BinaryCode.Decimal1) {
      this.$readPair$(out, at);
      value = (out[at + 1] as number) / 10 ** (code - BinaryCode.Decimal1 + 1);
    } else if (code < BinaryCode.NegInt1) {
      value = this.$uint$(code - BinaryCode.Int1 + 1);
    } else if (code < BinaryCode.Str1) {
      value = -this.$uint$(code - BinaryCode.NegInt1 + 1);
    } else if (code < BinaryCode.Root1) {
      value = this.$strings$[this.$uint$(code - BinaryCode.Str1 + 1)];
    } else if (code < BinaryCode.Shared1) {
      typeId = TypeIds.RootRef;
      value = this.$uint$(code - BinaryCode.Root1 + 1);
    } else {
      // A root that is a value written earlier; the JSON state has a path here.
      this.$uint$(code - BinaryCode.Shared1 + 1);
      typeId = TypeIds.RootRef;
      value = 'shared';
    }
    out[at] = typeId;
    out[at + 1] = value;
  }
}

/**
 * The JSON form of the last of `scripts`: the root pairs, or for a patch `[rootStart, rootPairs,
 * forwardRefs | 0, extraRootId]`. The scripts before it supply the strings it refers to.
 *
 * @internal
 */
export const binaryStateToJson = (scripts: string[], isPatch: boolean): unknown[] => {
  const pairs = new BinaryStateDumper(scripts).$lastScriptPairs$();
  if (!isPatch) {
    return pairs;
  }
  const extraRootId = pairs[6] === TypeIds.Constant ? undefined : pairs[7];
  return [pairs[1], pairs[3], pairs[5], extraRootId];
};
