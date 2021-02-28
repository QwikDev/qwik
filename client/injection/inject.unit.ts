/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { expect } from 'chai';
import { inject } from './inject.js';
import { InjectionContext } from './types.js';

describe('inject', () => {
  const log: string[] = [];
  const context: InjectionContext = {
    url: null!,
    element: null!,
    event: null!,
  };
  beforeEach(() => {
    log.length = 0;
    context.url = null!;
    context.element = null!;
    context.event = null!;
  });

  it('should inject nothing', () => {
    const injectedFn = inject(null, () => log.push('invoked'));
    injectedFn.apply(context);
    expect(log).to.eql(['invoked']);
  });

  it('should inject this', () => {
    const injectedFn = inject(
      () => 'self',
      function (this: string) {
        log.push(this, 'invoked');
        return 'return value';
      }
    );
    expect(injectedFn.apply(context)).to.equal('return value');
    expect(log).to.eql(['self', 'invoked']);
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
    expect(await injectedFn.apply(context)).to.equal('return value');
    expect(log).to.eql(['value', 'invoked']);
  });
});
