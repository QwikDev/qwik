/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import '../../CONFIG.js';
import type { JSX_IntrinsicElements } from './html.js';
import { expect } from 'chai';
import { createGlobal, QootGlobal } from '../../testing/node_utils.js';
import { jsxDeclareComponent, jsxFactory } from './factory.js';
import { jsxRender } from './render.js';
import { QRL } from '../../import/index.js';

const _needed_by_JSX_ = jsxFactory; // eslint-disable-line @typescript-eslint/no-unused-vars
const _needed_by_ide_: JSX_IntrinsicElements = null!; // eslint-disable-line @typescript-eslint/no-unused-vars

describe('render', () => {
  let global: QootGlobal;
  let document: Document;
  let host: HTMLElement;
  beforeEach(() => {
    global = createGlobal(import.meta.url);
    host = global.document.createElement('host');
    document = global.document;
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

  it('should render HEAD', () => {
    const head = document.querySelector('head')!;
    jsxRender(
      head,
      <head>
        <title>Hello World from Server</title>
        <script src="/qootloader.js" async></script>
      </head>,
      document
    );

    expect(head.outerHTML).to.equal(
      '<head>' +
        '<head>' +
        '<title>Hello World from Server</title>' +
        '<script src="/qootloader.js" async="true"></script>' +
        '</head>' +
        '</head>'
    );
  });

  it('should render HTML on document', () => {
    const doc = (
      <html>
        <head>
          <title>Hello World from Server</title>
          <script src="/qootloader.js" async></script>
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
        '<script src="/qootloader.js" async="true"></script>' +
        '</head>' +
        '<body>Hello World!</body>' +
        '</html>'
    );
  });

  describe('components', () => {
    it('should render components', async () => {
      await jsxRender(
        host,
        <div>
          <greeter url="/" $={{ '::': 'jsx:/render.unit.Greeter_render_with_url' }} />
        </div>,
        global.document
      );
      expect(host.innerHTML).to.equal(
        '<div>' +
          '<greeter url="/" ::="jsx:/render.unit.Greeter_render_with_url" :="">' +
          '<span>Hello World! (/)</span>' +
          '</greeter>' +
          '</div>'
      );
    });
  });

  it('should render components as symbols', async () => {
    const Greeter = jsxDeclareComponent<{ url: string }>(
      'greeter',
      QRL`jsx:/render.unit.Greeter_render_with_url`
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
        '<greeter url="/" ::="jsx:/render.unit.Greeter_render_with_url" :="">' +
        '<span>Hello World! (/)</span>' +
        '</greeter>' +
        '</div>'
    );

    it('should render component from URL', () => {
      jsxRender(
        host,
        <div>
          <TestComponent />
        </div>,
        global.document
      );
      expect(host.innerHTML).to.equal(
        '<div>' +
          '<greeter url="/" ::="./Greeter_render">' +
          '<span>Hello World! (/)</span>' +
          '</greeter>' +
          '</div>'
      );
    });
  });

  describe('qoot properties', () => {
    it('should render event', async () => {
      // possible prefixes: on, in, at, for, to, bind, tie
      // Event prefixes `.` to mean framework event such as `
      await jsxRender(
        host,
        <div
          $={{
            '::': 'jsx:/render.unit.Noop_template',
            'bind:.': 'myUrl',
            'on:.render': 'myComponentUrl',
            'on:click': 'myComponent_click',
            'bind:token': 'myTokenUrl',
          }}
        ></div>,
        global.document
      );
      expect(host.innerHTML).to.equal(
        '<div ::="jsx:/render.unit.Noop_template" bind:.="myUrl" on:.render="myComponentUrl" on:click="myComponent_click" bind:token="myTokenUrl" :="">NOOP</div>'
      );
    });
  });
});

declare global {
  namespace JSX {
    interface IntrinsicElements {
      greeter: { url?: string; $: any };
    }
  }
}

function TestComponent(props: {}) {
  return <div>TestComponent: props={JSON.stringify(props)}</div>;
}

export function Greeter_render_with_url(props: { url?: string }) {
  return <span>Hello World! ({props.url})</span>;
}

export function Noop_template() {
  return <>NOOP</>;
}
