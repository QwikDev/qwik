import { escapeHTML } from '../../../qwik/src/core/shared/utils/character-escaping';
import { renderToStringCompiled } from '../../../qwik/src/server/ssr-render';

/**
 * Layer-0 conformance corpora (specs 06/08): JS-semantics goldens generated from the JS engine.
 * Every builder must be fully deterministic — corpora are committed and diffed in CI.
 */

const mulberry32 = (seed: number) => {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
};

const doubleView = new DataView(new ArrayBuffer(8));

const bitPatternOf = (value: number): string => {
  doubleView.setFloat64(0, value);
  return doubleView.getBigUint64(0).toString(16).padStart(16, '0');
};

const CURATED_NUMBERS = [
  0,
  -0,
  1,
  -1,
  0.5,
  0.1,
  0.2,
  0.1 + 0.2,
  1 / 3,
  100,
  1e6,
  123456.789,
  2 ** 31,
  2 ** 32,
  2 ** 53 - 1,
  2 ** 53,
  Number.MAX_SAFE_INTEGER,
  Number.MIN_SAFE_INTEGER,
  // exponent-notation thresholds
  1e21,
  9.999999999999999e20,
  1e-6,
  1e-7,
  1.5e-7,
  1e100,
  -1e-100,
  // extremes
  Number.MAX_VALUE,
  Number.MIN_VALUE,
  5e-324,
  Number.EPSILON,
  NaN,
  Infinity,
  -Infinity,
];

/** `[bitPatternHex, String(value)]` pairs. */
export function buildNumbersCorpus(): [string, string][] {
  const entries: [string, string][] = [];
  const push = (value: number) => entries.push([bitPatternOf(value), String(value)]);
  CURATED_NUMBERS.forEach(push);
  const next = mulberry32(0x51ab1e5);
  for (let i = 0; i < 10_000; i++) {
    doubleView.setUint32(0, next());
    doubleView.setUint32(4, next());
    // round-trip through the value so NaN patterns canonicalize
    push(doubleView.getFloat64(0));
  }
  return entries;
}

/** `[bitPatternHex, digits, value.toFixed(digits)]` triples. */
export function buildToFixedCorpus(): [string, number, string][] {
  const entries: [string, number, string][] = [];
  const push = (value: number, digits: number) =>
    entries.push([bitPatternOf(value), digits, value.toFixed(digits)]);
  const curated: [number, number][] = [
    [0.615, 2],
    [-0.615, 2],
    [1.005, 2],
    [0.1, 1],
    [1.45, 1],
    [8.575, 2],
    [0, 0],
    [123.456, 0],
    [123.456, 3],
    [123.456, 5],
    [1e21, 5],
    [0.000001, 7],
    [1 / 3, 20],
    [1 / 3, 50],
    [NaN, 2],
    [-0, 2],
  ];
  curated.forEach(([value, digits]) => push(value, digits));
  const next = mulberry32(0xf1eced);
  for (let i = 0; i < 2_000; i++) {
    doubleView.setUint32(0, next());
    doubleView.setUint32(4, next());
    const value = doubleView.getFloat64(0);
    push(value, next() % 9);
  }
  return entries;
}

export type JsonBytesCase =
  | { kind: 'entries'; pairs: [string, unknown][]; expected: string }
  | { kind: 'value'; value: unknown; expected: string };

/**
 * `JSON.stringify` byte cases. `entries` cases construct the object by inserting keys in pair
 * order, so JS property ordering (integer-like keys ascending first) is observable in `expected`.
 */
export function buildJsonBytesCorpus(): JsonBytesCase[] {
  const entryCase = (pairs: [string, unknown][]): JsonBytesCase => ({
    kind: 'entries',
    pairs,
    expected: JSON.stringify(Object.fromEntries(pairs)),
  });
  const valueCase = (value: unknown): JsonBytesCase => ({
    kind: 'value',
    value,
    expected: JSON.stringify(value),
  });
  return [
    entryCase([
      ['b', 1],
      ['10', 2],
      ['2', 3],
      ['a', 4],
    ]),
    entryCase([
      ['10', 'x'],
      ['0', 'y'],
      ['01', 'z'],
      ['-1', 'w'],
      ['1e3', 'v'],
    ]),
    entryCase([
      ['z', null],
      ['5', [1, 2]],
      ['05', { nested: true }],
    ]),
    valueCase([1, 'two', true, null, [3, [4]]]),
    valueCase({ a: { b: { c: [] } } }),
    valueCase('quote " backslash \\ newline \n tab \t'),
    valueCase('unicode ✓ ż 中    '),
    valueCase('surrogate pair 😀'),
    valueCase([0.1 + 0.2, 1e21, 1e-7, -0]),
    valueCase({ '': 'empty key' }),
  ];
}

/** `[input, escapeHTML(input)]` pairs — the five-char SSR escaper. */
export function buildEscapeCorpus(): [string, string][] {
  const inputs = [
    'plain text',
    '',
    '<script>alert("x")</script>',
    `mixed & <tags> with "quotes" and 'apostrophes'`,
    '&&&',
    "'''",
    'unicode ✓ ż 中 😀',
    'a < b > c & d " e \' f',
    '</',
    'newline \n and tab \t survive',
  ];
  return inputs.map((input) => [input, escapeHTML(input)]);
}

/** Tagged tree — language-neutral encoding for values JSON cannot carry. */
export type TaggedValue =
  | null
  | boolean
  | number
  | string
  | TaggedValue[]
  | { $: 'undefined' }
  | { $: 'nan' }
  | { $: 'inf' }
  | { $: '-inf' }
  | { $: '-0' }
  | { $: 'obj'; pairs: [string, TaggedValue][] }
  | { $: 'date'; v: number }
  | { $: 'url'; v: string }
  | { $: 'regex'; src: string; flags: string }
  | { $: 'bigint'; v: string }
  | { $: 'map'; entries: [TaggedValue, TaggedValue][] }
  | { $: 'set'; v: TaggedValue[] }
  | { $: 'u8'; v: number[] }
  | { $: 'shared'; id: string; v?: TaggedValue };

const decodeTagged = (node: TaggedValue, shared: Map<string, unknown>): unknown => {
  if (node === null || typeof node !== 'object') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map((item) => decodeTagged(item, shared));
  }
  switch (node.$) {
    case 'undefined':
      return undefined;
    case 'nan':
      return NaN;
    case 'inf':
      return Infinity;
    case '-inf':
      return -Infinity;
    case '-0':
      return -0;
    case 'obj': {
      const value: Record<string, unknown> = {};
      for (const [key, item] of node.pairs) {
        value[key] = decodeTagged(item, shared);
      }
      return value;
    }
    case 'date':
      return new Date(node.v);
    case 'url':
      return new URL(node.v);
    case 'regex':
      return new RegExp(node.src, node.flags);
    case 'bigint':
      return BigInt(node.v);
    case 'map':
      return new Map(
        node.entries.map(([key, value]) => [decodeTagged(key, shared), decodeTagged(value, shared)])
      );
    case 'set':
      return new Set(node.v.map((item) => decodeTagged(item, shared)));
    case 'u8':
      return Uint8Array.from(node.v);
    case 'shared': {
      if (node.v !== undefined) {
        shared.set(node.id, decodeTagged(node.v, shared));
      }
      return shared.get(node.id);
    }
  }
};

export interface SerdesCase {
  name: string;
  roots: TaggedValue[];
  expected: string;
}

const SERDES_CASES: { name: string; roots: TaggedValue[] }[] = [
  {
    name: 'primitives',
    roots: [1, 'ab', 'abc', 'abcd', 'hello world', true, null, { $: 'undefined' }],
  },
  {
    name: 'special numbers',
    roots: [
      { $: 'nan' },
      { $: 'inf' },
      { $: '-inf' },
      { $: '-0' },
      9007199254740991,
      9007199254740990,
      -9007199254740991,
      9007199254740992,
    ],
  },
  {
    name: 'string interning',
    roots: ['abcd', 'abcd', 'abc', 'abc', ':', '.', 'id', 'ref', ''],
  },
  {
    name: 'numeric key folding',
    roots: [
      {
        $: 'obj',
        pairs: [
          ['b', 1],
          ['10', 2],
          ['2', 3],
          ['0', 4],
          ['007', 5],
          ['-1', 6],
        ],
      },
    ],
  },
  {
    name: 'shared identity',
    roots: [
      [
        { $: 'shared', id: 'a', v: { $: 'obj', pairs: [['x', 'shared-value']] } },
        { $: 'shared', id: 'a' },
      ],
      { $: 'shared', id: 'a' },
    ],
  },
  {
    name: 'trailing undefined truncation',
    roots: [
      [1, { $: 'undefined' }],
      [{ $: 'undefined' }, 1],
    ],
  },
  {
    name: 'big array flattening',
    roots: [Array.from({ length: 70 }, (_, i): TaggedValue => ({ $: 'obj', pairs: [['i', i]] }))],
  },
  {
    name: 'builtin types',
    roots: [
      { $: 'date', v: 1754400000000 },
      { $: 'url', v: 'https://qwik.dev/native/' },
      { $: 'regex', src: 'a+b', flags: 'gi' },
      { $: 'bigint', v: '500' },
      { $: 'bigint', v: '123456789012345678901234567890' },
      {
        $: 'map',
        entries: [
          ['key', 'value'],
          [1, [2, 3]],
        ],
      },
      { $: 'set', v: ['x', 'y', 'x'] },
      { $: 'u8', v: [0, 1, 2, 250, 251, 252] },
    ],
  },
  {
    name: 'deep backref path',
    roots: [
      {
        $: 'obj',
        pairs: [['outer', [{ $: 'shared', id: 'deep', v: { $: 'obj', pairs: [['leaf', 42]] } }]]],
      },
      { $: 'shared', id: 'deep' },
    ],
  },
  {
    // >1024 roots forces script chunking and its JSON re-encode path (spec 04)
    name: 'chunked scripts',
    roots: Array.from({ length: 1100 }, (_, i): TaggedValue => `chunk-root-${i}`),
  },
];

const STATE_SCRIPT_RE = /<script type="qwik\/state"[^>]*>.*?<\/script>/gs;

/** Renders each case through the real SSR path and captures the emitted state scripts. */
export async function buildSerdesCorpus(): Promise<SerdesCase[]> {
  const cases: SerdesCase[] = [];
  for (const { name, roots } of SERDES_CASES) {
    const shared = new Map<string, unknown>();
    const values = roots.map((root) => decodeTagged(root, shared));
    const result = await renderToStringCompiled(
      (_props, ctx) => {
        for (const value of values) {
          ctx.addRoot(value);
        }
        return '<p>layer0</p>';
      },
      { containerTagName: 'div', instanceHash: 'layer0' }
    );
    const scripts = result.html.match(STATE_SCRIPT_RE);
    if (scripts === null) {
      throw new Error(`serdes case "${name}" emitted no state script`);
    }
    cases.push({ name, roots, expected: scripts.join('') });
  }
  return cases;
}

export type CoerceCase = { input: TaggedValue; expected: string };

/** SSR text-interpolation coercion: `value == null ? '' : String(value)`. */
export function buildCoerceCorpus(): CoerceCase[] {
  const inputs: TaggedValue[] = [
    null,
    { $: 'undefined' },
    true,
    false,
    0,
    { $: '-0' },
    { $: 'nan' },
    { $: 'inf' },
    0.1 + 0.2,
    'plain',
    '',
    [1, 2, 3],
    [null, { $: 'undefined' }, 'x'],
    [[1, 2], [3], []],
    [[]],
    { $: 'obj', pairs: [] },
    { $: 'obj', pairs: [['a', 1]] },
    [{ $: 'obj', pairs: [] }],
  ];
  return inputs.map((input) => {
    const value = decodeTagged(input, new Map());
    return { input, expected: value == null ? '' : String(value) };
  });
}
