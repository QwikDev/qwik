/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { ElementFixture } from '@builder.io/qwik/testing';
import { EventInjector } from './event_injector';
import { EventEntity } from './event_entity';

describe('EventInjector', () => {
  let fixture: ElementFixture;
  beforeEach(() => (fixture = new ElementFixture()));

  it('should parse URL', async () => {
    const event = 'EVENT' as any as Event;
    const url = new URL('http://localhost/path#?a=b&c=d');
    const eventInjector = new EventInjector(fixture.host, event, url);
    const eventEntity = await eventInjector.getEntity(EventEntity.KEY);
    expect(eventEntity.event).toEqual(event);
    expect(eventEntity.url).toEqual(url);
    expect(eventEntity.props).toEqual({ a: 'b', c: 'd' });
  });
});
