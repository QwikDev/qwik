import { describe, expect, it } from 'vitest';
import { createWindow } from '../../testing/document';
import { findBranchTextRange, findForRange, findForRowRanges } from './node-walker';

describe('node walker', () => {
  it('keeps nested for rows inside their parent row', () => {
    const win = createWindow({
      html: '<div id="root"><!--f=1--><!--r=10--><!--f=2--><!--r=20--><i></i><!--/r--><!--/f--><!--/r--><!--r=11--><b></b><!--/r--><!--/f--></div>',
    });
    const root = win.document.getElementById('root')!;
    const outer = findForRange(root, 1)!;
    const nested = findForRange(root, 2)!;

    expect(findForRowRanges(outer[0], outer[1]).length).toBe(2);
    expect(findForRowRanges(nested[0], nested[1]).length).toBe(1);
  });

  describe('findBranchTextRange', () => {
    const rootWith = (html: string) =>
      createWindow({ html: `<div id="root">${html}</div>` }).document.getElementById('root')!;

    it.each([
      ['branch', '<!--b=7--><span></span><!--/b-->', 'b=7', '/b'],
      ['for row', '<!--f=1--><!--r=7--><span></span><!--/r--><!--/f-->', 'r=7', '/r'],
      ['slot', '<!--s=7--><span></span><!--/s-->', 's=7', '/s'],
    ])('finds a %s range', (_name, html, open, close) => {
      const range = findBranchTextRange(rootWith(html), 7)!;

      expect(range[0].data).toBe(open);
      expect(range[1].data).toBe(close);
    });

    it('returns null when no range owns the id', () => {
      expect(findBranchTextRange(rootWith('<!--b=1--><!--/b-->'), 7)).toBeNull();
    });

    it('skips nested closers when locating the end', () => {
      const range = findBranchTextRange(
        rootWith('<!--b=7--><!--b=8--><span></span><!--/b--><!--/b-->'),
        7
      )!;

      expect(range[1]).toBe(range[0].parentNode!.lastChild);
    });
  });
});
