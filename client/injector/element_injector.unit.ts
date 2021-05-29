/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { expect } from 'chai';
import { GreeterComponent, Greeter, GreeterProps } from '../testing/component_fixture.js';
import { Component } from '../component/component.js';
import '../CONFIG.js';
import { stringifyDebug } from '../error/stringify.js';
import { QRL } from '../import/index.js';
import { Injector, Entity } from '../index.js';
import { serializeState } from '../render/serialize_state.js';
import { ElementFixture } from '../testing/element_fixture.js';
import { AttributeMarker } from '../util/markers.js';
import { getClosestInjector, getInjector } from './element_injector.js';
import { EntityKey } from '../entity/entity_key.js';

describe('ElementInjector', () => {
  let fixture: ElementFixture;
  let hostInjector: Injector;
  beforeEach(() => {
    fixture = new ElementFixture();
    hostInjector = getInjector(fixture.host);
  });

  describe('getComponent', () => {
    it('should materialize component and return same instance', async () => {
      fixture.host.setAttribute(
        AttributeMarker.ComponentTemplate,
        GreeterComponent.$templateQRL as any
      );
      const component = await hostInjector.getComponent(GreeterComponent);
      expect(component).to.be.an.instanceOf(GreeterComponent);
      expect(stringifyDebug(component.$host)).to.be.equal(stringifyDebug(fixture.host));

      const component2 = await hostInjector.getComponent(GreeterComponent);
      expect(component).to.eql(component2);
    });
    it('should walk up the tree and find materialize component', async () => {
      fixture.superParent.setAttribute(
        AttributeMarker.ComponentTemplate,
        GreeterComponent.$templateQRL as any
      );
      const component = await hostInjector.getComponent(GreeterComponent);
      expect(component).to.be.an.instanceOf(GreeterComponent);
      expect(stringifyDebug(component.$host)).to.be.equal(stringifyDebug(fixture.superParent));
    });
    it('should return the same promise instance', () => {
      fixture.superParent.setAttribute(
        AttributeMarker.ComponentTemplate,
        GreeterComponent.$templateQRL as any
      );
      const component1 = hostInjector.getComponent(GreeterComponent);
      const component2 = hostInjector.getComponent(GreeterComponent);
      expect(component1).to.equal(component2);
    });
    describe('state', () => {
      it('should materialize from attribute state', async () => {
        fixture.host.setAttribute(
          AttributeMarker.ComponentTemplate,
          GreeterComponent.$templateQRL as any
        );
        fixture.host.setAttribute(
          AttributeMarker.ComponentState,
          JSON.stringify({ greeting: 'abc' })
        );
        const component = await hostInjector.getComponent(GreeterComponent);
        expect(component.$state).to.eql({ greeting: 'abc' });
        expect(component.greeting).to.equal('abc');
      });
      it('should materialize from $newState', async () => {
        fixture.host.setAttribute(
          AttributeMarker.ComponentTemplate,
          GreeterComponent.$templateQRL as any
        );
        fixture.host.setAttribute('salutation', 'Hello');
        fixture.host.setAttribute('name', 'World');
        const component = await hostInjector.getComponent(GreeterComponent);
        expect(component.$props).to.eql({ salutation: 'Hello', name: 'World' });
        expect(component.$state).to.eql({ greeting: 'Hello World!' });
        expect(component.greeting).to.equal('Hello World!');
      });
      it('should save state to attribute state', async () => {
        fixture.host.setAttribute(
          AttributeMarker.ComponentTemplate,
          GreeterComponent.$templateQRL as any
        );
        const component = await hostInjector.getComponent(GreeterComponent);
        component.$state = { greeting: 'save me' };
        serializeState(fixture.superParent);
        expect(fixture.host.getAttribute(AttributeMarker.ComponentState)).to.eql(
          JSON.stringify({ greeting: 'save me' })
        );
      });
    });
    describe('error', () => {
      it('should throw if component does not match', async () => {
        fixture.parent.setAttribute(AttributeMarker.ComponentTemplate, 'wrongQRL');
        expect(() => hostInjector.getComponent(GreeterComponent)).to.throw(
          "COMPONENT-ERROR(Q-405): Unable to find 'GreeterComponent' component."
        );
      });
      it('should throw if two components have same $templateQRLs', async () => {
        fixture.superParent.setAttribute(
          AttributeMarker.ComponentTemplate,
          GreeterComponent.$templateQRL as any
        );
        await hostInjector.getComponent(GreeterComponent);
        expect(() => hostInjector.getComponent(GreeterShadowComponent)).to.throw(
          "COMPONENT-ERROR(Q-406): Requesting component 'GreeterShadowComponent' does not match existing component 'GreeterComponent'. Verify that the two components have distinct '$templateQRL's."
        );
      });
      it('should throw if two components is missing $templateQRL', async () => {
        class MissingQRL {}
        expect(() => hostInjector.getComponent(MissingQRL as any)).to.throw(
          "COMPONENT-ERROR(Q-407): Expecting Component 'MissingQRL' to have static '$templateQRL' property, but none was found."
        );
      });
    });
  });

  describe('getEntity/getEntityState', () => {
    const regardsKey: EntityKey<RegardsEntity> = 'regards:-hello:-world' as any;
    it('should retrieve entity by key from DOM', async () => {
      fixture.host.setAttribute(
        'regards:-hello:-world',
        JSON.stringify({ greeting: 'serialized' })
      );
      expect(await hostInjector.getEntityState('regards:-hello:-world')).to.eql({
        $key: 'regards:-hello:-world',
        greeting: 'serialized',
      });
      // Add this late to demonstrate that the `getEntityState` was able to retrieve the state
      // without the entity QRL.
      RegardsEntity.$attachEntity(fixture.host);
      const entity = await hostInjector.getEntity(regardsKey);
      expect(entity.$key).to.eql('regards:-hello:-world');
      expect(entity.$props).to.eql({ salutation: 'Hello', name: 'World' });
      expect(entity.$state).to.eql({
        $key: 'regards:-hello:-world',
        greeting: 'serialized',
      });
      expect(entity.greeting).to.equal('serialized');
    });
    it('should retrieve entity by key from parent element', async () => {
      fixture.parent.setAttribute(
        'regards:-hello:-world',
        JSON.stringify({ greeting: 'serialized' })
      );
      expect(await hostInjector.getEntityState('regards:-hello:-world')).to.eql({
        $key: 'regards:-hello:-world',
        greeting: 'serialized',
      });
      // Add this late to demonstrate that the `getEntityState` was able to retrieve the state
      // without the entity QRL.
      RegardsEntity.$attachEntity(fixture.parent);
      const entity = await hostInjector.getEntity(regardsKey);
      expect(entity.$key).to.eql('regards:-hello:-world');
      expect(entity.$props).to.eql({ salutation: 'Hello', name: 'World' });
      expect(entity.$state).to.eql({
        $key: 'regards:-hello:-world',
        greeting: 'serialized',
      });
    });
    it('should retrieve entity by key and call $newState', async () => {
      RegardsEntity.$attachEntity(fixture.parent);
      const entity = await hostInjector.getEntity(regardsKey);
      expect(entity.$key).to.eql('regards:-hello:-world');
      expect(entity.$props).to.eql({ salutation: 'Hello', name: 'World' });
      expect(entity.$state).to.eql({
        $key: 'regards:-hello:-world',
        greeting: 'Hello World!',
      });
    });
    it('should retrieve the same instance of entity', async () => {
      RegardsEntity.$attachEntity(fixture.parent);
      const entity1 = hostInjector.getEntity(regardsKey);
      const entity2 = hostInjector.getEntity(regardsKey);
      expect(entity1).to.equal(entity2);
    });
    it('should retrieve the same instance of entity state', async () => {
      const state = { greeting: 'saved greeting' };
      const key = RegardsEntity.$hydrate(
        fixture.host,
        { salutation: 'Hello', name: 'World' },
        state
      ).$key;
      expect(fixture.host.hasAttribute(String(key))).to.be.true;
      const entityState = await hostInjector.getEntityState(key);
      expect(entityState).to.equal(state);
    });
    describe('error', () => {
      it('should throw error if no state define', () => {
        expect(() => hostInjector.getEntityState('not:found')).to.throw(
          "ERROR(Q-004): Could not find entity state 'not:found' ( or entity provider '::not') at '<host :>' or any of it's parents."
        );
      });
      it('should throw error if entity state was not serialized', async () => {
        fixture.host.setAttribute('entity:1', '');
        expect(() => hostInjector.getEntityState('entity:1')).to.throw(
          "INJECTOR-ERROR(Q-204): Entity key 'entity:1' is found on '<host : entity:1>' but does not contain state. Was 'serializeState()' not run during dehydration?"
        );
      });
      it('should throw error if no entity provider define', () => {
        expect(() => hostInjector.getEntity('not:found' as any as EntityKey)).to.throw(
          "ERROR(Q-004): Could not find entity state 'not:found' ( or entity provider '::not') at '<host :>' or any of it's parents."
        );
      });
    });
  });

  describe('getClosestInjector', () => {
    describe('error', () => {
      it('should throw when no parent injector fond', () => {
        expect(() => getClosestInjector(fixture.parent)).to.throw(
          "INJECTOR-ERROR(Q-206): No injector can be found starting at '<parent>'."
        );
      });
    });
  });
});

class GreeterShadowComponent extends Component<GreeterProps, Greeter> {
  static $templateQRL: QRL = GreeterComponent.$templateQRL;
}

interface RegardsProps {
  salutation: string;
  name: string;
}
interface Regards {
  greeting: string;
}

export class RegardsEntity extends Entity<RegardsProps, Regards> {
  static $type = 'regards';
  static $qrl = QRL`injection:/element_injector.unit#RegardsEntity`;
  static $keyProps = ['salutation', 'name'];

  greeting: string = null!;

  async $init() {
    this.greeting = this.$state.greeting;
  }

  async $newState(state: RegardsProps) {
    return { greeting: state.salutation + ' ' + state.name + '!' };
  }
}
