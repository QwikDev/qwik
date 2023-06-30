import { getCallout } from './callout';

export function toHTML(tokens: Token[], layer: number) {
  const HTML: string[] = [];
  tokens.forEach((token, idx) => {
    const callout = token.layer == layer && getCallout(token.text, tokens[idx + 1]?.text);
    const classes = [
      'layer-' + token.layer,
      token.layer === layer ? 'code-' + token.type : 'code-transparent',
    ];
    if (callout) {
      classes.push('callout-anchor');
    }
    HTML.push(`<span class="${classes.join(' ')}">${token.text.replace('<', '&lt;')}</span>`);
    // if (callout) {
    //   HTML.push('<div class="callout">', callout.html, '</div>');
    // }
  });

  return HTML.join('');
}

export interface Token {
  type: string;
  from: number;
  to: number;
  text: string;
  layer: number;
}

function tokenize(text: string) {
  let layer = 0;
  const stack: Token[] = [];
  let i = 0;
  let lastI = i;
  const tokens: Token[] = [];
  while (i < text.length) {
    const ch = text[i++];
    const peekCh = text[i];
    if (ch == '"') {
      consume('string', (ch) => ch !== '"', true);
    } else if (ch == "'") {
      consume('string', (ch) => ch !== "'", true);
    } else if (isWhitespace(ch)) {
      consume('whitespace', isWhitespace);
    } else if (isIdent(ch)) {
      consume('ident', isIdent);
    } else if (ch === '<' && (isIdent(peekCh) || peekCh == '/' || peekCh == '>')) {
      consume('JSX-brace', () => false);
    } else if (ch == '=' && peekCh == '>') {
      consume('decl', (ch) => ch === '>', true);
    } else if (isOpenBrace(ch)) {
      consume('brace', () => false);
    } else if (isCloseBrace(ch)) {
      consume('brace', () => false);
    } else {
      consume('misc', () => false);
    }
  }
  return tokens;

  function consume(type: string, predicate: (ch: string) => boolean, inclusive?: boolean) {
    while (i < text.length) {
      const ch = text[i];
      if (!predicate(ch)) {
        if (inclusive) {
          i++;
        }
        break;
      }
      i++;
    }
    push(type);
  }

  function push(type: string) {
    const tokenText = text.substring(lastI, i);
    if (type == 'ident') {
      const inType = stack[stack.length - 1]?.type;
      if (inType !== 'JSX-brace' && (after(':') || after('as'))) {
        type = 'type';
      } else if (text[i] == '(') {
        type = 'invocation';
      } else {
        if (inType == 'JSX-brace') {
          type = isUpperCase(tokenText[0]) ? 'JSX-component' : 'JSX-element';
        }
      }
    }
    if (isCloseBrace(tokenText)) {
      const matchToken = stack.pop()!;
      layer = matchToken.layer;
      type = matchToken.type;
    }
    const token = {
      type: KEYWORDS[tokenText] || type,
      from: lastI,
      to: i,
      text: tokenText,
      layer: layer,
    };
    if (isOpenBrace(tokenText)) {
      const prevToken = tokens[tokens.length - 1];
      const prevPrevToken = tokens[tokens.length - 2];
      if (tokenText === '(' && prevToken?.text?.endsWith('$')) {
        layer = LAYERS[prevToken.text] || 0;
      } else if (tokenText == '{' && prevToken?.text === '=' && prevPrevToken?.text.endsWith('$')) {
        layer = 2;
      }
      stack.push(token);
    }
    tokens.push(token);
    lastI = i;
    //console.log(tokens[tokens.length - 1]);
  }

  function after(text: string) {
    for (let i = tokens.length - 1; i >= 0; i--) {
      const token = tokens[i];
      if (token.type === 'whitespace') {
        continue;
      }
      return token.text == text;
    }
    return false;
  }
}

function isWhitespace(ch: string) {
  return ch == ' ' || ch == '\n';
}
function isOpenBrace(ch: string) {
  return ch == '{' || ch == '(' || ch == '[' || ch == '<';
}
function isCloseBrace(ch: string) {
  return ch == '}' || ch == ')' || ch == ']' || ch == '>';
}
function isUpperCase(ch: string) {
  return 'A' <= ch && ch <= 'Z';
}
function isLowerCase(ch: string) {
  return 'a' <= ch && ch <= 'z';
}

function isIdent(ch: string) {
  return isLowerCase(ch) || isUpperCase(ch) || ch === '_' || ch === '$';
}

const KEYWORDS: Record<string, string> = {};
'import|function|default|return|export|as|await|async'
  .split('|')
  .forEach((key) => (KEYWORDS[key] = 'keyword'));
'const|let|var'.split('|').forEach((key) => (KEYWORDS[key] = 'decl'));

const LAYERS: Record<string, number> = {
  routeLoader$: 0,
  routeAction$: 0,
  component$: 1,
  server$: 0,
};

const SRC = `import { component$ } from "@builder.io/qwik";
import { Form, routeAction$, routeLoader$ } from "@builder.io/qwik-city";

const useDice = routeLoader$(() => Math.round(Math.random() * 6) + 1);
const useBetAction = routeAction$((params) => {
  console.log(params.up ? "UP" : params.down ? "DOWN" : "???");
});

export default component$(() => {
  const dice = useDice();
  const betAction = useBetAction();
  return (
    <>
      <span>Roll: {dice}</span>
      <Form action={betAction}>
        <button name="up">👍</button>
        <button name="down">👎</button>
      </Form>
    </>
  );
});
`;
const tokens = tokenize(SRC);
export const srcLayer0 = toHTML(tokens, 0);
export const srcLayer1 = toHTML(tokens, 1);
export const srcLayer2 = toHTML(tokens, 2);
