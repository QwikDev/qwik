import { ComponentStylesPrefixContent } from '../util/markers';

export function scopeStylesheet(css: string, scopeId: string): string {
  const end = css.length;
  const out: string[] = [];
  const stack: MODE[] = [];
  let idx = 0;
  let lastIdx = idx;
  let mode: MODE = MODE.selector as any;
  let lastCh = 0;
  while (idx < end) {
    let ch = css.charCodeAt(idx++);
    if (ch === CHAR.BACKSLASH) {
      idx++;
      ch = CHAR.A; // Pretend it's a letter
    }
    const arcs = STATE_MACHINE[mode];
    for (let i = 0; i < arcs.length; i++) {
      const [expectLastCh, expectCh, newMode] = arcs[i];
      if (
        expectLastCh === lastCh ||
        expectLastCh === CHAR.ANY ||
        (expectLastCh === CHAR.IDENT && isIdent(lastCh))
      ) {
        if (
          expectCh === ch ||
          expectCh === CHAR.ANY ||
          (expectCh === CHAR.NOT_IDENT_AND_NOT_DOT && !isIdent(ch) && ch !== CHAR.DOT)
        ) {
          if (newMode === MODE.EXIT) {
            mode = stack.pop() || MODE.selector;
          } else if (mode === newMode) {
            flush(idx - 1);
            out.push('.', ComponentStylesPrefixContent, scopeId);
          } else {
            stack.push(mode);
            mode = newMode;
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
    lastIdx = idx;
  }
}

function isIdent(ch: number): boolean {
  return (
    (ch >= CHAR._0 && ch <= CHAR._9) ||
    (ch >= CHAR.A && ch <= CHAR.Z) ||
    (ch >= CHAR.a && ch <= CHAR.z) ||
    ch === CHAR.UNDERSCORE ||
    ch === CHAR.DASH
  );
}

const enum MODE {
  selector, // .selector {}
  media, // .selector {}
  body, // .selector {body}
  stringSingle, // 'text'
  stringDouble, // 'text'
  commentMultiline, // /* ... */
  EXIT, // Exit the mode (Not a real mode)
}

const enum CHAR {
  ANY = 0,
  IDENT = 1,
  NOT_IDENT_AND_NOT_DOT = 2,
  SPACE = 32, // ` `.charCodeAt(0);
  FORWARD_SLASH = 47, // `/`.charCodeAt(0);
  DOUBLE_QUOTE = 34, // `"`.charCodeAt(0);
  SINGLE_QUOTE = 39, // `'`.charCodeAt(0);
  STAR = 42, // `*`.charCodeAt(0);
  DASH = 45, // `-`.charCodeAt(0);
  DOT = 46, // `.`.charCodeAt(0);
  AT = 64, // `@`.charCodeAt(0);
  A = 65, // `A`.charCodeAt(0);
  Z = 90, // `Z`.charCodeAt(0);
  _0 = 48, // `0`.charCodeAt(0);
  _9 = 57, // `9`.charCodeAt(0);
  BACKSLASH = 92, // `\\`.charCodeAt(0);
  UNDERSCORE = 95, // `_`.charCodeAt(0);
  a = 97, // `a`.charCodeAt(0);
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
  MODE
];

const STATE_MACHINE: StateArc[][] = [
  [
    [CHAR.IDENT, CHAR.NOT_IDENT_AND_NOT_DOT, MODE.selector],
    [CHAR.ANY, CHAR.AT, MODE.media],
    [CHAR.ANY, CHAR.OPEN_BRACE, MODE.body],
    [CHAR.FORWARD_SLASH, CHAR.STAR, MODE.commentMultiline],
  ] /*selector*/,
  [
    [CHAR.ANY, CHAR.CLOSE_BRACE, MODE.EXIT],
    [CHAR.FORWARD_SLASH, CHAR.STAR, MODE.commentMultiline],
    [CHAR.ANY, CHAR.OPEN_BRACE, MODE.selector],
    [CHAR.FORWARD_SLASH, CHAR.STAR, MODE.commentMultiline],
  ] /*media*/,
  [
    [CHAR.ANY, CHAR.CLOSE_BRACE, MODE.EXIT],
    [CHAR.ANY, CHAR.SINGLE_QUOTE, MODE.stringSingle],
    [CHAR.ANY, CHAR.DOUBLE_QUOTE, MODE.stringDouble],
    [CHAR.FORWARD_SLASH, CHAR.STAR, MODE.commentMultiline],
  ] /*body*/,
  [[CHAR.ANY, CHAR.SINGLE_QUOTE, MODE.EXIT]] /*stringSingle*/,
  [[CHAR.ANY, CHAR.DOUBLE_QUOTE, MODE.EXIT]] /*stringDouble*/,
  [[CHAR.STAR, CHAR.FORWARD_SLASH, MODE.EXIT]] /*commentMultiline*/,
];
