/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { expect } from 'chai';
import '../CONFIG.js';
import { provideInjector } from './provide_injector.js';
import { Injector } from './types.js';

describe('provideInjector', () => {
  it('should return an injector', async () => {
    const injector: Injector = {} as any;
    expect(await provideInjector()(injector)).to.equal(injector);
  });
});
