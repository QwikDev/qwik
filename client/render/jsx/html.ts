/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

declare global {
  type QootElement<T> = T & { $: { event: { [eventName: string]: string } } };

  namespace JSX {
    interface IntrinsicElements {
      a: QootElement<any>;
      html: QootElement<any>;
      head: QootElement<any>;
      title: QootElement<any>;
      script: QootElement<any>;
      section: QootElement<any>;
      header: QootElement<any>;
      footer: QootElement<any>;
      button: QootElement<any>;
      body: QootElement<any>;
      div: QootElement<any>;
      span: QootElement<any>;
      strong: QootElement<any>;
      style: QootElement<any>;
      input: QootElement<any>;
      h1: QootElement<any>;
      h2: QootElement<any>;
      ul: QootElement<any>;
      li: QootElement<any>;
      label: QootElement<any>;
      link: QootElement<any>;
    }
  }
}

/**
 * @internal
 */
// So that this file is treated as module.
export type JSX_IntrinsicElements = JSX.IntrinsicElements;
