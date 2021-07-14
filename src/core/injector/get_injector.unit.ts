/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { ElementFixture } from '@builder.io/qwik/testing';
import { getInjector } from './element_injector';

describe('getInjector', () => {
  let fixture: ElementFixture;
  beforeEach(() => (fixture = new ElementFixture()));
  it('should throw if element not passed in', () => {
    expect(() => getInjector(null!)).toThrow(
      "INJECTOR-ERROR(Q-202): Expected 'Element' was 'null'."
    );
  });
  it('should return no injector', () => {
    const hostInjector = getInjector(fixture.host, false);
    expect(hostInjector).toEqual(null);
  });
  it('should create injector', () => {
    const injector = getInjector(fixture.host);
    expect(injector.element).toEqual(fixture.host);
    expect(fixture.host.getAttribute(':')).toEqual('');
  });
});
