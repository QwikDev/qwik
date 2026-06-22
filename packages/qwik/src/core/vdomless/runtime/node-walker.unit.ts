import { describe, expect, it } from 'vitest';
import { createWindow } from '../../../testing/document';
import { findForRange, findForRowRanges } from './node-walker';

describe('vdomless node walker', () => {
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
});
