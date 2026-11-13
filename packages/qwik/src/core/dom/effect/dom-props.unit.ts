import { describe, expect, it, vi } from 'vitest';
import { QError } from '../../shared/error/error';
import { createDocument } from '../../../testing/document';
import { applyDomProps, ownedDomProps, renderDomPropsToString } from './dom-props';

const build = vi.hoisted(() => ({ isDev: true }));
vi.mock('@qwik.dev/core/build', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  get isDev() {
    return build.isDev;
  },
}));

const unsafeAttrNames = [
  'x onmouseover',
  'x\tonmouseover',
  'x\nonmouseover',
  'x\fonmouseover',
  'x\ronmouseover',
  'x/onmouseover',
  'x>onmouseover',
  'x=onmouseover',
  'x"onmouseover',
  "x'onmouseover",
  'x><script>alert(1)</script><p y',
];

describe('renderDomPropsToString', () => {
  it.each(unsafeAttrNames)('rejects the spread attribute name %j in dev', (name) => {
    build.isDev = true;
    expect(() => renderDomPropsToString({ [name]: 'value' })).toThrow(
      `Code(Q${QError.unsafeAttr})`
    );
  });

  it.each(unsafeAttrNames)('drops the spread attribute name %j in prod', (name) => {
    build.isDev = false;
    try {
      expect(renderDomPropsToString({ title: 'kept', [name]: 'value' }).attrs).toEqual([
        ' title="kept"',
      ]);
      expect(renderDomPropsToString({ [name]: true }).attrs).toEqual([]);
    } finally {
      build.isDev = true;
    }
  });
});

describe('applyDomProps', () => {
  it('writes only the spread attribute that changed', () => {
    const element = createDocument().createElement('div');
    const setAttribute = vi.spyOn(element, 'setAttribute');
    const first = applyDomProps(element, { title: 'same', 'data-state': 'old' });
    setAttribute.mockClear();

    applyDomProps(element, { title: 'same', 'data-state': 'new' }, first);

    expect(setAttribute.mock.calls).toEqual([['data-state', 'new']]);
  });

  it('resets a typed input value whenever its props rerun', () => {
    const input = createDocument().createElement('input');
    const first = applyDomProps(input, { value: 'authored', title: 'a' });
    input.value = 'typed';

    applyDomProps(input, { value: 'authored', title: 'b' }, first);

    expect(input.value).toBe('authored');
  });

  it('removes a server attribute the first resumed run leaves undefined', () => {
    const element = createDocument().createElement('div');
    element.setAttribute('title', 'server');

    applyDomProps(element, { title: undefined }, ownedDomProps(element));

    expect(element.hasAttribute('title')).toBe(false);
  });

  it('keeps the last of class and className on every run', () => {
    const element = createDocument().createElement('div');
    const first = applyDomProps(element, { class: 'a', className: 'b' });

    applyDomProps(element, { class: 'a', className: 'b' }, first);

    expect(element.className).toBe('b');
  });
});
