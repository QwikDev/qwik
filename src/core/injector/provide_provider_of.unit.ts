/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { provideProviderOf } from './provide_provider_of';
import type { Injector } from './types';

describe('provideProviderOf', () => {
  it('should Provider', async () => {
    const injector: Injector = {} as any;
    const obj = {};
    const objProvider = await provideProviderOf((injector: Injector) => [injector, obj])(injector);
    expect(await objProvider()).toEqual([injector, obj]);
  });
});
