/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { ElementFixture } from '@builder.io/qwik/testing';
import { EventInjector } from './event_injector';
import { provideEvent } from './provide_event';

describe('provideEvent', () => {
  let fixture: ElementFixture;
  let event: Event;
  let url: URL;
  let eventInjector: EventInjector;
  beforeEach(() => {
    fixture = new ElementFixture();
    event = {} as Event;
    url = new URL('http://localhost/path?a=b&c=d');
    eventInjector = new EventInjector(fixture.host, event, url);
  });

  it('should return url', async () => {
    expect(await provideEvent()(eventInjector)).toEqual(event);
  });
});
