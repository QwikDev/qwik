/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { expect } from 'chai';
import { ElementInjector } from '../injector/element_injector.js';
import { ElementFixture } from '../testing/element_fixture.js';
import { EventInjector } from './event_injector.js';
import { EventInjector as IEventInjector } from './types.js';

describe('EventInjector', () => {
  let fixture: ElementFixture;
  beforeEach(() => (fixture = new ElementFixture()));

  it('should ensure that invoking a provider on ElementInjector throws', () => {
    const elementInjector: ElementInjector = new ElementInjector(fixture.host);
    const eventInjector: IEventInjector = elementInjector;
    const error =
      "Injector is being used as 'EventInjector' but it was 'ElementInjector'. Have you used a provider which expects 'EventInjector' in 'ElementInjector' context?";
    expect(() => eventInjector.event).to.throw(error);
    expect(() => eventInjector.url).to.throw(error);
    expect(() => eventInjector.props).to.throw(error);
  });

  it('should parse URL', () => {
    const event = ('EVENT' as any) as Event;
    const url = new URL('http://localhost/path?a=b&c=d');
    const eventInjector = new EventInjector(fixture.host, event, url);
    expect(eventInjector.event).to.equal(event);
    expect(eventInjector.url).to.equal(url);
    expect(eventInjector.props).to.eql({ a: 'b', c: 'd' });
  });
});
