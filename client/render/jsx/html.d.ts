/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

declare global {
  // TODO[cleanup]: is this used?
  namespace Qoot {
    interface ELement<T> extends T {
      $: { event: { [eventName: string]: string } };
    }
  }

  namespace JSX {
    interface IntrinsicElements {
      a: Qoot.Element<nameStub>;
      html: Qoot.Element<nameStub>;
      head: Qoot.Element<nameStub>;
      title: Qoot.Element<nameStub>;
      script: Qoot.Element<nameStub>;
      section: Qoot.Element<nameStub>;
      header: Qoot.Element<nameStub>;
      footer: Qoot.Element<nameStub>;
      button: Qoot.Element<nameStub>;
      body: Qoot.Element<nameStub>;
      div: Qoot.Element<nameStub>;
      span: Qoot.Element<nameStub>;
      strong: Qoot.Element<nameStub>;
      style: Qoot.Element<nameStub>;
      input: Qoot.Element<nameStub>;
      h1: Qoot.Element<nameStub>;
      h2: Qoot.Element<nameStub>;
      ul: Qoot.Element<nameStub>;
      li: Qoot.Element<nameStub>;
      label: Qoot.Element<nameStub>;
      link: Qoot.Element<nameStub>;
    }
  }
}

// So that this file is treated as module.
export type JSX_IntrinsicElements = JSX.IntrinsicElements;
