/**
 * @file
 *
 *   This file contains element tag nesting rules of HTML.
 *
 *   The nesting states encode the HTML authoring spec. A violation only breaks Qwik when the parsing
 *   spec rewrites the DOM (auto-closing, foster parenting, ignored tags); violations the parser
 *   keeps as-is are classified by `isRetainedWhenInvalid` and only warrant a dev warning.
 *
 *   The rules are encoded as switch statements rather than as object literal lookups because:
 *
 *   1. Switch statements are faster than object literal lookups.
 *   2. Switch statements do not put pressure on megamorphic property caches.
 *   3. Switch statements are more verbose, hoverer they are on server only hence we don't care.
 *
 *   See: https://jsbench.me/hxlqu5wof5/1 In our case it is about 4x faster (not accounting for
 *   megamorphic property cache)
 */

export const enum TagNesting {
  NOT_ALLOWED = /* ------------ */ 0b0000_0000_0000_0000,
  DOCUMENT = /* --------------- */ 0b0000_0000_0000_0001,
  TEXT = /* ------------------- */ 0b0000_0000_0000_0010,
  EMPTY = /* ------------------ */ 0b0000_0000_0000_0100,
  ANYTHING = /* --------------- */ 0b0000_0000_0000_1010,
  HTML = /* ------------------- */ 0b0000_0000_0010_0000,
  HEAD = /* ------------------- */ 0b0000_0000_0100_0000,
  BODY = /* ------------------- */ 0b0000_0000_1000_0010,
  PHRASING_ANY = /* ----------- */ 0b0000_0001_0000_0010,
  PHRASING_INSIDE_INPUT = /* -- */ 0b0000_0010_0000_0010,
  PHRASING_CONTAINER = /* ----- */ 0b0000_0100_0000_0010,
  PICTURE = /* ---------------- */ 0b0000_1000_0000_0010,
  BUTTON = /* ----------------- */ 0b0001_0000_0000_0010,
  /** Table related tags. */
  TABLE = /* ------------------ */ 0b0001_0000_0000_0000,
  TABLE_BODY = /* ------------- */ 0b0010_0000_0000_0000,
  TABLE_ROW = /* -------------- */ 0b0100_0000_0000_0000,
  TABLE_COLGROUP = /* --------- */ 0b1000_0000_0000_0000,
}

export const allowedContent = (state: TagNesting): [string, string | null] => {
  switch (state) {
    case TagNesting.TEXT:
      return ['text content', null];
    case TagNesting.NOT_ALLOWED:
      return ['no content', null];
    case TagNesting.HTML:
      return ['html content', '<head>, <body>'];
    case TagNesting.HEAD:
      return [
        'head content',
        '<title>, <script>, <noscript>, <style>, <meta>, <link>, <base>, <template>',
      ];
    case TagNesting.BODY:
      return ['body content', 'all tags allowed here'];
    case TagNesting.EMPTY:
      return ['no-content element', null];
    case TagNesting.ANYTHING:
      return ['any content', null];
    case TagNesting.TABLE:
      return ['table', '<caption>, <colgroup>, <tbody>, <thead>, <tfoot>'];
    case TagNesting.TABLE_BODY:
      return ['table body', '<tr>'];
    case TagNesting.TABLE_ROW:
      return ['table row', '<td>, <th>'];
    case TagNesting.TABLE_COLGROUP:
      return ['table column group', '<col>'];
    case TagNesting.PHRASING_ANY:
    case TagNesting.PHRASING_INSIDE_INPUT:
    case TagNesting.PHRASING_CONTAINER:
      return ['phrasing content', '<a>, <b>, <img>, <input> ... (no <div>, <p> ...)'];
    case TagNesting.PICTURE:
      return ['picture content', '<source>, <img>'];
    case TagNesting.BUTTON:
      return ['button content', 'phrasing content except interactive elements'];
    case TagNesting.DOCUMENT:
      return ['document', '<html>'];
  }
};

export const initialTag = (tag: string) => {
  switch (tag) {
    case 'html':
      return TagNesting.HTML;
    case 'head':
      return TagNesting.HEAD;
    case 'body':
      return TagNesting.BODY;
    default:
      return isTagAllowed(TagNesting.ANYTHING, tag);
  }
};

/** Determine if the tag is allowed to be nested inside the current tag. */
export function isTagAllowed(state: number, tag: string): TagNesting {
  switch (state) {
    case TagNesting.TEXT:
    case TagNesting.NOT_ALLOWED:
      return TagNesting.NOT_ALLOWED;
    case TagNesting.HTML:
      return isInHtml(tag);
    case TagNesting.HEAD:
      return isInHead(tag);
    case TagNesting.BODY:
    case TagNesting.ANYTHING:
    case TagNesting.PHRASING_CONTAINER:
      return isInAnything(tag);
    case TagNesting.TABLE:
      return isInTable(tag);
    case TagNesting.TABLE_BODY:
      return isInTableBody(tag);
    case TagNesting.TABLE_ROW:
      return isInTableRow(tag);
    case TagNesting.TABLE_COLGROUP:
      return isInTableColGroup(tag);
    case TagNesting.PHRASING_ANY:
      return isInPhrasing(tag, true);
    case TagNesting.PHRASING_INSIDE_INPUT:
      return isInPhrasing(tag, false);
    case TagNesting.PICTURE:
      return isInPicture(tag);
    case TagNesting.BUTTON:
      return isInButton(tag);
    case TagNesting.DOCUMENT:
      if (tag === 'html') {
        return TagNesting.HTML;
      }
  }
  return TagNesting.NOT_ALLOWED;
}

function isInHtml(text: string): TagNesting {
  switch (text) {
    case 'head':
      return TagNesting.HEAD;
    case 'body':
      return TagNesting.BODY;
    default:
      return TagNesting.NOT_ALLOWED;
  }
}

function isInHead(text: string): TagNesting {
  switch (text) {
    case 'title':
    case 'script':
    case 'noscript':
    case 'style':
      return TagNesting.TEXT;
    case 'meta':
    case 'link':
    case 'base':
      return TagNesting.EMPTY;
    case 'template':
      return TagNesting.ANYTHING;
    default:
      return TagNesting.NOT_ALLOWED;
  }
}

export function isSelfClosingTag(text: string): boolean {
  switch (text) {
    case 'area':
    case 'base':
    case 'basefont':
    case 'bgsound':
    case 'br':
    case 'col':
    case 'embed':
    case 'frame':
    case 'hr':
    case 'img':
    case 'input':
    case 'keygen':
    case 'link':
    case 'meta':
    case 'param':
    case 'source':
    case 'track':
    case 'wbr':
      return true;
    default:
      return false;
  }
}

function isInAnything(text: string): TagNesting {
  if (isSelfClosingTag(text)) {
    return TagNesting.EMPTY;
  }

  switch (text) {
    case 'script':
    case 'style':
    case 'noscript':
    case 'noframes':
    case 'textarea': // rawtext element; element children would be parsed as text
      return TagNesting.TEXT;
    case 'p':
    case 'pre':
      return TagNesting.PHRASING_ANY;
    case 'table':
      return TagNesting.TABLE;
    case 'html':
    case 'head':
    case 'body':
      return TagNesting.NOT_ALLOWED;
    case 'button':
      return TagNesting.BUTTON;
    case 'input':
      return TagNesting.PHRASING_INSIDE_INPUT;
    case 'picture':
      return TagNesting.PICTURE;

    default:
      return TagNesting.ANYTHING;
  }
}

function isInTable(text: string): TagNesting {
  switch (text) {
    case 'caption':
      return TagNesting.ANYTHING;
    case 'colgroup':
      return TagNesting.TABLE_COLGROUP;
    case 'thead':
    case 'tbody':
    case 'tfoot':
      return TagNesting.TABLE_BODY;
    case 'script':
      return TagNesting.TEXT;
    default:
      return TagNesting.NOT_ALLOWED;
  }
}

function isInTableBody(text: string): TagNesting {
  switch (text) {
    case 'tr':
      return TagNesting.TABLE_ROW;
    case 'script':
      return TagNesting.TEXT;
    default:
      return TagNesting.NOT_ALLOWED;
  }
}

function isInTableRow(text: string): TagNesting {
  switch (text) {
    case 'td':
    case 'th':
      return TagNesting.ANYTHING;
    case 'script':
      return TagNesting.TEXT;
    default:
      return TagNesting.NOT_ALLOWED;
  }
}

function isInTableColGroup(text: string): TagNesting {
  switch (text) {
    case 'col':
      return TagNesting.EMPTY;
    case 'script':
      return TagNesting.TEXT;
    default:
      return TagNesting.NOT_ALLOWED;
  }
}

function isInPicture(text: string): TagNesting {
  switch (text) {
    case 'source':
      return TagNesting.EMPTY;
    case 'img':
      return TagNesting.EMPTY;
    case 'script':
      return TagNesting.TEXT;
    default:
      return TagNesting.NOT_ALLOWED;
  }
}

function isInButton(text: string): TagNesting {
  switch (text) {
    case 'button':
    case 'input':
    case 'textarea':
    case 'select':
    case 'a':
      return TagNesting.NOT_ALLOWED;
    case 'picture':
      return TagNesting.PICTURE;
    default:
      return isInPhrasing(text, false);
  }
}

function isInPhrasing(text: string, allowInput: boolean): TagNesting {
  switch (text) {
    case 'svg':
    case 'math':
      return TagNesting.PHRASING_CONTAINER;
    case 'input':
      return allowInput ? TagNesting.PHRASING_INSIDE_INPUT : TagNesting.NOT_ALLOWED;
    case 'textarea':
      return allowInput ? TagNesting.TEXT : TagNesting.NOT_ALLOWED;
    case 'a':
    case 'abbr':
    case 'area':
    case 'audio':
    case 'b':
    case 'bdi':
    case 'bdo':
    case 'br':
    case 'button':
    case 'canvas':
    case 'cite':
    case 'code':
    case 'command':
    case 'data':
    case 'datalist':
    case 'del':
    case 'dfn':
    case 'em':
    case 'embed':
    case 'i':
    case 'iframe':
    case 'img':
    case 'ins':
    case 'itemprop':
    case 'kbd':
    case 'keygen':
    case 'label':
    case 'link':
    case 'map':
    case 'mark':
    case 'meta':
    case 'meter':
    case 'noscript':
    case 'object':
    case 'option':
    case 'output':
    case 'progress':
    case 'q':
    case 'ruby':
    case 's':
    case 'samp':
    case 'select':
    case 'slot':
    case 'small':
    case 'span':
    case 'strong':
    case 'sub':
    case 'sup':
    case 'template':
    case 'time':
    case 'u':
    case 'var':
    case 'video':
    case 'wbr':
      return allowInput ? TagNesting.PHRASING_ANY : TagNesting.PHRASING_INSIDE_INPUT;
    case 'script':
    case 'style':
      return TagNesting.TEXT;
    case 'picture':
      return TagNesting.PICTURE;
    default:
      return TagNesting.NOT_ALLOWED;
  }
}

/** Start tags that make the parser auto-close an open `<p>` element in button scope. */
export function closesPTag(tag: string): boolean {
  switch (tag) {
    case 'address':
    case 'article':
    case 'aside':
    case 'blockquote':
    case 'center':
    case 'details':
    case 'dialog':
    case 'dir':
    case 'div':
    case 'dl':
    case 'fieldset':
    case 'figcaption':
    case 'figure':
    case 'footer':
    case 'form':
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
    case 'header':
    case 'hgroup':
    case 'hr':
    case 'listing':
    case 'main':
    case 'menu':
    case 'nav':
    case 'ol':
    case 'p':
    case 'plaintext':
    case 'pre':
    case 'section':
    case 'summary':
    case 'table':
    case 'ul':
    case 'xmp':
      return true;
    default:
      return false;
  }
}

/** Tags the parser ignores or relocates when misplaced, so the DOM never keeps them as-is. */
function isStructuralTag(tag: string): boolean {
  switch (tag) {
    case 'html':
    case 'head':
    case 'body':
    case 'frame':
    case 'frameset':
    case 'caption':
    case 'col':
    case 'colgroup':
    case 'tbody':
    case 'thead':
    case 'tfoot':
    case 'tr':
    case 'td':
    case 'th':
      return true;
    default:
      return false;
  }
}

/**
 * True when the parsing spec keeps this authoring-invalid child in the DOM as-is. Callers must
 * still check recovery that depends on open ancestors: `closesPTag` with an open `<p>` in button
 * scope, and a `<button>` start tag with an open `<button>` in scope.
 */
export function isRetainedWhenInvalid(parentState: TagNesting, tag: string): boolean {
  if (isStructuralTag(tag)) {
    return false;
  }
  switch (parentState) {
    case TagNesting.BUTTON:
    case TagNesting.PHRASING_ANY:
    case TagNesting.PHRASING_INSIDE_INPUT:
    case TagNesting.PICTURE:
      return true;
    default:
      return false;
  }
}
