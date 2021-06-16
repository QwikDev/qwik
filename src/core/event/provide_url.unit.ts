/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { expect } from 'chai';
import { ElementFixture } from '../testing/element_fixture.js';
import { EventInjector } from './event_injector.js';
import { provideURL, provideUrlProp } from './provide_url.js';

describe('provideURL', () => {
  let fixture: ElementFixture;
  let event: Event;
  let url: URL;
  let eventInjector: EventInjector;
  beforeEach(() => {
    fixture = new ElementFixture();
    event = {} as Event;
    url = new URL('http://localhost/path#?a=b&c=d');
    eventInjector = new EventInjector(fixture.host, event, url);
  });

  it('should return url', async () => {
    expect(await provideURL()(eventInjector)).to.equal(url);
  });

  it('should return url property', async () => {
    expect(await provideUrlProp('a')(eventInjector)).to.equal('b');
    expect(await provideUrlProp('c')(eventInjector)).to.equal('d');
  });
});
