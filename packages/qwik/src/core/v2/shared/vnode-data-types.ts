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
  REFERENCE: /* * */ 126, // `~` is a reference to the node. Save it.
  SKIP_0: /* ***** */ 33, // `!` is vNodeData separator skipping 0. (ie next vNode)
  SKIP_1: /* ***** */ 34, // `"` is vNodeData separator skipping 1.
  SKIP_2: /* ***** */ 35, // `#` is vNodeData separator skipping 2.
  SKIP_4: /* ***** */ 36, // `$` is vNodeData separator skipping 4.
  SKIP_8: /* ***** */ 37, // `%` is vNodeData separator skipping 8.
  SKIP_16: /* **** */ 38, // `&` is vNodeData separator skipping 16.
  SKIP_32: /* **** */ 39, // '`'` is vNodeData separator skipping 32.
  SKIP_64: /* **** */ 40, // `(` is vNodeData separator skipping 64.
  SKIP_128: /* *** */ 41, // `)` is vNodeData separator skipping 128.
  SKIP_256: /* *** */ 42, // `*` is vNodeData separator skipping 256.
  SKIP_512: /* *** */ 43, // `+` is vNodeData separator skipping 512.
  SKIP_1024: /* ** */ 44, // '`'` is vNodeData separator skipping 1024.
  SKIP_2048: /* ** */ 46, // `.` is vNodeData separator skipping 2048.
  SKIP_4096: /* ** */ 47, // `/` is vNodeData separator skipping 4096.
};

/** VNodeDataChar contains information about the VNodeData used for encoding props */
export const VNodeDataChar = {
  OPEN: /* ************** */ 123, // `{` is the start of the VNodeData.
  OPEN_CHAR: /* ****** */ '{',
  CLOSE: /* ************* */ 125, // `}` is the end of the VNodeData.
  CLOSE_CHAR: /* ***** */ '}',

  SCOPED_STYLE: /* ******* */ 59, // `;` - `q:sstyle` - Style attribute.
  SCOPED_STYLE_CHAR: /* */ ';',
  RENDER_FN: /* ********** */ 60, // `<` - `q:renderFn' - Component QRL render function (body)
  RENDER_FN_CHAR: /* ** */ '<',
  ID: /* ***************** */ 61, // `=` - `q:id` - ID of the element.
  ID_CHAR: /* ********* */ '=',
  PROPS: /* ************** */ 62, // `>` - `q:props' - Component Props
  PROPS_CHAR: /* ****** */ '>',
  SLOT_REF: /* *********** */ 63, // `?` - `q:sref` - Slot reference.
  SLOT_REF_CHAR: /* *** */ '?',
  KEY: /* **************** */ 64, // `@` - `q:key` - Element key.
  KEY_CHAR: /* ******** */ '@',
  SEQ: /* **************** */ 91, // `[` - `q:seq' - Seq value from `useSequentialScope()`
  SEQ_CHAR: /* ******** */ '[',
  DON_T_USE: /* ********** */ 93, // `\` - SKIP because `\` is used as escaping
  DON_T_USE_CHAR: '\\',
  CONTEXT: /* ************ */ 93, // `]` - `q:ctx' - Component context/props
  CONTEXT_CHAR: /* **** */ ']',
  SEPARATOR: /* ********* */ 124, // `|` - Separator char to encode any key/value pairs.
  SEPARATOR_CHAR: /* ** */ '|',
  SLOT: /* ************** */ 126, // `~` - `q:slot' - Slot name
  SLOT_CHAR: /* ******* */ '~',
};
