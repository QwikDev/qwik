import { describe, it, expect } from 'vitest';
import { TagNesting, isTagAllowed } from './tag-nesting';

describe('tag-nesting', () => {
  // Head element tests
  describe('head element content', () => {
    it('should allow text content in script elements', () => {
      expect(isValidNesting('html>head>script>#text')).toBe(true);
    });

    it('should allow text content in noscript elements', () => {
      expect(isValidNesting('html>head>noscript>#text')).toBe(true);
    });

    it('should allow text content in style elements', () => {
      expect(isValidNesting('html>head>style>#text')).toBe(true);
    });

    it('should allow meta elements', () => {
      expect(isValidNesting('html>head>meta')).toBe(true);
    });

    it('should not allow text content in meta elements', () => {
      expect(isValidNesting('html>head>meta>#text')).toBe('#text');
    });

    it('should not allow div elements in meta elements', () => {
      expect(isValidNesting('html>head>meta>div')).toBe('div');
    });

    it('should allow link elements', () => {
      expect(isValidNesting('html>head>link')).toBe(true);
    });

    it('should not allow text content in link elements', () => {
      expect(isValidNesting('html>head>link>#text')).toBe('#text');
    });

    it('should not allow div elements in link elements', () => {
      expect(isValidNesting('html>head>link>div')).toBe('div');
    });

    it('should allow base elements', () => {
      expect(isValidNesting('html>head>base')).toBe(true);
    });

    it('should not allow text content in base elements', () => {
      expect(isValidNesting('html>head>base>#text')).toBe('#text');
    });

    it('should not allow div elements in base elements', () => {
      expect(isValidNesting('html>head>base>div')).toBe('div');
    });

    it('should allow template elements', () => {
      expect(isValidNesting('html>head>template')).toBe(true);
    });

    it('should allow text content in template elements', () => {
      expect(isValidNesting('html>head>template>#text')).toBe(true);
    });

    it('should allow div elements in template elements', () => {
      expect(isValidNesting('html>head>template>div')).toBe(true);
    });
  });

  // Body element tests
  describe('body element content', () => {
    it('should not allow div elements in p elements', () => {
      expect(isValidNesting('html>body>p>div')).toBe('div');
    });

    it('should allow custom elements with div and text content', () => {
      expect(isValidNesting('html>body>div>custom-element>div>#text')).toBe(true);
    });

    it('should allow text content in style elements', () => {
      expect(isValidNesting('html>body>style>#text')).toBe(true);
    });

    it('should not allow div elements in style elements', () => {
      expect(isValidNesting('html>body>style>div')).toBe('div');
    });

    it('should not allow div elements in self-closing area elements', () => {
      expect(isValidNesting('html>body>area>div')).toBe('div');
    });

    it('should not allow div elements in self-closing img elements', () => {
      expect(isValidNesting('html>body>img>div')).toBe('div');
    });

    it('should not allow p elements nested in p elements', () => {
      expect(isValidNesting('html>body>p>p')).toBe('p');
    });

    it('should allow textarea with text content inside phrasing elements', () => {
      expect(isValidNesting('html>body>p>b>textarea>#text')).toBe(true);
    });

    it('should not allow nested textarea elements', () => {
      expect(isValidNesting('html>body>textarea>textarea')).toBe('textarea');
    });
  });

  // Table tests
  describe('table element content', () => {
    it('should not allow tr elements directly in table elements', () => {
      expect(isValidNesting('html>body>table>tr')).toBe('tr');
    });

    it('should not allow div elements directly in th elements', () => {
      expect(isValidNesting('html>body>table>thead>th>div')).toBe('th');
    });

    it('should allow div elements in th elements inside tr elements', () => {
      expect(isValidNesting('html>body>table>thead>tr>th>div')).toBe(true);
    });

    it('should allow div elements in td elements', () => {
      expect(isValidNesting('html>body>table>tbody>tr>td>div')).toBe(true);
    });
  });

  // SVG and Math tests
  describe('svg and math content', () => {
    it('should allow svg elements with circle inside button elements', () => {
      expect(isValidNesting('html>body>button>svg>circle')).toBe(true);
    });

    it('should allow math elements with mrow', () => {
      expect(isValidNesting('html>body>math>mrow')).toBe(true);
    });
  });

  // Picture element tests
  describe('picture element content', () => {
    it('should allow source elements in picture elements', () => {
      expect(isValidNesting('html>body>picture>source')).toBe(true);
    });

    it('should allow img elements in picture elements', () => {
      expect(isValidNesting('html>body>picture>img')).toBe(true);
    });

    it('should not allow div elements in picture elements', () => {
      expect(isValidNesting('html>body>picture>div')).toBe('div');
    });

    it('should not allow span elements in picture elements', () => {
      expect(isValidNesting('html>body>picture>span')).toBe('span');
    });

    it('should allow picture with source in p elements', () => {
      expect(isValidNesting('html>body>p>picture>source')).toBe(true);
    });

    it('should allow picture with img in p elements', () => {
      expect(isValidNesting('html>body>p>picture>img')).toBe(true);
    });

    it('should allow picture with source in button elements', () => {
      expect(isValidNesting('html>body>button>picture>source')).toBe(true);
    });

    it('should allow picture with img in button elements', () => {
      expect(isValidNesting('html>body>button>picture>img')).toBe(true);
    });

    it('should allow picture with source in div elements', () => {
      expect(isValidNesting('html>body>div>picture>source')).toBe(true);
    });
  });

  // Button element tests
  describe('button element content', () => {
    it('should allow span elements in button elements', () => {
      expect(isValidNesting('html>body>button>span')).toBe(true);
    });

    it('should allow img elements in button elements', () => {
      expect(isValidNesting('html>body>button>img')).toBe(true);
    });

    it('should allow b elements in button elements', () => {
      expect(isValidNesting('html>body>button>b')).toBe(true);
    });

    it('should allow strong elements in button elements', () => {
      expect(isValidNesting('html>body>button>strong')).toBe(true);
    });

    it('should allow picture elements in button elements', () => {
      expect(isValidNesting('html>body>button>picture')).toBe(true);
    });

    it('should allow picture with source in button elements', () => {
      expect(isValidNesting('html>body>button>picture>source')).toBe(true);
    });

    it('should allow picture with img in button elements', () => {
      expect(isValidNesting('html>body>button>picture>img')).toBe(true);
    });
  });

  describe('button element interactive content restrictions', () => {
    it('should not allow nested button elements', () => {
      expect(isValidNesting('html>body>button>button')).toBe('button');
    });

    it('should not allow input elements in button elements', () => {
      expect(isValidNesting('html>body>button>input')).toBe('input');
    });

    it('should not allow textarea elements in button elements', () => {
      expect(isValidNesting('html>body>button>textarea')).toBe('textarea');
    });

    it('should not allow select elements in button elements', () => {
      expect(isValidNesting('html>body>button>select')).toBe('select');
    });

    it('should not allow anchor elements in button elements', () => {
      expect(isValidNesting('html>body>button>a')).toBe('a');
    });
  });

  describe('button element placement', () => {
    it('should allow button elements in p elements', () => {
      expect(isValidNesting('html>body>p>button')).toBe(true);
    });

    it('should allow button elements in div elements', () => {
      expect(isValidNesting('html>body>div>button')).toBe(true);
    });

    it('should allow button elements in span elements', () => {
      expect(isValidNesting('html>body>span>button')).toBe(true);
    });
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
