/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { Component } from '../component/index';
import type { QRL } from '../import/qrl';
import { ElementFixture } from '@builder.io/qwik/testing';
import { AttributeMarker } from '../util/markers';
import { EventEntity } from './event_entity';
import type { EventInjector } from './event_injector';
import { injectEventHandler } from './inject_event_handler';

describe('injectEventHandler', () => {
  let fixture: ElementFixture;
  beforeEach(() => (fixture = new ElementFixture()));

  it('should support component injection', async () => {
    const event = 'EVENT' as any as Event;
    const url = new URL('http://localhost/path?a=b&c=d');
    fixture.host.setAttribute(AttributeMarker.ComponentTemplate, String(MyComponentTemplate));

    const fn = injectEventHandler(
      MyComponent,
      async (injector: EventInjector) => {
        const eventEntity = await injector.getEntity(EventEntity.KEY);
        expect(injector.element).toEqual(fixture.host);
        expect(eventEntity.event).toEqual(event);
        expect(eventEntity.url).toEqual(url);
        return 'providerValue';
      },
      function (this: MyComponent, arg0: string) {
        expect(this.$host).toEqual(fixture.host);
        expect(arg0).toEqual('providerValue');
        return 'handlerValue';
      }
    );
    expect(await fn(fixture.host, event, url)).toEqual('handlerValue');
  });
});

const MyComponentTemplate: QRL = 'myComponentQRL' as any;
class MyComponent extends Component<any, any> {
  $newState() {
    return {};
  }
}
