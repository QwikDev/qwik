/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { expect } from 'chai';
import { TEST_CONFIG } from '../../testing/config.unit.js';
import { QRL } from '../../import/qrl.js';
import { ElementFixture, applyDocumentConfig } from '../../testing/element_fixture.js';
import { createGlobal, QwikGlobal } from '../../testing/node_utils.js';
import { jsxDeclareComponent, jsxFactory } from './factory.js';
import { Host } from './host.js';
import type { JSX_IntrinsicElements } from './html.js';
import type { JSXBase } from './html_base.js';
import { jsxRender } from './render.js';

const _needed_by_JSX_ = jsxFactory; // eslint-disable-line @typescript-eslint/no-unused-vars
const _needed_by_ide_: JSX_IntrinsicElements = null!; // eslint-disable-line @typescript-eslint/no-unused-vars

// TODO(test): add test where `<Foo>` => `async function Foo`

describe('render', () => {
  let global: QwikGlobal;
  let document: Document;
  let host: HTMLElement;

  beforeEach(() => {
    global = createGlobal();
    host = global.document.createElement('host');
    document = global.document;
    applyDocumentConfig(document, TEST_CONFIG);
  });

  it('should render basic DOM structure', () => {
    jsxRender(host, <div id="abc">test</div>, global.document);
    expect(host.innerHTML).to.equal('<div id="abc">test</div>');
  });

  it('should not destroy existing DOM', () => {
    jsxRender(host, <div id="foo">original</div>, global.document);
    const originalDiv = host.firstChild;
    jsxRender(host, <div class="bar">overwrite</div>, global.document);
    expect(host.firstChild).to.equal(originalDiv, 'node identity should not be destroyed');
    expect(host.innerHTML).to.equal('<div id="foo" class="bar">overwrite</div>');
  });

  it('should remove extra text', () => {
    jsxRender(host, <div>original</div>, global.document);
    jsxRender(
      host,
      <div>
        {'a'}
        {'b'}
      </div>,
      global.document
    );
    expect(host.innerHTML).to.equal('<div>ab</div>');
    jsxRender(host, <div>original</div>, global.document);
    expect(host.innerHTML).to.equal('<div>original</div>');
  });

  it('should remove extra nodes', () => {
    jsxRender(
      host,
      <div>
        <span></span>
        <span></span>
      </div>,
      global.document
    );
    jsxRender(host, <div></div>, global.document);
    expect(host.innerHTML).to.equal('<div></div>');
    jsxRender(
      host,
      <div>
        <span></span>
        <span></span>
      </div>,
      global.document
    );
    expect(host.innerHTML).to.equal('<div><span></span><span></span></div>');
  });

  it.skip('should render HEAD', () => {
    // TODO, figure out how <head> should render in this scenario
    const head = document.querySelector('head')!;
    jsxRender(
      head,
      <head>
        <title>Hello World from Server</title>
        <script src="/qwikloader.js" async></script>
      </head>,
      document
    );

    expect(head.outerHTML).to.equal(
      '<head>' +
        '<head>' +
        '<title>Hello World from Server</title>' +
        '<script src="/qwikloader.js" async="true"></script>' +
        '</head>' +
        '</head>'
    );
  });

  it('should render HTML on document', () => {
    const doc = (
      <html>
        <head>
          <title>Hello World from Server</title>
          <script src="/qwikloader.js" async></script>
        </head>
        <body>Hello World!</body>
      </html>
    );
    jsxRender(document, doc, document);

    const html = document.querySelector('html')!;
    expect(html.outerHTML).to.equal(
      '<html>' +
        '<head>' +
        '<title>Hello World from Server</title>' +
        '<script src="/qwikloader.js" async="true"></script>' +
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
      </div>,
      global.document
    );
    expect(host.innerHTML).to.equal(
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
        </>,
        global.document
      );
      expect(host.innerHTML).to.equal('<span>A</span><span>B</span>');
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
        </div>,
        global.document
      );
      expect(host.innerHTML).to.equal('<div><span>A</span><span>B</span></div>');
    });
  });

  describe('innerHTML/innerText', () => {
    it('should be able to render innerHTML', async () => {
      const html = `<span>TEST</span>`;
      await jsxRender(host, <div innerHTML={html}></div>, global.document);
      expect(host.innerHTML).to.equal('<div inner-h-t-m-l=""><span>TEST</span></div>');
    });
  });

  describe('components', () => {
    it('should render components', async () => {
      await jsxRender(
        host,
        <div>
          <greeter url="/" decl:template={QRL`jsx:/render.unit#Greeter_render_with_url`} />
        </div>,
        global.document
      );
      expect(host.innerHTML).to.equal(
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
        jsxFactory('div', {
          'decl:template': 'jsx:/render.unit#Noop_template',
          'bind:.': 'myUrl',
          'on:.render': 'myComponentUrl',
          'on:click': 'myComponent_click',
          'bind:token': 'myTokenUrl',
        }),
        global.document
      );
      expect(host.innerHTML).to.equal(
        '<div decl:template="jsx:/render.unit#Noop_template" bind:.="myUrl" on:.render="myComponentUrl" on:click="myComponent_click" bind:token="myTokenUrl" :="">NOOP</div>'
      );
    });
  });

  describe('<Host>', () => {
    it('should merge component host with <Host>', async () => {
      const fixture = new ElementFixture(TEST_CONFIG);
      fixture.host.innerHTML = '';
      fixture.host.setAttribute('parent', 'pValue');
      await jsxRender(fixture.host, <Host child="cValue">VIEW</Host>, document);
      expect(fixture.host.outerHTML).to.eql(`<host parent="pValue" child="cValue">VIEW</host>`);
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

declare global {
  namespace JSX {
    interface IntrinsicElements {
      greeter: { url?: string } & JSXBase;
    }
  }
}

export function Greeter_render_with_url(props: { url?: string }) {
  return <span>Hello World! ({props.url})</span>;
}

export function Noop_template() {
  return <>NOOP</>;
}
