import { BinaryCode, BinaryStateReader } from './binary-state';
import { TypeIds } from './constants';

/**
 * Reads binary state scripts back into the typeId/value pairs of the JSON state, for tooling.
 *
 * Created on first use: this module is part of an import cycle with the reader it extends.
 */
const createDumperClass = () =>
  class BinaryStateDumper extends BinaryStateReader {
    /** The pairs of the array that ends the last of `scripts`: its root list or its patch. */
    $lastScriptPairs$(scripts: string[]): unknown[] {
      for (let i = 0; i < scripts.length; i++) {
        this.$appendScript$(scripts[i]);
      }
      this.$seek$(this.$unitCount$ - 1);
      const pair: unknown[] = [];
      this.$readPair$(pair, 0, false);
      return pair[1] as unknown[];
    }

    /**
     * The pairs of every indexed root. A value that is also a root is read as that root and shows
     * as a RootRef where it is nested, which is the form `preprocessState` gives the JSON state.
     */
    $rootPairs$(): unknown[] {
      const pairs: unknown[] = Array(this.$rootEnds$.length * 2);
      for (let i = 0; i < this.$rootEnds$.length; i++) {
        this.$seek$(this.$rootEnds$[i]);
        this.$readPair$(pairs, i * 2, true);
      }
      return pairs;
    }

    /**
     * Writes the typeId and value of the value ending at the current position to `out`.
     *
     * @param resolveShared Whether the roots are indexed, so shared values can be told apart.
     */
    private $readPair$(out: unknown[], at: number, resolveShared: boolean, isNested = false): void {
      const end = this.$pos$;
      const code = this.$unit$(this.$pos$--);
      const sharedRoot =
        resolveShared && isNested && code >= BinaryCode.ArrayEnd && code < BinaryCode.Num0
          ? this.$sharedRoot$(end)
          : -1;
      if (sharedRoot !== -1) {
        this.$pos$ = end;
        this.$skip$();
        out[at] = TypeIds.RootRef;
        out[at + 1] = sharedRoot;
        return;
      }
      let typeId: TypeIds = TypeIds.Plain;
      let value: unknown;
      if (code >= BinaryCode.Num0) {
        value = code - BinaryCode.Num0;
      } else if (code >= BinaryCode.Type0) {
        this.$readPair$(out, at, resolveShared);
        typeId = code - BinaryCode.Type0;
        value = out[at + 1];
        if (typeId === TypeIds.ForwardRefs) {
          value = (value as unknown[]).filter((_, i) => i & 1);
        } else if (typeId === TypeIds.VNode || typeId === TypeIds.RefVNode) {
          value = vnodeRefIdToText(value);
        }
      } else if (code === BinaryCode.ArrayEnd) {
        const pairs: unknown[] = Array(this.$openArray$() * 2);
        for (let i = pairs.length - 2; i >= 0; i -= 2) {
          this.$readPair$(pairs, i, resolveShared, true);
        }
        typeId = TypeIds.Array;
        value = pairs;
      } else if (code < BinaryCode.Int1) {
        typeId = TypeIds.Constant;
        value = code;
      } else if (code > BinaryCode.Float) {
        value = this.$string$(code);
      } else if (code === BinaryCode.Float) {
        value = this.$float$();
      } else if (code >= BinaryCode.Decimal1) {
        this.$readPair$(out, at, resolveShared);
        value = (out[at + 1] as number) / 10 ** (code - BinaryCode.Decimal1 + 1);
      } else if (code < BinaryCode.NegInt1) {
        value = this.$uint$(code - BinaryCode.Int1 + 1);
      } else if (code < BinaryCode.Root1) {
        value = -this.$uint$(code - BinaryCode.NegInt1 + 1);
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
  };

/** Binary state writes `12AB` as `12` or `[12, 0, 1]`; the JSON state has the text form. */
const vnodeRefIdToText = (value: unknown): unknown => {
  if (typeof value === 'number') {
    return String(value);
  }
  if (!Array.isArray(value)) {
    return value;
  }
  let text = String(value[1]);
  for (let i = 3; i < value.length; i += 2) {
    let childIdx = value[i] as number;
    // the last letter of each child index is uppercase
    let letters = String.fromCharCode(65 + (childIdx % 26));
    while ((childIdx = Math.floor(childIdx / 26))) {
      letters = String.fromCharCode(97 + (childIdx % 26)) + letters;
    }
    text += letters;
  }
  return text;
};

let Dumper: ReturnType<typeof createDumperClass> | undefined;
const newDumper = (rootScript?: string) => new (Dumper ||= createDumperClass())(rootScript);

/**
 * The JSON form of the last of `scripts`: the root pairs, or for a patch `[rootStart, rootPairs,
 * forwardRefs | 0, extraRootId]`. The scripts before it supply the strings it refers to.
 *
 * @internal
 */
export const binaryStateToJson = (scripts: string[], isPatch: boolean): unknown[] => {
  const pairs = newDumper().$lastScriptPairs$(scripts);
  if (!isPatch) {
    return pairs;
  }
  const extraRootId = pairs[6] === TypeIds.Constant ? undefined : pairs[7];
  return [pairs[1], pairs[3], pairs[5], extraRootId];
};

/**
 * The roots of a container's binary state as the typeId/value pairs that `preprocessState` gives
 * the JSON state, with the roots and forward refs of its patches merged in.
 *
 * @internal
 */
export const binaryStateRootsToJson = (
  rootScript: string | null | undefined,
  patchScripts: string[] = []
): unknown[] => {
  const dumper = newDumper(rootScript || undefined);
  const patchForwardRefs: Array<number | string> = [];
  for (let i = 0; i < patchScripts.length; i++) {
    const forwardRefs = dumper.$addPatch$(patchScripts[i])?.$forwardRefs$;
    for (let j = 0; forwardRefs && j < forwardRefs.length; j++) {
      patchForwardRefs.push(forwardRefs[j]);
    }
  }
  const pairs = dumper.$rootPairs$();
  if (patchForwardRefs.length) {
    const forwardRefsAt = pairs.findIndex((item, i) => i % 2 === 0 && item === TypeIds.ForwardRefs);
    if (forwardRefsAt === -1) {
      pairs.push(TypeIds.ForwardRefs, patchForwardRefs);
    } else {
      pairs[forwardRefsAt + 1] = [...(pairs[forwardRefsAt + 1] as unknown[]), ...patchForwardRefs];
    }
  }
  return pairs;
};
