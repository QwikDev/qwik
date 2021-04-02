/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { expect } from 'chai';
import { GreeterComponent, PersonService } from '../../testing/component_fixture.js';
import { stringifyDebug } from '../../error/stringify.js';
import { MockRequestAnimationFrame } from '../../testing/node_utils.js';
import { AttributeMarker } from '../../util/markers.js';
import { markDirty, scheduleRender } from './mark_dirty.js';
import { ElementFixture } from '../../testing/element_fixture.js';

describe('mark_dirty', () => {
  let host: HTMLElement;
  let window: Window;
  let document: Document;
  let fixture: ElementFixture;
  let greeterComponent: GreeterComponent;
  beforeEach(async () => {
    fixture = new ElementFixture();
    host = fixture.host;
    document = host.ownerDocument;
    window = document.defaultView!;
    greeterComponent = await GreeterComponent.$new(fixture.host);
  });

  describe('markComponentDirty', () => {
    it('should schedule rAF and return list of components', async () => {
      const elementsPromise = markDirty(greeterComponent);
      (window.requestAnimationFrame as MockRequestAnimationFrame).flush();
      expect(stringifyDebug(await elementsPromise)).to.eql(stringifyDebug([fixture.host]));
    });
  });

  describe('markServiceDirty', () => {
    it('should mark component bound to service as dirty', async () => {
      const personService = await PersonService.$hydrate(fixture.parent, {
        first: 'First',
        last: 'Last',
      });
      expect(personService.$key).to.equal('person:-last:-first');
      fixture.host.setAttribute(AttributeMarker.BindPrefix + personService.$key, 'personKey');
      markDirty(personService);

      fixture.host.innerHTML = '';
      expect(fixture.host.innerHTML).to.equal('');
      fixture.host.setAttribute('salutation', 'Hello');
      fixture.host.setAttribute('name', 'World');
      const elementsPromise = markDirty(greeterComponent);
      (window.requestAnimationFrame as MockRequestAnimationFrame).flush();
      expect(stringifyDebug(await elementsPromise)).to.eql(stringifyDebug([fixture.host]));
      expect(fixture.host.innerHTML).to.equal('<span>Hello World!</span>');
    });
  });

  describe('scheduleRender', () => {
    it('should schedule rAF and return empty list of no render', async () => {
      const elementsPromise = scheduleRender(document);
      (window.requestAnimationFrame as MockRequestAnimationFrame).flush();
      expect(await elementsPromise).to.eql([]);
    });
    it('should schedule rAF and return list of components', async () => {
      const elementsPromise = scheduleRender(document);
      fixture.host.setAttribute(AttributeMarker.EventRender, '');
      (window.requestAnimationFrame as MockRequestAnimationFrame).flush();
      expect(stringifyDebug(await elementsPromise)).to.eql(stringifyDebug([fixture.host]));
    });
  });
  describe('error', () => {
    beforeEach(() => {
      window.requestAnimationFrame = null!;
    });
    it('should throw error if neither Component nor Service', () => {
      expect(() => markDirty({ mark: 'other' } as any)).to.throw(
        `RENDER-ERROR(Q-604): Expecting Service or Component got '{"mark":"other"}'.`
      );
    });
    it('should throw error rAF is not available (server)', () => {
      expect(() => scheduleRender(document)).to.throw(
        "RENDER-ERROR(Q-605): 'requestAnimationFrame' not found. If you are running on server design your applications in a way which does not require 'requestAnimationFrame' on first render."
      );
    });
  });
});
