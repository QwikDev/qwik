/* eslint-disable no-console */
import { ComponentStylesPrefixContent } from '../util/markers';

// Make sure this is always set to `false` in production, but it is useful to set for `true` in development for debugging.
const DEBUG: boolean = false;

export function scopeStylesheet(css: string, scopeId: string): string {
  const end = css.length;
  const out: string[] = [];
  const stack: MODE[] = [];
  let idx = 0;
  let lastIdx = idx;
  let mode: MODE = MODE.rule as any;
  let lastCh = 0;
  let lastMarkIdx = 0;
  DEBUG && console.log('--------------------------');
  while (idx < end) {
    DEBUG && console.log(css);
    DEBUG && console.log(new Array(idx).fill(' ').join('') + '^');
    DEBUG && console.log('MODE', ...stack.map(modeToString), modeToString(mode));
    let ch = css.charCodeAt(idx++);
    if (ch === CHAR.BACKSLASH) {
      idx++;
      ch = CHAR.A; // Pretend it's a letter
    }
    const arcs = STATE_MACHINE[mode];
    for (let i = 0; i < arcs.length; i++) {
      const arc = arcs[i];
      const [expectLastCh, expectCh, newMode] = arc;
      if (
        expectLastCh === lastCh ||
        expectLastCh === CHAR.ANY ||
        (expectLastCh === CHAR.IDENT && isIdent(lastCh)) ||
        (expectLastCh === CHAR.WHITESPACE && isWhiteSpace(lastCh))
      ) {
        if (
          expectCh === ch ||
          expectCh === CHAR.ANY ||
          (expectCh === CHAR.IDENT && isIdent(ch)) ||
          (expectCh === CHAR.NOT_IDENT && !isIdent(ch) && ch !== CHAR.DOT) ||
          (expectCh === CHAR.WHITESPACE && isWhiteSpace(ch))
        ) {
          if (arc.length == 3 || lookAhead(arc)) {
            if (arc.length > 3) {
              // If matched on lookAhead than we we have to update current `ch`
              ch = css.charCodeAt(idx - 1);
            }
            DEBUG &&
              console.log(
                'MATCH',
                charToString(expectLastCh),
                charToString(expectCh),
                modeToString(newMode)
              );
            // We found a match!
            if (newMode === MODE.MARK_INSERT_LOCATION) {
              lastMarkIdx = idx - 1;
              continue; // pretend no match.
            } else if (newMode === MODE.EXIT || newMode == MODE.EXIT_INSERT_SCOPE) {
              if (newMode === MODE.EXIT_INSERT_SCOPE) {
                if (mode === MODE.starSelector && !isInGlobal()) {
                  // Replace `*` with the scoping elementClassIdSelector.
                  if (isChainedSelector(ch)) {
                    // *foo
                    flush(idx - 2);
                  } else {
                    // * (by itself)
                    insertScopingSelector(idx - 2);
                  }
                  lastIdx++;
                } else if (mode === MODE.animation) {
                  insertScopingSelector(lastMarkIdx);
                } else {
                  if (!isChainedSelector(ch)) {
                    // We are exiting one of the Selector so we may need to
                    const offset =
                      expectCh == CHAR.NOT_IDENT ? 1 : expectCh == CHAR.CLOSE_PARENTHESIS ? 2 : 0;
                    insertScopingSelector(idx - offset);
                  }
                }
              }
              if (expectCh === CHAR.NOT_IDENT) {
                // NOT_IDENT is not a real character more like lack of what we expected.
                // if pseudoGlobal we need to give it a chance to exit as well.
                // For this reason we need to reparse the last character again.
                idx--;
                ch = lastCh;
              }
              do {
                mode = stack.pop() || MODE.rule;
                if (mode === MODE.pseudoGlobal) {
                  // Skip over the `)` in `:global(...)`.
                  flush(idx - 1);
                  lastIdx++;
                }
              } while (isSelfClosingRule(mode));
            } else {
              stack.push(mode);
              if (mode === MODE.pseudoGlobal && newMode === MODE.rule) {
                flush(idx - 8); // `:global(`.length
                lastIdx = idx; // skip over ":global("
              } else if (newMode === MODE.pseudoElement) {
                // We are entering pseudoElement `::foo`; insert scoping in front of it.
                insertScopingSelector(idx - 2);
              }
              mode = newMode;
              ch == CHAR.SPACE; // Pretend not an identifier so that we don't flush again on elementClassIdSelector
            }
            break; // get out of the for loop as we found a match
          }
        }
      }
    }
    lastCh = ch;
  }
  flush(idx);
  return out.join('');

  function flush(idx: number) {
    out.push(css.substring(lastIdx, idx));
    DEBUG && console.log('FLUSH', out.join(''));
    lastIdx = idx;
  }
  function insertScopingSelector(idx: number) {
    if (mode === MODE.pseudoGlobal || isInGlobal()) return;

    flush(idx);
    const parentMode = stack.length && stack[stack.length - 1];
    const separator = parentMode === MODE.atRuleSelector || mode === MODE.animation ? '-' : '.';
    out.push(separator, ComponentStylesPrefixContent, scopeId);
    DEBUG && console.log('INSERT', out.join(''));
  }
  function lookAhead(arc: StateArc): boolean {
    let prefix = 0; // Ignore vendor prefixes such as `-webkit-`.
    if (css.charCodeAt(idx) === CHAR.DASH) {
      for (let i = 1; i < 10; i++) {
        // give up after 10 characters
        if (css.charCodeAt(idx + i) === CHAR.DASH) {
          prefix = i + 1;
          break;
        }
      }
    }
    words: for (let arcIndx = 3; arcIndx < arc.length; arcIndx++) {
      const txt = arc[arcIndx] as string;
      for (let i = 0; i < txt.length; i++) {
        if ((css.charCodeAt(idx + i + prefix) | CHAR.LOWERCASE) !== txt.charCodeAt(i)) {
          continue words;
        }
      }
      // we found a match;
      idx += txt.length + prefix;
      return true;
    }
    return false;
  }

  function isInGlobal(): boolean {
    return stack.indexOf(MODE.pseudoGlobal) !== -1;
  }
}

function isIdent(ch: number): boolean {
  return (
    (ch >= CHAR._0 && ch <= CHAR._9) ||
    (ch >= CHAR.A && ch <= CHAR.Z) ||
    (ch >= CHAR.a && ch <= CHAR.z) ||
    ch >= 0x80 ||
    ch === CHAR.UNDERSCORE ||
    ch === CHAR.DASH
  );
}
function isChainedSelector(ch: number): boolean {
  return (
    ch === CHAR.COLON ||
    ch === CHAR.DOT ||
    ch === CHAR.OPEN_BRACKET ||
    ch === CHAR.HASH ||
    isIdent(ch)
  );
}

function isSelfClosingRule(mode: MODE): boolean {
  return (
    mode === MODE.atRuleBlock ||
    mode === MODE.atRuleSelector ||
    mode === MODE.atRuleInert ||
    mode === MODE.pseudoGlobal
  );
}

function isWhiteSpace(ch: number): boolean {
  return ch === CHAR.SPACE || ch === CHAR.TAB || ch === CHAR.NEWLINE || ch === CHAR.CARRIAGE_RETURN;
}

function modeToString(mode: MODE): string {
  return [
    'rule',
    'elementClassIdSelector',
    'starSelector',
    'pseudoClassWithSelector',
    'pseudoClass',
    'pseudoGlobal',
    'pseudoElement',
    'attrSelector',
    'inertParenthesis',
    'inertBlock',
    'atRuleSelector',
    'atRuleBlock',
    'atInert',
    'body',
    'stringSingle',
    'stringDouble',
    'commentMultiline',
    'animation',
    'EXIT',
    'EXIT_INSERT_SCOPE',
    'MARK_INSERT_LOCATION',
  ][mode];
}

function charToString(ch: number): string {
  return ['ANY', 'IDENT', 'NOT_IDENT', 'WHITESPACE'][ch] || String.fromCharCode(ch);
}

const enum MODE {
  rule, // top level initial space.
  elementClassIdSelector, // .elementClassIdSelector {}
  starSelector, // * {}
  pseudoClassWithSelector, // :pseudoClass(elementClassIdSelector) {}
  pseudoClass, // :pseudoClass {}
  pseudoGlobal, // :global(elementClassIdSelector)
  pseudoElement, // ::pseudoElement {}
  attrSelector, // [attr] {}
  inertParenthesis, // (ignored)
  inertBlock, // {ignored}
  atRuleSelector, // @keyframe elementClassIdSelector {}
  atRuleBlock, // @media {elementClassIdSelector {}}
  atRuleInert, // @atRule something;
  body, // .elementClassIdSelector {body}
  stringSingle, // 'text'
  stringDouble, // 'text'
  commentMultiline, // /* ... */
  animation,
  // NOT REAL MODES
  EXIT, // Exit the mode
  EXIT_INSERT_SCOPE, // Exit the mode INSERT SCOPE
  MARK_INSERT_LOCATION, // Possible place to insert scope selector
}

const enum CHAR {
  ANY = 0,
  IDENT = 1,
  NOT_IDENT = 2,
  WHITESPACE = 3,
  TAB = 9, // `\t`.charCodeAt(0);
  NEWLINE = 10, // `\n`.charCodeAt(0);
  CARRIAGE_RETURN = 13, // `\r`.charCodeAt(0);
  SPACE = 32, // ` `.charCodeAt(0);
  DOUBLE_QUOTE = 34, // `"`.charCodeAt(0);
  HASH = 35, // `#`.charCodeAt(0);
  SINGLE_QUOTE = 39, // `'`.charCodeAt(0);
  OPEN_PARENTHESIS = 40, // `(`.charCodeAt(0);
  CLOSE_PARENTHESIS = 41, // `)`.charCodeAt(0);
  STAR = 42, // `*`.charCodeAt(0);
  COMMA = 44, // `,`.charCodeAt(0);
  DASH = 45, // `-`.charCodeAt(0);
  DOT = 46, // `.`.charCodeAt(0);
  FORWARD_SLASH = 47, // `/`.charCodeAt(0);
  _0 = 48, // `0`.charCodeAt(0);
  _9 = 57, // `9`.charCodeAt(0);
  COLON = 58, // `:`.charCodeAt(0);
  SEMICOLON = 59, // `;`.charCodeAt(0);
  LESS_THAN = 60, // `<`.charCodeAt(0);
  AT = 64, // `@`.charCodeAt(0);
  A = 65, // `A`.charCodeAt(0);
  Z = 90, // `Z`.charCodeAt(0);
  OPEN_BRACKET = 91, // `[`.charCodeAt(0);
  CLOSE_BRACKET = 93, // `]`.charCodeAt(0);
  BACKSLASH = 92, // `\\`.charCodeAt(0);
  UNDERSCORE = 95, // `_`.charCodeAt(0);
  LOWERCASE = 0x20, // `a`.charCodeAt(0);
  a = 97, // `a`.charCodeAt(0);
  d = 100, // `d`.charCodeAt(0);
  g = 103, // 'g'.charCodeAt(0);
  h = 104, // `h`.charCodeAt(0);
  i = 105, // `i`.charCodeAt(0);
  l = 108, // `l`.charCodeAt(0);
  t = 116, // `t`.charCodeAt(0);
  z = 122, // `z`.charCodeAt(0);
  OPEN_BRACE = 123, // `{`.charCodeAt(0);
  CLOSE_BRACE = 125, // `}`.charCodeAt(0);
}

type StateArc = [
  /// If the last character is this:
  CHAR,
  /// If the current character is this:
  CHAR,
  /// Then transition to this state:
  MODE,
  /// Optional look ahead strings
  ...string[]
];

const STRINGS_COMMENTS: StateArc[] = [
  [CHAR.ANY, CHAR.SINGLE_QUOTE, MODE.stringSingle],
  [CHAR.ANY, CHAR.DOUBLE_QUOTE, MODE.stringDouble],
  [CHAR.ANY, CHAR.FORWARD_SLASH, MODE.commentMultiline, '*'],
];

const STATE_MACHINE: StateArc[][] = [
  [
    /// rule
    [CHAR.ANY, CHAR.STAR, MODE.starSelector],
    [CHAR.ANY, CHAR.OPEN_BRACKET, MODE.attrSelector],
    [CHAR.ANY, CHAR.COLON, MODE.pseudoElement, ':'],
    [CHAR.ANY, CHAR.COLON, MODE.pseudoGlobal, 'global'],
    [
      CHAR.ANY,
      CHAR.COLON,
      MODE.pseudoClassWithSelector,
      'has',
      'host-context',
      'not',
      'where',
      'is',
      'matches',
      'any',
    ],
    [CHAR.ANY, CHAR.COLON, MODE.pseudoClass],
    [CHAR.ANY, CHAR.IDENT, MODE.elementClassIdSelector],
    [CHAR.ANY, CHAR.DOT, MODE.elementClassIdSelector],
    [CHAR.ANY, CHAR.HASH, MODE.elementClassIdSelector],
    [CHAR.ANY, CHAR.AT, MODE.atRuleSelector, 'keyframe'],
    [CHAR.ANY, CHAR.AT, MODE.atRuleBlock, 'media', 'supports'],
    [CHAR.ANY, CHAR.AT, MODE.atRuleInert],
    [CHAR.ANY, CHAR.OPEN_BRACE, MODE.body],
    [CHAR.FORWARD_SLASH, CHAR.STAR, MODE.commentMultiline],
    [CHAR.ANY, CHAR.SEMICOLON, MODE.EXIT],
    [CHAR.ANY, CHAR.CLOSE_BRACE, MODE.EXIT],
    [CHAR.ANY, CHAR.CLOSE_PARENTHESIS, MODE.EXIT],
    ...STRINGS_COMMENTS,
  ],
  [
    /// elementClassIdSelector
    [CHAR.ANY, CHAR.NOT_IDENT, MODE.EXIT_INSERT_SCOPE],
  ],
  [
    /// starSelector
    [CHAR.ANY, CHAR.NOT_IDENT, MODE.EXIT_INSERT_SCOPE],
  ],
  [
    /// pseudoClassWithSelector
    [CHAR.ANY, CHAR.OPEN_PARENTHESIS, MODE.rule],
    [CHAR.ANY, CHAR.NOT_IDENT, MODE.EXIT_INSERT_SCOPE],
  ],
  [
    /// pseudoClass
    [CHAR.ANY, CHAR.OPEN_PARENTHESIS, MODE.inertParenthesis],
    [CHAR.ANY, CHAR.NOT_IDENT, MODE.EXIT_INSERT_SCOPE],
  ],
  [
    /// pseudoGlobal
    [CHAR.ANY, CHAR.OPEN_PARENTHESIS, MODE.rule],
    [CHAR.ANY, CHAR.NOT_IDENT, MODE.EXIT],
  ],
  [
    /// pseudoElement
    [CHAR.ANY, CHAR.NOT_IDENT, MODE.EXIT],
  ],
  [
    /// attrSelector
    [CHAR.ANY, CHAR.CLOSE_BRACKET, MODE.EXIT_INSERT_SCOPE],
    [CHAR.ANY, CHAR.SINGLE_QUOTE, MODE.stringSingle],
    [CHAR.ANY, CHAR.DOUBLE_QUOTE, MODE.stringDouble],
  ],
  [
    /// inertParenthesis
    [CHAR.ANY, CHAR.CLOSE_PARENTHESIS, MODE.EXIT],
    ...STRINGS_COMMENTS,
  ],
  [
    /// inertBlock
    [CHAR.ANY, CHAR.CLOSE_BRACE, MODE.EXIT],
    ...STRINGS_COMMENTS,
  ],
  [
    /// atRuleSelector
    [CHAR.ANY, CHAR.CLOSE_BRACE, MODE.EXIT],
    [CHAR.WHITESPACE, CHAR.IDENT, MODE.elementClassIdSelector],
    [CHAR.ANY, CHAR.COLON, MODE.pseudoGlobal, 'global'],
    [CHAR.ANY, CHAR.OPEN_BRACE, MODE.body],
    ...STRINGS_COMMENTS,
  ],
  [
    /// atRuleBlock
    [CHAR.ANY, CHAR.OPEN_BRACE, MODE.rule],
    [CHAR.ANY, CHAR.SEMICOLON, MODE.EXIT],
    ...STRINGS_COMMENTS,
  ],
  [
    /// atRuleInert
    [CHAR.ANY, CHAR.SEMICOLON, MODE.EXIT],
    [CHAR.ANY, CHAR.OPEN_BRACE, MODE.inertBlock],
    ...STRINGS_COMMENTS,
  ],
  [
    /// body
    [CHAR.ANY, CHAR.CLOSE_BRACE, MODE.EXIT],
    [CHAR.ANY, CHAR.OPEN_BRACE, MODE.body],
    [CHAR.ANY, CHAR.OPEN_PARENTHESIS, MODE.inertParenthesis],
    [CHAR.ANY, CHAR.a, MODE.animation, 'nimation-name:', 'nimation:'],
    ...STRINGS_COMMENTS,
  ],
  [
    /// stringSingle
    [CHAR.ANY, CHAR.SINGLE_QUOTE, MODE.EXIT],
  ],
  [
    /// stringDouble
    [CHAR.ANY, CHAR.DOUBLE_QUOTE, MODE.EXIT],
  ],
  [
    /// commentMultiline
    [CHAR.STAR, CHAR.FORWARD_SLASH, MODE.EXIT],
  ],
  [
    /// animation
    [CHAR.IDENT, CHAR.NOT_IDENT, MODE.MARK_INSERT_LOCATION],
    [CHAR.ANY, CHAR.SEMICOLON, MODE.EXIT_INSERT_SCOPE],
    [CHAR.ANY, CHAR.CLOSE_BRACE, MODE.EXIT_INSERT_SCOPE],
    ...STRINGS_COMMENTS,
  ],
];
