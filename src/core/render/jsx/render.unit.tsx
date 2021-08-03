/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { TEST_CONFIG } from '../../util/test_config';
import { QRL } from '../../import/qrl';
import {
  ElementFixture,
  applyDocumentConfig,
  createDocument,
  MockDocument,
} from '@builder.io/qwik/testing';
import { jsxDeclareComponent, h } from './factory';
import { jsx, Fragment } from './jsx-runtime';
import { Host } from './host';
import { jsxRender } from './render';

// TODO(test): add test where `<Foo>` => `async function Foo`

describe('render', () => {
  let doc: MockDocument;
  let host: HTMLElement;

  beforeEach(() => {
    doc = createDocument();
    host = doc.createElement('host');
    applyDocumentConfig(doc, TEST_CONFIG);
  });

  it('should render basic DOM structure', () => {
    jsxRender(host, <div id="abc">test</div>);
    expect(host.innerHTML).toEqual('<div id="abc">test</div>');
  });

  it('should not destroy existing DOM', () => {
    jsxRender(host, <div id="foo">original</div>);
    const originalDiv = host.firstChild;
    jsxRender(host, <div class="bar">overwrite</div>);
    expect(host.firstChild).toEqual(originalDiv);
    expect(host.innerHTML).toEqual('<div id="foo" class="bar">overwrite</div>');
  });

  it('should remove extra text', () => {
    jsxRender(host, <div>original</div>);
    jsxRender(
      host,
      <div>
        {'a'}
        {'b'}
      </div>
    );
    expect(host.innerHTML).toEqual('<div>ab</div>');
    jsxRender(host, <div>original</div>);
    expect(host.innerHTML).toEqual('<div>original</div>');
  });

  it('should remove extra nodes', () => {
    jsxRender(
      host,
      <div>
        <span></span>
        <span></span>
      </div>
    );
    jsxRender(host, <div></div>);
    expect(host.innerHTML).toEqual('<div></div>');
    jsxRender(
      host,
      <div>
        <span></span>
        <span></span>
      </div>
    );
    expect(host.innerHTML).toEqual('<div><span></span><span></span></div>');
  });

  it('should render HTML on document', () => {
    const cmp = (
      <html>
        <head>
          <title>Hello World Testing!</title>
        </head>
        <body>Hello World!</body>
      </html>
    );
    jsxRender(doc, cmp);

    expect(doc.title).toBe('Hello World Testing!');

    const titleElm = doc.querySelector('title')!;
    expect(titleElm.textContent).toBe('Hello World Testing!');

    const html = doc.querySelector('html')!;
    expect(html.outerHTML).toEqual(
      '<html>' +
        '<head>' +
        '<title>Hello World Testing!</title>' +
        '</head>' +
        '<body>Hello World!</body>' +
        '</html>'
    );
  });

  it('should render components as symbols', async () => {
    const Greeter = jsxDeclareComponent<{ url: string }>(
      QRL`jsx:/render.unit#Greeter_render_with_url`,
      'greeter'
    );
    await jsxRender(
      host,
      <div>
        <Greeter url="/" />
      </div>
    );
    expect(host.innerHTML).toEqual(
      '<div>' +
        '<greeter decl:template="jsx:/render.unit#Greeter_render_with_url" url="/" :="">' +
        '<span>Hello World! (/)</span>' +
        '</greeter>' +
        '</div>'
    );
  });

  describe('fragment', () => {
    it('should support standalone fragment', () => {
      jsxRender(
        host,
        <>
          <span>A</span>
          <span>B</span>
        </>
      );
      expect(host.innerHTML).toEqual('<span>A</span><span>B</span>');
    });

    it('should support fragment in root of component', () => {
      function Component() {
        return (
          <>
            <span>A</span>
            <span>B</span>
          </>
        );
      }

      jsxRender(
        host,
        <div>
          <Component />
        </div>
      );
      expect(host.innerHTML).toEqual('<div><span>A</span><span>B</span></div>');
    });
  });

  describe('innerHTML/innerText', () => {
    it('should be able to render innerHTML', async () => {
      const html = `<span>TEST</span>`;
      await jsxRender(host, <div innerHTML={html}></div>);
      expect(host.innerHTML).toEqual('<div inner-h-t-m-l=""><span>TEST</span></div>');
    });
  });

  describe('components', () => {
    it('should render components', async () => {
      await jsxRender(
        host,
        <div>
          <greeter url="/" decl:template={QRL`jsx:/render.unit#Greeter_render_with_url`} />
        </div>
      );
      expect(host.innerHTML).toEqual(
        '<div>' +
          '<greeter url="/" decl:template="jsx:/render.unit#Greeter_render_with_url" :="">' +
          '<span>Hello World! (/)</span>' +
          '</greeter>' +
          '</div>'
      );
    });
  });

  describe('qwik properties', () => {
    it('should render event', async () => {
      // possible prefixes: on, in, at, for, to, bind, tie
      // Event prefixes `.` to mean framework event such as `
      await jsxRender(
        host,
        jsx('div', {
          'decl:template': QRL`jsx:/render.unit#Noop_template`,
          'bind:.': 'myUrl',
          'on:.render': 'myComponentUrl',
          'on:click': QRL`myComponent_click`,
          'bind:token': 'myTokenUrl',
        })
      );
      expect(host.innerHTML).toEqual(
        '<div decl:template="jsx:/render.unit#Noop_template" bind:.="myUrl" on:.="" on:.render="myComponentUrl" on:click="myComponent_click" bind:token="myTokenUrl" :="">NOOP</div>'
      );
    });
  });

  describe('<Host>', () => {
    it('should merge component host with <Host>', async () => {
      const fixture = new ElementFixture(TEST_CONFIG);
      fixture.host.innerHTML = '';
      fixture.host.setAttribute('parent', 'pValue');
      await jsxRender(fixture.host, <Host child="cValue">VIEW</Host>);
      expect(fixture.host.outerHTML).toEqual(`<host parent="pValue" child="cValue">VIEW</host>`);
    });

    describe('styling', () => {
      it('should merge style', () => {
        // TODO: implement
      });

      it('should merge class', () => {
        // TODO: implement
      });
    });

    describe('error', () => {
      it('should throw if <Host> is not a root node', async () => {});
    });
  });
});

export function Greeter_render_with_url(props: { url?: string }) {
  return <span>Hello World! ({props.url})</span>;
}

export function Noop_template() {
  return <>NOOP</>;
}
