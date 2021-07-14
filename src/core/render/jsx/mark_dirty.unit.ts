/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { stringifyDebug } from '../../error/stringify';
import { GreeterComponent, PersonEntity } from '../../util/test_component_fixture';
import { ElementFixture, MockDocument, getTestPlatform } from '@builder.io/qwik/testing';
import { AttributeMarker } from '../../util/markers';
import { markDirty, markEntityDirty, scheduleRender, toAttrQuery } from './mark_dirty';

describe('mark_dirty', () => {
  let host: HTMLElement;
  let doc: MockDocument;
  let fixture: ElementFixture;
  let greeterComponent: GreeterComponent;
  beforeEach(async () => {
    fixture = new ElementFixture();
    host = fixture.host;
    doc = fixture.document;
    greeterComponent = await GreeterComponent.$new(fixture.host);
  });

  describe('markComponentDirty', () => {
    it('should schedule render and return list of components', async () => {
      const elementsPromise = markDirty(greeterComponent);
      await getTestPlatform(doc).flush();
      expect(stringifyDebug(await elementsPromise)).toEqual(stringifyDebug([fixture.host]));
    });
  });

  describe('markServiceDirty', () => {
    it('should mark component bound to entity as dirty', async () => {
      const personService = await PersonEntity.$hydrate(fixture.parent, {
        first: 'First',
        last: 'Last',
      });
      expect(personService.$key).toEqual('person:-last:-first');
      fixture.host.setAttribute(AttributeMarker.BindPrefix + personService.$key, 'personKey');
      markDirty(personService);

      fixture.host.innerHTML = '';
      expect(fixture.host.innerHTML).toEqual('');
      fixture.host.setAttribute('salutation', 'Hello');
      fixture.host.setAttribute('name', 'World');
      const elementsPromise = markDirty(greeterComponent);
      await getTestPlatform(doc).flush();
      expect(stringifyDebug(await elementsPromise)).toEqual(stringifyDebug([fixture.host]));
      expect(fixture.host.innerHTML).toEqual('<span>Hello World!</span>');
    });
  });

  describe('toAttrQuery', () => {
    it('should escape attrs', () => {
      expect(toAttrQuery('a:b:123')).toEqual('[a\\:b\\:123]');
    });
  });

  describe('scheduleRender', () => {
    it('should schedule render and return empty list of no render', async () => {
      const elementsPromise = scheduleRender(doc);
      await getTestPlatform(doc).flush();
      expect(await elementsPromise).toEqual([]);
    });
    it('should schedule render and return list of components', async () => {
      const elementsPromise = scheduleRender(doc);
      fixture.host.setAttribute(AttributeMarker.EventRender, '');
      await getTestPlatform(doc).flush();
      expect(stringifyDebug(await elementsPromise)).toEqual(stringifyDebug([fixture.host]));
    });
  });
  describe('error', () => {
    it('should throw error if neither Component nor Entity', () => {
      expect(() => markDirty({ mark: 'other' } as any)).toThrow(
        `RENDER-ERROR(Q-604): Expecting Entity or Component got '{"mark":"other"}'.`
      );
    });
    it('should throw an error if bind:_ is not on a component', async () => {
      const personService = await PersonEntity.$hydrate(fixture.parent, {
        first: 'First',
        last: 'Last',
      });
      host.setAttribute(AttributeMarker.BindPrefix + personService.$key, '$person');
      host.removeAttribute(AttributeMarker.ComponentTemplate);
      expect(() => markEntityDirty(personService)).toThrow(
        `RENDER-ERROR(Q-605): Expecting that element with 'bind:person:-last:-first' should be a component (should have 'decl:template="qrl"' attribute): <host : bind:person:-last:-first='$person'>`
      );
    });
  });
});
