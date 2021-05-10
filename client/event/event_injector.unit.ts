/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { expect } from 'chai';
import { ElementFixture } from '../testing/element_fixture.js';
import { EventInjector } from './event_injector.js';
import { EventService } from './event_service.js';

describe('EventInjector', () => {
  let fixture: ElementFixture;
  beforeEach(() => (fixture = new ElementFixture()));

  it('should parse URL', async () => {
    const event = 'EVENT' as any as Event;
    const url = new URL('http://localhost/path?a=b&c=d');
    const eventInjector = new EventInjector(fixture.host, event, url);
    const eventService = await eventInjector.getService(EventService.KEY);
    expect(eventService.event).to.equal(event);
    expect(eventService.url).to.equal(url);
    expect(eventService.props).to.eql({ a: 'b', c: 'd' });
  });
});
