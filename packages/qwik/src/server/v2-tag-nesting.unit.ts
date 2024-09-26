import { describe, it, expect } from 'vitest';
import { TagNesting, isTagAllowed } from './v2-tag-nesting';

describe('tag-nesting', () => {
  it('debug', () => {
    expect(isValidNesting('html>body>button>span')).toBe(true);
  });
  it('should test cases', () => {
    const cases: Array<[string, string | true]> = [
      ['html>head>script>#text', true],
      ['html>head>noscript>#text', true],
      ['html>head>style>#text', true],
      ['html>head>meta', true],
      ['html>head>meta>#text', '#text'],
      ['html>head>meta>div', 'div'],
      ['html>head>link', true],
      ['html>head>link>#text', '#text'],
      ['html>head>link>div', 'div'],
      ['html>head>base', true],
      ['html>head>base>#text', '#text'],
      ['html>head>base>div', 'div'],
      ['html>head>template', true],
      ['html>head>template>#text', true],
      ['html>head>template>div', true],
      ['html>body>p>div', 'div'],
      ['html>body>div>custom-element>div>#text', true],
      ['html>body>style>#text', true],
      ['html>body>style>div', 'div'],
      ['html>body>area>div', 'div'],
      ['html>body>img>div', 'div'],
      ['html>body>p>p', 'p'],
      ['html>body>p>div', 'div'],
      ['html>body>p>b>textarea>#text', true],
      ['html>body>textarea>textarea', 'textarea'],
      ['html>body>table>tr', 'tr'],
      ['html>body>button>button', 'button'],
      ['html>body>button>span', true],
      ['html>body>table>thead>th>div', 'th'],
      ['html>body>table>thead>tr>th>div', true],
      ['html>body>table>tbody>tr>td>div', true],
      ['html>body>button>svg>circle', true],
      ['html>body>math>mrow', true],
    ];
    cases.forEach(([path, expectation]) => expect(isValidNesting(path)).toBe(expectation));
  });
});

function isValidNesting(path: string): true | string {
  const parts = path.split('>');
  let state = TagNesting.DOCUMENT;
  for (const part of parts) {
    state =
      part === '#text'
        ? (state & TagNesting.TEXT) === 0
          ? TagNesting.NOT_ALLOWED
          : state
        : isTagAllowed(state, part);
    if (state === TagNesting.NOT_ALLOWED) {
      return part;
    }
  }
  return true;
}
