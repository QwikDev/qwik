/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import '../CONFIG.js';
import { ElementFixture } from '../testing/element_fixture.js';
import { emitEvent } from './emit_event.js';
import { injectEventHandler } from './inject_event_handler.js';
import { provideElement } from './provide_element.js';
import { provideEvent } from './provide_event.js';
import { provideURL } from './provide_url.js';
import { EventHandler } from './types';
import { expect } from 'chai';

describe('emitEvent', () => {
  let fixture: ElementFixture;
  let event: Event;
  beforeEach(() => {
    fixture = new ElementFixture();
    event = {} as any;
  });

  it('should have the right calling signature', () => {
    const eventHandler: EventHandler<any, any, any> = emitEvent as typeof emitEvent & {
      $delegate: any;
    };
    expect(eventHandler).to.equal(emitEvent);
  });

  it('should re-emit an event', async () => {
    const url = new URL('http://localhost/path#emitEvent?$type=openMe&someKey=someValue');
    fixture.parent.setAttribute('on:open-me', 'test:event/emit_event.unit#echo?key=value');
    const retValue = await emitEvent(fixture.host, event, url);
    expect(retValue.element).to.eql(fixture.parent);
    expect(String(retValue.url)).to.contains('event/emit_event.unit#echo?key=value');
    expect(retValue.event.type).to.eql('openMe');
    expect(retValue.event.someKey).to.eql('someValue');
  });

  describe('error handling', () => {
    it('should throw if missing $type', () => {
      const url = new URL('http://localhost/path');
      const event: Event = 'event' as any;
      expect(() => emitEvent(fixture.host, event, url)).to.throw(
        "EVENT-ERROR(Q-700): Missing '$type' attribute in the 'http://localhost/path' url."
      );
    });
    it('should throw if no listener', () => {
      const url = new URL('http://localhost/path#?$type=dontexist');
      const event: Event = 'event' as any;
      expect(() => emitEvent(fixture.host, event, url)).to.throw(
        "EVENT-ERROR(Q-701): Re-emitting event 'on:dontexist' but no listener found at '<host>' or any of its parents."
      );
    });
  });
});

export const echo = injectEventHandler(
  null,
  provideElement(),
  provideURL(),
  provideEvent(),
  function (element: Element, url: URL, event: Event) {
    return { element, url, event };
  }
);
