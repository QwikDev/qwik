/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { resolveArgs } from './resolve_args';
import type { Injector } from './types';

describe('resolveArgs', () => {
  it('should return values', async () => {
    const injector = null!; // not needed because no providers requested.
    expect(await resolveArgs(injector, 1, 2)).toEqual([1, 2]);
  });
  it('should resolve promise values', async () => {
    const injector = {}! as any as Injector; // not needed because no providers requested.
    expect(
      await resolveArgs(injector, 1, (injector: Injector) => Promise.resolve(injector))
    ).toEqual([1, injector]);
  });
});
