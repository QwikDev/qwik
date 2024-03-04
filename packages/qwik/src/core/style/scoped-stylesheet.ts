/* eslint-disable no-console */
import { ComponentStylesPrefixContent } from '../util/markers';
import { qDev } from '../util/qdev';

// Make sure this is always set to `false` in production, but it is useful to set for `true` in development for debugging.
const DEBUG: boolean = false;

export const STYLE_CACHE = /*#__PURE__*/ new Map();

export const getScopedStyles = (css: string, scopeId: string): string => {
  if (qDev) {
    return scopeStylesheet(css, scopeId);
  }
  let styleCss = STYLE_CACHE.get(scopeId);
  if (!styleCss) {
    STYLE_CACHE.set(scopeId, (styleCss = scopeStylesheet(css, scopeId)));
  }
  return styleCss;
};

export const scopeStylesheet = (css: string, scopeId: string): string => {
  const end = css.length;
  const out: string[] = [];
  const stack: number[] = [];
  let idx = 0;
  let lastIdx = idx;
  let mode: number = rule;
  let lastCh = 0;
  DEBUG && console.log('--------------------------');
  while (idx < end) {
    DEBUG && console.log(css);
    DEBUG && console.log(new Array(idx).fill(' ').join('') + '^');
    DEBUG && console.log('MODE', ...stack.map(modeToString), modeToString(mode));
    const chIdx = idx;
    let ch = css.charCodeAt(idx++);
    if (ch === BACKSLASH) {
      idx++;
      ch = A; // Pretend it's a letter
    }
    const arcs = STATE_MACHINE[mode];
    for (let i = 0; i < arcs.length; i++) {
      const arc = arcs[i];
      const [expectLastCh, expectCh, newMode] = arc;
      if (
        expectLastCh === lastCh ||
        expectLastCh === ANY ||
        (expectLastCh === IDENT && isIdent(lastCh)) ||
        (expectLastCh === WHITESPACE && isWhiteSpace(lastCh))
      ) {
        if (
          expectCh === ch ||
          expectCh === ANY ||
          (expectCh === IDENT && isIdent(ch)) ||
          (expectCh === NOT_IDENT && !isIdent(ch) && ch !== DOT) ||
          (expectCh === WHITESPACE && isWhiteSpace(ch))
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
            if (newMode === EXIT || newMode == EXIT_INSERT_SCOPE) {
              if (newMode === EXIT_INSERT_SCOPE) {
                if (mode === starSelector && !shouldNotInsertScoping()) {
                  // Replace `*` with the scoping elementClassIdSelector.
                  if (isChainedSelector(ch)) {
                    // *foo
                    flush(idx - 2);
                  } else {
                    // * (by itself)
                    insertScopingSelector(idx - 2);
                  }
                  lastIdx++;
                } else {
                  if (!isChainedSelector(ch)) {
                    // We are exiting one of the Selector so we may need to
                    const offset =
                      expectCh == NOT_IDENT ? 1 : expectCh == CLOSE_PARENTHESIS ? 2 : 0;
                    insertScopingSelector(idx - offset);
                  }
                }
              }
              if (expectCh === NOT_IDENT) {
                // NOT_IDENT is not a real character more like lack of what we expected.
                // if pseudoGlobal we need to give it a chance to exit as well.
                // For this reason we need to reparse the last character again.
                idx--;
                ch = lastCh;
              }
              do {
                mode = stack.pop() || rule;
                if (mode === pseudoGlobal) {
                  // Skip over the `)` in `:global(...)`.
                  flush(idx - 1);
                  lastIdx++;
                }
              } while (isSelfClosingRule(mode));
            } else {
              stack.push(mode);
              if (mode === pseudoGlobal && newMode === rule) {
                flush(idx - 8); // `:global(`.length
                lastIdx = idx; // skip over ":global("
              } else if (newMode === pseudoElement) {
                // We are entering pseudoElement `::foo`; insert scoping in front of it.
                insertScopingSelector(chIdx);
              }
              mode = newMode;
              ch == SPACE; // Pretend not an identifier so that we don't flush again on elementClassIdSelector
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
    if (mode === pseudoGlobal || shouldNotInsertScoping()) {
      return;
    }

    flush(idx);
    out.push('.', ComponentStylesPrefixContent, scopeId);
    DEBUG && console.log('INSERT', out.join(''));
  }
  function lookAhead(arc: StateArc): boolean {
    let prefix = 0; // Ignore vendor prefixes such as `-webkit-`.
    if (css.charCodeAt(idx) === DASH) {
      for (let i = 1; i < 10; i++) {
        // give up after 10 characters
        if (css.charCodeAt(idx + i) === DASH) {
          prefix = i + 1;
          break;
        }
      }
    }
    words: for (let arcIndx = 3; arcIndx < arc.length; arcIndx++) {
      const txt = arc[arcIndx] as string;
      for (let i = 0; i < txt.length; i++) {
        if ((css.charCodeAt(idx + i + prefix) | LOWERCASE) !== txt.charCodeAt(i)) {
          continue words;
        }
      }
      // we found a match;
      idx += txt.length + prefix;
      return true;
    }
    return false;
  }

  function shouldNotInsertScoping(): boolean {
    return stack.indexOf(pseudoGlobal) !== -1 || stack.indexOf(atRuleSelector) !== -1;
  }
};

const isIdent = (ch: number): boolean => {
  return (
    (ch >= _0 && ch <= _9) ||
    (ch >= A && ch <= Z) ||
    (ch >= a && ch <= z) ||
    ch >= 0x80 ||
    ch === UNDERSCORE ||
    ch === DASH
  );
};

const isChainedSelector = (ch: number): boolean => {
  return ch === COLON || ch === DOT || ch === OPEN_BRACKET || ch === HASH || isIdent(ch);
};

const isSelfClosingRule = (mode: number): boolean => {
  return (
    mode === atRuleBlock || mode === atRuleSelector || mode === atRuleInert || mode === pseudoGlobal
  );
};

const isWhiteSpace = (ch: number): boolean => {
  return ch === SPACE || ch === TAB || ch === NEWLINE || ch === CARRIAGE_RETURN;
};

const modeToString = (mode: number): string => {
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
    'EXIT',
    'EXIT_INSERT_SCOPE',
  ][mode];
};

const charToString = (ch: number): string => {
  return ['ANY', 'IDENT', 'NOT_IDENT', 'WHITESPACE'][ch] || String.fromCharCode(ch);
};

const rule = 0; // top level initial space.
const elementClassIdSelector = 1; // .elementClassIdSelector {}
const starSelector = 2; // * {}
const pseudoClassWithSelector = 3; // :pseudoClass(elementClassIdSelector) {}
const pseudoClass = 4; // :pseudoClass {}
const pseudoGlobal = 5; // :global(elementClassIdSelector)
const pseudoElement = 6; // ::pseudoElement {}
const attrSelector = 7; // [attr] {}
const inertParenthesis = 8; // (ignored)
const inertBlock = 9; // {ignored}
const atRuleSelector = 10; // @keyframe elementClassIdSelector {}
const atRuleBlock = 11; // @media {elementClassIdSelector {}}
const atRuleInert = 12; // @atRule something;
const body = 13; // .elementClassIdSelector {body}
const stringSingle = 14; // 'text'
const stringDouble = 15; // 'text'
const commentMultiline = 16; // /* ... */
// NOT REAL MODES
const EXIT = 17; // Exit the mode
const EXIT_INSERT_SCOPE = 18; // Exit the mode INSERT SCOPE

const ANY = 0;
const IDENT = 1;
const NOT_IDENT = 2;
const WHITESPACE = 3;
const TAB = 9; // `\t`.charCodeAt(0);
const NEWLINE = 10; // `\n`.charCodeAt(0);
const CARRIAGE_RETURN = 13; // `\r`.charCodeAt(0);
const SPACE = 32; // ` `.charCodeAt(0);
const DOUBLE_QUOTE = 34; // `"`.charCodeAt(0);
const HASH = 35; // `#`.charCodeAt(0);
const SINGLE_QUOTE = 39; // `'`.charCodeAt(0);
const OPEN_PARENTHESIS = 40; // `(`.charCodeAt(0);
const CLOSE_PARENTHESIS = 41; // `)`.charCodeAt(0);
const STAR = 42; // `*`.charCodeAt(0);
// const COMMA = 44; // `,`.charCodeAt(0);
const DASH = 45; // `-`.charCodeAt(0);
const DOT = 46; // `.`.charCodeAt(0);
const FORWARD_SLASH = 47; // `/`.charCodeAt(0);
const _0 = 48; // `0`.charCodeAt(0);
const _9 = 57; // `9`.charCodeAt(0);
const COLON = 58; // `:`.charCodeAt(0);
const SEMICOLON = 59; // `;`.charCodeAt(0);
// const LESS_THAN = 60; // `<`.charCodeAt(0);
const AT = 64; // `@`.charCodeAt(0);
const A = 65; // `A`.charCodeAt(0);
const Z = 90; // `Z`.charCodeAt(0);
const OPEN_BRACKET = 91; // `[`.charCodeAt(0);
const CLOSE_BRACKET = 93; // `]`.charCodeAt(0);
const BACKSLASH = 92; // `\\`.charCodeAt(0);
const UNDERSCORE = 95; // `_`.charCodeAt(0);
const LOWERCASE = 0x20; // `a`.charCodeAt(0);
const a = 97; // `a`.charCodeAt(0);
// const d = 100; // `d`.charCodeAt(0);
// const g = 103; // 'g'.charCodeAt(0);
// const h = 104; // `h`.charCodeAt(0);
// const i = 105; // `i`.charCodeAt(0);
// const l = 108; // `l`.charCodeAt(0);
// const t = 116; // `t`.charCodeAt(0);
const z = 122; // `z`.charCodeAt(0);
const OPEN_BRACE = 123; // `{`.charCodeAt(0);
const CLOSE_BRACE = 125; // `}`.charCodeAt(0);

type StateArc = [
  /// If the last character is this:
  number,
  /// If the current character is this:
  number,
  /// Then transition to this state:
  number,
  /// Optional look ahead strings
  ...string[],
];

const STRINGS_COMMENTS: StateArc[] = /*__PURE__*/ (() => [
  [ANY, SINGLE_QUOTE, stringSingle],
  [ANY, DOUBLE_QUOTE, stringDouble],
  [ANY, FORWARD_SLASH, commentMultiline, '*'],
])();

const STATE_MACHINE: StateArc[][] = /*__PURE__*/ (() => [
  [
    /// rule
    [ANY, STAR, starSelector],
    [ANY, OPEN_BRACKET, attrSelector],
    [ANY, COLON, pseudoElement, ':', 'before', 'after', 'first-letter', 'first-line'],
    [ANY, COLON, pseudoGlobal, 'global'],
    [
      ANY,
      COLON,
      pseudoClassWithSelector,
      'has',
      'host-context',
      'not',
      'where',
      'is',
      'matches',
      'any',
    ],
    [ANY, COLON, pseudoClass],
    [ANY, IDENT, elementClassIdSelector],
    [ANY, DOT, elementClassIdSelector],
    [ANY, HASH, elementClassIdSelector],
    [ANY, AT, atRuleSelector, 'keyframe'],
    [ANY, AT, atRuleBlock, 'media', 'supports', 'container'],
    [ANY, AT, atRuleInert],
    [ANY, OPEN_BRACE, body],
    [FORWARD_SLASH, STAR, commentMultiline],
    [ANY, SEMICOLON, EXIT],
    [ANY, CLOSE_BRACE, EXIT],
    [ANY, CLOSE_PARENTHESIS, EXIT],
    ...STRINGS_COMMENTS,
  ],
  [
    /// elementClassIdSelector
    [ANY, NOT_IDENT, EXIT_INSERT_SCOPE],
  ],
  [
    /// starSelector
    [ANY, NOT_IDENT, EXIT_INSERT_SCOPE],
  ],
  [
    /// pseudoClassWithSelector
    [ANY, OPEN_PARENTHESIS, rule],
    [ANY, NOT_IDENT, EXIT_INSERT_SCOPE],
  ],
  [
    /// pseudoClass
    [ANY, OPEN_PARENTHESIS, inertParenthesis],
    [ANY, NOT_IDENT, EXIT_INSERT_SCOPE],
  ],
  [
    /// pseudoGlobal
    [ANY, OPEN_PARENTHESIS, rule],
    [ANY, NOT_IDENT, EXIT],
  ],
  [
    /// pseudoElement
    [ANY, NOT_IDENT, EXIT],
  ],
  [
    /// attrSelector
    [ANY, CLOSE_BRACKET, EXIT_INSERT_SCOPE],
    [ANY, SINGLE_QUOTE, stringSingle],
    [ANY, DOUBLE_QUOTE, stringDouble],
  ],
  [
    /// inertParenthesis
    [ANY, CLOSE_PARENTHESIS, EXIT],
    ...STRINGS_COMMENTS,
  ],
  [
    /// inertBlock
    [ANY, CLOSE_BRACE, EXIT],
    ...STRINGS_COMMENTS,
  ],
  [
    /// atRuleSelector
    [ANY, CLOSE_BRACE, EXIT],
    [WHITESPACE, IDENT, elementClassIdSelector],
    [ANY, COLON, pseudoGlobal, 'global'],
    [ANY, OPEN_BRACE, body],
    ...STRINGS_COMMENTS,
  ],
  [
    /// atRuleBlock
    [ANY, OPEN_BRACE, rule],
    [ANY, SEMICOLON, EXIT],
    ...STRINGS_COMMENTS,
  ],
  [
    /// atRuleInert
    [ANY, SEMICOLON, EXIT],
    [ANY, OPEN_BRACE, inertBlock],
    ...STRINGS_COMMENTS,
  ],
  [
    /// body
    [ANY, CLOSE_BRACE, EXIT],
    [ANY, OPEN_BRACE, body],
    [ANY, OPEN_PARENTHESIS, inertParenthesis],
    ...STRINGS_COMMENTS,
  ],
  [
    /// stringSingle
    [ANY, SINGLE_QUOTE, EXIT],
  ],
  [
    /// stringDouble
    [ANY, DOUBLE_QUOTE, EXIT],
  ],
  [
    /// commentMultiline
    [STAR, FORWARD_SLASH, EXIT],
  ],
])();
