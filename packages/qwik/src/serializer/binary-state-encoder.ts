import { BinaryCode, TypeIds } from './qwik-copy';

type StateLocation = { parent: unknown[]; index: number };

/**
 * Root path refs ("1 0 2") are defined against the state as `preprocessState` rewrites it root by
 * root. Resolve each one to its location in the unmodified state.
 */
const resolveRootPaths = (state: unknown[]): Map<number, StateLocation> => {
  const targets = new Map<number, StateLocation>();
  const rootLocation = (index: number) => targets.get(index) ?? { parent: state, index };
  for (let root = 0; root < state.length / 2; root++) {
    const path = state[root * 2 + 1];
    if (state[root * 2] !== TypeIds.RootRef || typeof path !== 'string' || !path.includes(' ')) {
      continue;
    }
    let location: StateLocation = { parent: state, index: 0 };
    let container = state;
    const parts = path.split(' ');
    for (let i = 0; i < parts.length; i++) {
      const index = Number(parts[i]);
      location = container === state ? rootLocation(index) : { parent: container, index };
      const value = location.parent[location.index * 2 + 1];
      if (location.parent[location.index * 2] === TypeIds.RootRef && typeof value === 'number') {
        location = rootLocation(value);
      }
      container = location.parent[location.index * 2 + 1] as unknown[];
    }
    targets.set(root, location);
  }
  return targets;
};

const float64 = /*#__PURE__*/ new Float64Array(1);
const float64Bytes = /*#__PURE__*/ new Uint8Array(float64.buffer);

/**
 * Transcodes the JSON state into the binary state script content.
 *
 * Shortcut: re-parses the serializer's JSON output; write bytes from the serializer when this
 * leaves the experiment.
 *
 * @internal
 */
export function _encodeBinaryState(stateJson: string): string {
  const state = JSON.parse(stateJson) as unknown[];
  let bytes = new Uint8Array(1 << 16);
  let length = 0;
  const strings: string[] = [];
  const stringIndexes = new Map<string, number>();
  /** Offset after every written value, per container; 0 means not written yet. */
  const valueEnds = new Map<unknown[], Uint32Array>();
  const rootPathTargets = resolveRootPaths(state);

  const push = (byte: number) => {
    if (length === bytes.length) {
      const grown = new Uint8Array(length * 2);
      grown.set(bytes);
      bytes = grown;
    }
    bytes[length++] = byte;
  };
  /** Writes `value` in the fewest bytes, then the code for that width. */
  const writeUint = (value: number, firstCode: BinaryCode) => {
    const byteCount = value < 0x100 ? 1 : value < 0x10000 ? 2 : value < 0x1000000 ? 3 : 4;
    for (let i = 0; i < byteCount; i++) {
      push(value & 255);
      value = Math.floor(value / 256);
    }
    push(firstCode + byteCount - 1);
  };
  const writeNumber = (value: number) => {
    const magnitude = Math.abs(value);
    if (!Number.isInteger(value) || magnitude >= 0x100000000 || Object.is(value, -0)) {
      float64[0] = value;
      for (let i = 0; i < 8; i++) {
        push(float64Bytes[i]);
      }
      return push(BinaryCode.Float);
    }
    if (value >= 0 && value < 64) {
      return push(BinaryCode.Num0 + value);
    }
    const sign = value < 0 ? 1 : 0;
    const byteCount = magnitude < 0x100 ? 1 : magnitude < 0x10000 ? 2 : 4;
    let rest = magnitude;
    for (let i = 0; i < byteCount; i++) {
      push(rest & 255);
      rest = Math.floor(rest / 256);
    }
    push(BinaryCode.Int8 + (byteCount === 1 ? 0 : byteCount === 2 ? 2 : 4) + sign);
  };
  const writeString = (value: string) => {
    let index = stringIndexes.get(value);
    if (index === undefined) {
      index = strings.length;
      strings.push(value);
      stringIndexes.set(value, index);
    }
    if (index < 64) {
      push(BinaryCode.Str0 + index);
    } else {
      writeUint(index, BinaryCode.Str8);
    }
  };
  const writePlain = (value: unknown) =>
    typeof value === 'number' ? writeNumber(value) : writeString(value as string);
  const writeRootRef = (index: number) =>
    index < 28 ? push(BinaryCode.Root0 + index) : writeUint(index, BinaryCode.Root8);
  const writeRootPath = (root: number) => {
    const target = rootPathTargets.get(root);
    if (target?.parent === state) {
      return writeRootRef(target.index);
    }
    const afterTarget = target && valueEnds.get(target.parent)?.[target.index];
    if (!afterTarget) {
      throw new Error('Binary state: unresolved path ref in root ' + root);
    }
    writeUint(afterTarget - 1, BinaryCode.Offset8);
  };
  const writeArray = (items: unknown[], isRaw: boolean) => {
    const start = length;
    const step = isRaw ? 1 : 2;
    const ends = new Uint32Array(isRaw ? 0 : items.length / 2);
    if (!isRaw) {
      valueEnds.set(items, ends);
    }
    for (let i = 0; i < items.length; i += step) {
      if (isRaw) {
        writePlain(items[i]);
      } else {
        writeValue(items[i] as TypeIds, items[i + 1], items === state ? i / 2 : -1);
        ends[i / 2] = length;
      }
    }
    writeUint(length - start, BinaryCode.Items8);
    writeNumber(items.length / step);
    push(BinaryCode.ArrayEnd);
  };
  const writeValue = (typeId: TypeIds, value: unknown, root: number) => {
    if (typeId === TypeIds.Plain) {
      return writePlain(value);
    }
    if (typeId === TypeIds.Constant) {
      return push(value as number);
    }
    if (typeId === TypeIds.RootRef) {
      if (typeof value === 'number' || !(value as string).includes(' ')) {
        return writeRootRef(Number(value));
      }
      if (root === -1) {
        throw new Error('Binary state: nested path ref');
      }
      return writeRootPath(root);
    }
    if (Array.isArray(value)) {
      // Forward refs are a list of plain values, not typeId/value pairs.
      writeArray(value, typeId === TypeIds.ForwardRefs);
    } else {
      writePlain(value);
    }
    if (typeId !== TypeIds.Array) {
      push(BinaryCode.Type0 + typeId);
    }
  };
  writeArray(state, false);

  let binary = '';
  for (let i = 0; i < length; i += 0x8000) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, Math.min(i + 0x8000, length)) as any
    );
  }
  // `<` would let string content close the script element.
  return btoa(binary) + '\n' + JSON.stringify(strings).replace(/</g, '\\u003c');
}
