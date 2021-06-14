/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { expect } from 'chai';
import '../testing/node_utils.js';
import { resolveArgs } from './resolve_args.js';
import type { Injector } from './types.js';

describe('resolveArgs', () => {
  it('should return values', async () => {
    const injector = null!; // not needed because no providers requested.
    expect(await resolveArgs(injector, 1, 2)).to.eql([1, 2]);
  });
  it('should resolve promise values', async () => {
    const injector = {}! as any as Injector; // not needed because no providers requested.
    expect(
      await resolveArgs(injector, 1, (injector: Injector) => Promise.resolve(injector))
    ).to.eql([1, injector]);
  });
});
