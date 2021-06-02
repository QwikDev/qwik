/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { expect } from 'chai';
import { assertDefined } from '../assert/assert.js';
import '../CONFIG.js';
import { stringifyDebug } from '../error/stringify.js';
import { QRL } from '../import/qrl.js';
import { getInjector } from '../injector/element_injector.js';
import { injectMethod } from '../injector/inject.js';
import { serializeState } from '../render/serialize_state.js';
import { ElementFixture } from '../testing/element_fixture.js';
import { Entity, EntityConstructor } from './entity.js';
import { EntityKey } from './entity_key.js';

export const __verify_Entity_subtype_of_EntityType__: EntityConstructor<any> = Entity;
const entity: Entity<any, any> = null!;
export const __verify_Entity_subtype_of_Entity__: Entity<any, any> = entity;

describe('entity', () => {
  const greeterHelloWorldKey: EntityKey<GreeterEntity> = 'greeter:-hello:-world' as any;
  const greeterAhojSvetKey: EntityKey<GreeterEntity> = 'greeter:ahoj:svet' as any;
  const MissingNameEntity: EntityConstructor<any> = class MissingNameEntity {} as any;
  const EmptyNameEntity: EntityConstructor<any> = class EmptyNameEntity {
    static $type = '';
  } as any;
  const MissingKeyPropsEntity: EntityConstructor<any> = class MissingKeyPropsEntity {
    static $type = 'missingEntity';
  } as any;

  describe('$attachEntity', () => {
    it('should attach', () => {
      const fixture = new ElementFixture();
      GreeterEntity.$attachEntity(fixture.host);
      expect(stringifyDebug(fixture.host)).to.eql(
        `<host ::greeter='entity:/entity.unit#GreeterEntity'>`
      );
    });

    it('should allow second attach', () => {
      const fixture = new ElementFixture();
      GreeterEntity.$attachEntity(fixture.host);
      GreeterEntity.$attachEntity(fixture.host);
      expect(stringifyDebug(fixture.host)).to.eql(
        `<host ::greeter='entity:/entity.unit#GreeterEntity'>`
      );
    });

    it('should error', () => {
      expect(() => Entity.$attachEntity.apply(MissingNameEntity as any, null!)).to.throw(
        `SERVICE-ERROR(Q-310): Entity 'MissingNameEntity' must have static '$type' property defining the name of the entity.`
      );
      expect(() => Entity.$attachEntity.apply(EmptyNameEntity as any, null!)).to.throw(
        `SERVICE-ERROR(Q-310): Entity 'EmptyNameEntity' must have static '$type' property defining the name of the entity.`
      );
      expect(() => Entity.$attachEntity.apply(MissingKeyPropsEntity as any, null!)).to.throw(
        `SERVICE-ERROR(Q-312): Entity 'MissingKeyPropsEntity' must have static '$qrl' property defining the import location of the entity.`
      );
    });
    it('should error on QRL collision', () => {
      const fixture = new ElementFixture();
      fixture.host.setAttribute('::greeter', 'some_other_qrl');
      expect(() => GreeterEntity.$attachEntity(fixture.host)).to.throw(
        `SERVICE-ERROR(Q-313): Name collision. Already have entity named 'Greeter' with QRL 'some_other_qrl' but expected QRL 'entity:/entity.unit#GreeterEntity'.`
      );
    });
  });

  describe('$attachEntityState', () => {
    it('should attach', () => {
      const fixture = new ElementFixture();
      GreeterEntity.$attachEntityState(
        fixture.host,
        { salutation: 'hello', name: 'world' },
        { greeting: 'Hello World!' }
      );
      GreeterEntity.$attachEntityState(
        fixture.host,
        { salutation: 'ahoj', name: 'svet' },
        { greeting: 'Ahoj Svet!' }
      );
      expect(stringifyDebug(fixture.host)).to.eql(
        `<host ::greeter='entity:/entity.unit#GreeterEntity' ` +
          `greeter:ahoj:svet='{"greeting":"Ahoj Svet!"}' ` +
          `greeter:hello:world='{"greeting":"Hello World!"}'>`
      );
    });
  });

  describe('$hydrate', () => {
    it('should hydrate with state', async () => {
      const fixture = new ElementFixture();
      const greeterPromise = GreeterEntity.$hydrate(
        fixture.host,
        { salutation: 'Hello', name: 'World' },
        { greeting: 'existing state' }
      );
      expect(greeterPromise.$key).to.eql('greeter:-hello:-world');
      const greeter = await greeterPromise;
      expect(greeter.$state).to.eql({ $key: 'greeter:-hello:-world', greeting: 'existing state' });
      expect(stringifyDebug(fixture.host)).to.eql(
        `<host : ::greeter='entity:/entity.unit#GreeterEntity' greeter:-hello:-world>`
      );
    });
    it('should hydrate without state', async () => {
      const fixture = new ElementFixture();
      const greeterPromise = GreeterEntity.$hydrate(fixture.host, {
        salutation: 'Hello',
        name: 'World',
      });
      expect(greeterPromise.$key).to.eql('greeter:-hello:-world');
      const greeter = await greeterPromise;
      expect(greeter.$state).to.eql({
        $key: 'greeter:-hello:-world',
        greeting: 'INIT: Hello World!',
      });
      expect(stringifyDebug(fixture.host)).to.eql(
        `<host : ::greeter='entity:/entity.unit#GreeterEntity' greeter:-hello:-world>`
      );
    });
    it('should hydrate into the same instance', async () => {
      const fixture = new ElementFixture();
      const greeterPromise = GreeterEntity.$hydrate(fixture.host, {
        salutation: 'Hello',
        name: 'World',
      });
      expect(greeterPromise).to.equal(GreeterEntity.$hydrate(fixture.host, greeterHelloWorldKey));
      expect(await greeterPromise).to.equal(
        await GreeterEntity.$hydrate(fixture.host, greeterHelloWorldKey)
      );
    });
    it('should hydrate without state using key', async () => {
      const fixture = new ElementFixture();
      const greeterPromise = GreeterEntity.$hydrate(fixture.host, greeterHelloWorldKey);
      expect(greeterPromise.$key).to.eql('greeter:-hello:-world');
      const greeter = await greeterPromise;
      expect(greeter.$state).to.eql({
        $key: 'greeter:-hello:-world',
        greeting: 'INIT: Hello World!',
      });
      expect(stringifyDebug(fixture.host)).to.eql(
        `<host : ::greeter='entity:/entity.unit#GreeterEntity' greeter:-hello:-world>`
      );
    });
    it('should hydrate with error', async () => {
      const fixture = new ElementFixture();
      const greeterPromise = GreeterEntity.$hydrate(fixture.host, {
        salutation: 'throw',
        name: 'World',
      });
      expect(greeterPromise.$key).to.eql('greeter:throw:-world');
      try {
        await greeterPromise;
        expect('not to get here').to.be.false;
      } catch (e) {
        expect(String(e)).to.contain('Error: World');
      }
    });
    it('should deserialize entity from DOM', async () => {
      const fixture = new ElementFixture();
      GreeterEntity.$attachEntity(fixture.host);
      GreeterEntity.$attachEntityState(
        fixture.host,
        { salutation: 'ahoj', name: 'svet' },
        { greeting: 'Ahoj Svet!' }
      );
      const injector = getInjector(fixture.child);
      const greeterPromise = injector.getEntityState(greeterAhojSvetKey);
      const greeter: Greeter = await greeterPromise;
      expect(greeter).to.eql({ $key: 'greeter:ahoj:svet', greeting: 'Ahoj Svet!' });

      const entityPromise = getInjector(fixture.child).getEntity<GreeterEntity>(greeterAhojSvetKey);
      const greeterEntity = await entityPromise;
      expect(greeterEntity).to.be.instanceOf(GreeterEntity);
      expect(greeterEntity.$props).to.eql({ salutation: 'ahoj', name: 'svet' });
      expect(greeterEntity.$state).to.eql({ $key: 'greeter:ahoj:svet', greeting: 'Ahoj Svet!' });
    });
  });

  describe('invoke', () => {
    it('should create an instance and invoke identity method', async () => {
      const fixture = new ElementFixture();
      const empty = await EmptyEntity.$hydrate(fixture.child, {}, {});
      expect(await empty.ident('ABC')).to.equal('ABC');
      expect(await getInjector(fixture.child).getEntity('empty:' as any as EntityKey)).to.equal(
        empty
      );
      expect(fixture.child.getAttribute('::empty')).to.equal('entity:/entity.unit#EmptyEntity');
    });
  });

  it('should create instance greeter and persist it and delete it', async () => {
    const fixture = new ElementFixture();
    const greeterPromise = GreeterEntity.$hydrate(fixture.child, {
      salutation: 'hello',
      name: 'world',
    });
    const greeter = await greeterPromise;
    expect(greeter.$state.greeting).to.equal('INIT: hello world!');
    expect(await greeter.greet()).to.equal('hello world!');
    expect(greeter.$state.greeting).to.equal('hello world!');
    expect(stringifyDebug(greeter.$element)).to.equal(
      "<child : ::greeter='entity:/entity.unit#GreeterEntity' greeter:hello:world>"
    );
    expect(
      await getInjector(fixture.child).getEntity(
        'greeter:hello:world' as any as EntityKey<GreeterEntity>
      )
    ).to.equal(greeter);

    serializeState(fixture.host);
    expect(stringifyDebug(greeter.$element)).to.equal(
      `<child : ::greeter='entity:/entity.unit#GreeterEntity' greeter:hello:world='{"greeting":"hello world!"}'>`
    );

    greeter.$release();
    expect(stringifyDebug(greeter.$element)).to.equal(
      `<child : ::greeter='entity:/entity.unit#GreeterEntity'>`
    );
  });
});

/////////////////////////////////////////////////////////////////////////////////////

interface EmptyProps {
  id?: null;
}
interface Empty {}

export class EmptyEntity extends Entity<EmptyProps, Empty> {
  static $type: 'Empty' = 'Empty';
  static $qrl = QRL<EmptyEntity>`entity:/entity.unit#EmptyEntity`;
  static $keyProps = ['id'];
  async ident(value: string): Promise<string> {
    return this.$invokeQRL(QRL<(value: string) => string>`entity:/entity.unit#ident`, value);
  }
}

export function ident<T>(value: T): T {
  return value;
}

/////////////////////////////////////////////////////////////////////////////////////
interface GreeterProps {
  salutation: string;
  name: string;
}
interface Greeter {
  greeting: string;
}

export class GreeterEntity extends Entity<GreeterProps, Greeter> {
  static $type: 'Greeter' = 'Greeter';
  static $qrl = QRL<GreeterEntity>`entity:/entity.unit#GreeterEntity`;
  static $keyProps = ['salutation', 'name'];

  async $newState($keyProps: GreeterProps): Promise<Greeter> {
    if ($keyProps.salutation == 'throw') {
      throw new Error($keyProps.name);
    }
    return { greeting: `INIT: ${$keyProps.salutation} ${$keyProps.name}!` };
  }
  async greet(): Promise<string> {
    return this.$invokeQRL(QRL<() => string>`entity:/entity.unit#greet`);
  }
}

export const greet = injectMethod(GreeterEntity, function (this: GreeterEntity) {
  assertDefined(this);
  assertDefined(this.$props);
  assertDefined(this.$state);
  return (this.$state.greeting = this.$props.salutation + ' ' + this.$props.name + '!');
});

/////////////////////////////////////////////////////////////////////////////////////
