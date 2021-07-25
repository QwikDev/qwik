import { getInterfaceOrType, getIntrinsicElements, parse } from './jsx-types';

describe('jsx-types', () => {
  it('getInterfaceOrType, interface', () => {
    const sf = parse(`
      interface AnchorHTMLAttributes<T> extends HTMLAttributes<T> {
        download?: any;
        href?: string | undefined;
        target?: HTMLAttributeAnchorTarget;
        type?: string | undefined;
        referrerPolicy?: HTMLAttributeReferrerPolicy | undefined;
      }
    `);
    const i = getInterfaceOrType(sf, 'AnchorHTMLAttributes')!;
    expect(i.name).toBe('AnchorHTMLAttributes');
    expect(i.text).toContain('interface AnchorHTMLAttributes<T> extends HTMLAttributes<T>');
    expect(i.usingTypes).toContain('HTMLAttributeAnchorTarget');
    expect(i.usingTypes).toContain('HTMLAttributeReferrerPolicy');
  });

  it('getInterfaceOrType, type', () => {
    const sf = parse(`
      type HTMLAttributeAnchorTarget =
          | '_self'
          | '_blank'
          | '_parent'
          | '_top'
          | (string & {});
    `);
    const t = getInterfaceOrType(sf, 'HTMLAttributeAnchorTarget')!;
    expect(t.name).toBe('HTMLAttributeAnchorTarget');
    expect(t.text).toContain('type HTMLAttributeAnchorTarget');
    expect(t.usingTypes).toHaveLength(0);
  });

  it('getInterfaceOrType, usingTypes from extends', () => {
    const sf = parse(`
      interface HTMLAttributes<T> extends AriaAttributes, DOMAttributes<T> {}
    `);
    const t = getInterfaceOrType(sf, 'HTMLAttributes')!;
    expect(t.usingTypes).toHaveLength(2);
    expect(t.usingTypes[0]).toBe('AriaAttributes');
    expect(t.usingTypes[1]).toBe('DOMAttributes');
  });

  it('getIntrinsicElements', () => {
    const sf = parse(`
      declare global {
        namespace JSX {
          interface IntrinsicElements {
            a: React.DetailedHTMLProps<React.AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>;
            abbr: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
            svg: React.SVGProps<SVGSVGElement>;
          }
        }
      }
    `);
    const elements = getIntrinsicElements(sf);
    expect(elements).toHaveLength(3);
    expect(elements[0].tag).toBe('a');
    expect(elements[0].attributesInterface).toBe('AnchorHTMLAttributes');
    expect(elements[0].elementInterface).toBe('HTMLAnchorElement');
    expect(elements[1].tag).toBe('abbr');
    expect(elements[1].attributesInterface).toBe('HTMLAttributes');
    expect(elements[1].elementInterface).toBe('HTMLElement');
    expect(elements[2].tag).toBe('svg');
    expect(elements[2].attributesInterface).toBe('SVGProps');
    expect(elements[2].elementInterface).toBe('SVGSVGElement');
  });
});
