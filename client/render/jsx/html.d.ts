/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

namespace Qoot {
  interface ELement<T> extends T {
    $: { event: { [eventName: string]: string } };
  }
}

namespace JSX {
  interface IntrinsicElements {
    html: Qoot.Element<any>;
    head: Qoot.Element<any>;
    title: Qoot.Element<any>;
    script: Qoot.Element<any>;
    body: Qoot.Element<any>;
    div: Qoot.Element<any>;
    span: Qoot.Element<any>;
    input: Qoot.Element<any>;
  }
}
