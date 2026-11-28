/**
 * @file
 *
 *   VNodeData is additional information which allows the `vnode` to recover virtual VNode information
 *   from the HTML.
 */

/**
 * VNodeDataSeparator contains information about splitting up the VNodeData and attaching it to the
 * HTML.
 */
export const VNodeDataSeparator = {
  REFERENCE_CH: /* ***** */ `~`, // `~` is a reference to the node. Save it.
  REFERENCE: /* ******** */ 126, // `~` is a reference to the node. Save it.
  ADVANCE_1_CH: /* ***** */ `!`, // `!` is vNodeData separator skipping 0. (ie next vNode)
  ADVANCE_1: /* ********* */ 33, // `!` is vNodeData separator skipping 0. (ie next vNode)
  ADVANCE_2_CH: /* ***** */ `"`, // `"` is vNodeData separator skipping 1.
  ADVANCE_2: /* ********* */ 34, // `"` is vNodeData separator skipping 1.
  ADVANCE_4_CH: /* ***** */ `#`, // `#` is vNodeData separator skipping 2.
  ADVANCE_4: /* ********* */ 35, // `#` is vNodeData separator skipping 2.
  ADVANCE_8_CH: /* ***** */ `$`, // `$` is vNodeData separator skipping 4.
  ADVANCE_8: /* ********* */ 36, // `$` is vNodeData separator skipping 4.
  ADVANCE_16_CH: /* **** */ `%`, // `%` is vNodeData separator skipping 8.
  ADVANCE_16: /* ******** */ 37, // `%` is vNodeData separator skipping 8.
  ADVANCE_32_CH: /* **** */ `&`, // `&` is vNodeData separator skipping 16.
  ADVANCE_32: /* ******** */ 38, // `&` is vNodeData separator skipping 16.
  ADVANCE_64_CH: /* **** */ `'`, // `'` is vNodeData separator skipping 32.
  ADVANCE_64: /* ******** */ 39, // `'` is vNodeData separator skipping 32.
  ADVANCE_128_CH: /* *** */ `(`, // `(` is vNodeData separator skipping 64.
  ADVANCE_128: /* ******* */ 40, // `(` is vNodeData separator skipping 64.
  ADVANCE_256_CH: /* *** */ `)`, // `)` is vNodeData separator skipping 128.
  ADVANCE_256: /* ******* */ 41, // `)` is vNodeData separator skipping 128.
  ADVANCE_512_CH: /* *** */ `*`, // `*` is vNodeData separator skipping 256.
  ADVANCE_512: /* ******* */ 42, // `*` is vNodeData separator skipping 256.
  ADVANCE_1024_CH: /* ** */ `+`, // `+` is vNodeData separator skipping 512.
  ADVANCE_1024: /* ****** */ 43, // `+` is vNodeData separator skipping 512.
  ADVANCE_2048_CH: /* *  */ ',', // ',' is vNodeData separator skipping 1024.
  ADVANCE_2048: /* ****** */ 44, // ',' is vNodeData separator skipping 1024.
  ADVANCE_4096_CH: /* *  */ `-`, // `-` is vNodeData separator skipping 2048.
  ADVANCE_4096: /* ****** */ 45, // `-` is vNodeData separator skipping 2048.
  ADVANCE_8192_CH: /* *  */ `.`, // `.` is vNodeData separator skipping 4096.
  ADVANCE_8192: /* ****** */ 46, // `.` is vNodeData separator skipping 4096.
};

/**
 * VNodeDataChar contains information about the VNodeData used for encoding props.
 *
 * Available character ranges: 59 - 64, 91 - 94, 96, 123 - 126
 */
export const VNodeDataChar = {
  OPEN: /* ************** */ 123, // `{` is the start of the VNodeData for a virtual element.
  OPEN_CHAR: /* ****** */ '{',
  CLOSE: /* ************* */ 125, // `}` is the end of the VNodeData for a virtual element.
  CLOSE_CHAR: /* ***** */ '}',

  SCOPED_STYLE: /* ******* */ 59, // `;` - `q:sstyle` - Style attribute.
  SCOPED_STYLE_CHAR: /* */ ';',
  RENDER_FN: /* ********** */ 60, // `<` - `q:renderFn' - Component QRL render function (body)
  RENDER_FN_CHAR: /* ** */ '<',
  RENDER_HASH_PREFIX: /* **/ 95, // `_` after `<` identifies a component hash.
  RENDER_HASH_PREFIX_CHAR: '_',
  ID: /* ***************** */ 61, // `=` - `q:id` - ID of the element.
  ID_CHAR: /* ********* */ '=',
  PROPS: /* ************** */ 62, // `>` - `q:props' - Component Props
  PROPS_CHAR: /* ****** */ '>',
  SLOT_PARENT: /* ******** */ 63, // `?` - `q:sparent` - Slot parent.
  SLOT_PARENT_CHAR: /*  */ '?',
  KEY: /* **************** */ 64, // `@` - `q:key` - Element key.
  KEY_CHAR: /* ******** */ '@',
  SEQ: /* **************** */ 91, // `[` - `q:seq' - Seq value from `useSequentialScope()`
  SEQ_CHAR: /* ******** */ '[',
  DON_T_USE: /* ********** */ 92, // `\` - SKIP because `\` is used as escaping
  DON_T_USE_CHAR: '\\',
  CONTEXT: /* ************ */ 93, // `]` - `q:ctx' - Component context/props
  CONTEXT_CHAR: /* **** */ ']',
  SEQ_IDX: /* ************ */ 94, // `^` - `q:seqIdx' - Sequential scope id
  SEQ_IDX_CHAR: /* **** */ '^',
  BACK_REFS: /* ********** */ 96, // '`' - `q:brefs' - Effect dependencies/subscriptions
  BACK_REFS_CHAR: /* ** */ '`',
  SEPARATOR: /* ********* */ 124, // `|` - Separator char to encode any key/value pairs.
  SEPARATOR_CHAR: /* ** */ '|',
  SLOT: /* ************** */ 126, // `~` - `q:slot' - Slot name
  SLOT_CHAR: /* ******* */ '~',
};

/**
 * The vnode data of one element, flat: text lengths (zero or more), element counts (negative), `{`
 * and `}` around the tokens of a virtual node, and attributes as a `VNodeDataChar` code (or `|` and
 * the attribute name) followed by the value.
 */
export type VNodeRecord = unknown[];

/**
 * Binary vnode data is decoded into one array per container, where `null` ends each element's
 * record. An element's entry in `qVNodeData` is the index of that array times this, plus where its
 * record starts.
 */
export const VNODE_TABLE_INDEX_SCALE = 2 ** 28;

/**
 * Binary vnode data is one array of tokens in document order. A token is a number `payload * 4 +
 * kind`:
 *
 * - Kind 0: an element with vnode data starts; the payload is the elements skipped since the previous
 *   one times two, plus one when state refers to the element.
 * - Kind 1: element count. Kind 2: text length.
 * - Kind 3: payload 0 opens a virtual node, 1 closes it, `2 + i` is the attribute code
 *   `BINARY_VNODE_CODES[i]`. One past the codes is a custom attribute, whose name follows as a
 *   string. Then the value: a string, or a root id written as the zigzag distance from a base,
 *   times two, plus one when the base is the previous id of the same code instead of the previous
 *   id.
 */
export const BINARY_VNODE_CODES = '`=<>@^[];?~';

/** The kind of a binary vnode token: its value modulo 4. */
export const enum BinaryVNodeKind {
  ElementStart,
  ElementCount,
  TextLength,
  Other,
}

/** The payloads of `BinaryVNodeKind.Other`. */
export const enum BinaryVNodeOther {
  OpenVirtual,
  CloseVirtual,
  FirstCode,
}

/**
 * Convert a segment-local vnode index into a key for the root container's shared qVNodeRefs map.
 *
 * Out-of-order segments each start counting vnode refs from 0, but the client merges all segment
 * refs into one root-level map. This uses a Cantor-style pairing function for the zero-based pair
 * `(segmentIndex, localIndex)`, then makes it negative so segment refs cannot collide with root
 * refs, which are non-negative.
 *
 * Examples:
 *
 * - Segment 1, local 0 -> -1
 * - Segment 2, local 0 -> -2
 * - Segment 1, local 1 -> -3
 */
export const getSegmentVNodeRefId = (segmentId: string, localIndex: number): number => {
  const segmentIndex = parseInt(segmentId, 10) - 1;
  const diagonal = segmentIndex + localIndex;
  return -((diagonal * (diagonal + 1)) / 2 + localIndex + 1);
};
