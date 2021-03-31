/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { expect } from 'chai';
import { ElementFixture } from '../testing/element_fixture.js';
import '../util/qDev.js';
import { getInjector } from './element_injector.js';

describe('getInjector', () => {
  let fixture: ElementFixture;
  beforeEach(() => (fixture = new ElementFixture()));
  it('should throw if element not passed in', () => {
    expect(() => getInjector(null!)).to.throw(
      "INJECTOR-ERROR(Q-202): Expected 'Element' was 'null'."
    );
  });
  it('should return no injector', () => {
    const hostInjector = getInjector(fixture.host, false);
    expect(hostInjector).to.equal(null);
  });
  it('should create injector', () => {
    const injector = getInjector(fixture.host);
    expect(injector.element).to.equal(fixture.host);
    expect(fixture.host.getAttribute(':')).to.eql('');
  });
});
