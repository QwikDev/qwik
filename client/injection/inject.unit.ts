/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { expect } from 'chai';
import '../testing/node_utils.js';
import { createServiceInjector } from './element_injector.js';
import { inject } from './inject.js';
import { injectEventHandler } from './inject_event_handler.js';
import { Injector } from './types.js';

describe('inject', () => {
  const log: string[] = [];
  let injector: Injector;
  beforeEach(() => {
    log.length = 0;
    injector = createServiceInjector(null!, null!);
  });

  it('should inject nothing', async () => {
    const injectedFn = inject(null, () => log.push('invoked'));
    await injector.invoke(injectedFn);
    expect(log).to.eql(['invoked']);
  });

  it('should inject this', async () => {
    const injectedFn = inject(
      null,
      () => 'arg0',
      function (this: any, arg0: string) {
        log.push(this, arg0, 'invoked');
        return 'return value';
      }
    );
    expect(await injector.invoke(injectedFn)).to.equal('return value');
    expect(log).to.eql([null, 'arg0', 'invoked']);
  });

  it('should inject async', async () => {
    const injectedFn = inject(
      null,
      () => Promise.resolve('value'),
      function (value) {
        log.push(value, 'invoked');
        return Promise.resolve('return value');
      }
    );
    expect(await injector.invoke(injectedFn)).to.equal('return value');
    expect(log).to.eql(['value', 'invoked']);
  });
});

describe('injectEventHandler', async () => {
  const log: any[] = [];
  beforeEach(() => (log.length = 0));

  it('should inject this', async () => {
    const injectedFn = injectEventHandler(
      () => 'self',
      function (this: string) {
        log.push(this, 'invoked');
        return 'return value';
      }
    );
    const event: Event = 'EVENT' as any;
    const element: HTMLElement = 'ELEMENT' as any;
    const url: URL = new URL('file:///somepath');
    expect(injectedFn(element, event, url)).to.equal(false);
    await 0; // needed for promises to resolve
    await 0;
    expect(log).to.eql(['self', 'invoked']);
  });
});
