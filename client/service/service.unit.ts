/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
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
import { Service, ServiceConstructor } from './service.js';
import { ServiceKey } from './service_key.js';

export const __verify_Service_subtype_of_ServiceType__: ServiceConstructor<any> = Service;
const service: Service<any, any> = null!;
export const __verify_Service_subtype_of_Service__: Service<any, any> = service;

describe('service', () => {
  const greeterHelloWorldKey: ServiceKey<GreeterService> = 'greeter:-hello:-world' as any;
  const greeterAhojSvetKey: ServiceKey<GreeterService> = 'greeter:ahoj:svet' as any;
  const MissingNameService: ServiceConstructor<any> = class MissingNameService {} as any;
  const EmptyNameService: ServiceConstructor<any> = class EmptyNameService {
    static $type = '';
  } as any;
  const MissingKeyPropsService: ServiceConstructor<any> = class MissingKeyPropsService {
    static $type = 'missingService';
  } as any;

  describe('$attachService', () => {
    it('should attach', () => {
      const fixture = new ElementFixture();
      GreeterService.$attachService(fixture.host);
      expect(stringifyDebug(fixture.host)).to.eql(
        `<host ::greeter='service:/service.unit.GreeterService'>`
      );
    });

    it('should allow second attach', () => {
      const fixture = new ElementFixture();
      GreeterService.$attachService(fixture.host);
      GreeterService.$attachService(fixture.host);
      expect(stringifyDebug(fixture.host)).to.eql(
        `<host ::greeter='service:/service.unit.GreeterService'>`
      );
    });

    it('should error', () => {
      expect(() => Service.$attachService.apply(MissingNameService as any, null!)).to.throw(
        `SERVICE-ERROR(Q-310): Service 'MissingNameService' must have static '$type' property defining the name of the service.`
      );
      expect(() => Service.$attachService.apply(EmptyNameService as any, null!)).to.throw(
        `SERVICE-ERROR(Q-310): Service 'EmptyNameService' must have static '$type' property defining the name of the service.`
      );
      expect(() => Service.$attachService.apply(MissingKeyPropsService as any, null!)).to.throw(
        `SERVICE-ERROR(Q-312): Service 'MissingKeyPropsService' must have static '$qrl' property defining the import location of the service.`
      );
    });
    it('should error on QRL collision', () => {
      const fixture = new ElementFixture();
      fixture.host.setAttribute('::greeter', 'some_other_qrl');
      expect(() => GreeterService.$attachService(fixture.host)).to.throw(
        `SERVICE-ERROR(Q-313): Name collision. Already have service named 'Greeter' with QRL 'some_other_qrl' but expected QRL 'service:/service.unit.GreeterService'.`
      );
    });
  });

  describe('$attachServiceState', () => {
    it('should attach', () => {
      const fixture = new ElementFixture();
      GreeterService.$attachServiceState(
        fixture.host,
        { salutation: 'hello', name: 'world' },
        { greeting: 'Hello World!' }
      );
      GreeterService.$attachServiceState(
        fixture.host,
        { salutation: 'ahoj', name: 'svet' },
        { greeting: 'Ahoj Svet!' }
      );
      expect(stringifyDebug(fixture.host)).to.eql(
        `<host ::greeter='service:/service.unit.GreeterService' ` +
          `greeter:ahoj:svet='{"greeting":"Ahoj Svet!"}' ` +
          `greeter:hello:world='{"greeting":"Hello World!"}'>`
      );
    });
  });

  describe('$hydrate', () => {
    it('should hydrate with state', async () => {
      const fixture = new ElementFixture();
      const greeterPromise = GreeterService.$hydrate(
        fixture.host,
        { salutation: 'Hello', name: 'World' },
        { greeting: 'existing state' }
      );
      expect(greeterPromise.$key).to.eql('greeter:-hello:-world');
      const greeter = await greeterPromise;
      expect(greeter.$state).to.eql({ $key: 'greeter:-hello:-world', greeting: 'existing state' });
      expect(stringifyDebug(fixture.host)).to.eql(
        `<host : ::greeter='service:/service.unit.GreeterService' greeter:-hello:-world>`
      );
    });
    it('should hydrate without state', async () => {
      const fixture = new ElementFixture();
      const greeterPromise = GreeterService.$hydrate(fixture.host, {
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
        `<host : ::greeter='service:/service.unit.GreeterService' greeter:-hello:-world>`
      );
    });
    it('should hydrate into the same instance', async () => {
      const fixture = new ElementFixture();
      const greeterPromise = GreeterService.$hydrate(fixture.host, {
        salutation: 'Hello',
        name: 'World',
      });
      expect(greeterPromise).to.equal(GreeterService.$hydrate(fixture.host, greeterHelloWorldKey));
      expect(await greeterPromise).to.equal(
        await GreeterService.$hydrate(fixture.host, greeterHelloWorldKey)
      );
    });
    it('should hydrate without state using key', async () => {
      const fixture = new ElementFixture();
      const greeterPromise = GreeterService.$hydrate(fixture.host, greeterHelloWorldKey);
      expect(greeterPromise.$key).to.eql('greeter:-hello:-world');
      const greeter = await greeterPromise;
      expect(greeter.$state).to.eql({
        $key: 'greeter:-hello:-world',
        greeting: 'INIT: Hello World!',
      });
      expect(stringifyDebug(fixture.host)).to.eql(
        `<host : ::greeter='service:/service.unit.GreeterService' greeter:-hello:-world>`
      );
    });
    it('should hydrate with error', async () => {
      const fixture = new ElementFixture();
      const greeterPromise = GreeterService.$hydrate(fixture.host, {
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
    it('should deserialize service from DOM', async () => {
      const fixture = new ElementFixture();
      GreeterService.$attachService(fixture.host);
      GreeterService.$attachServiceState(
        fixture.host,
        { salutation: 'ahoj', name: 'svet' },
        { greeting: 'Ahoj Svet!' }
      );
      const injector = getInjector(fixture.child);
      const greeterPromise = injector.getServiceState(greeterAhojSvetKey);
      const greeter: Greeter = await greeterPromise;
      expect(greeter).to.eql({ $key: 'greeter:ahoj:svet', greeting: 'Ahoj Svet!' });

      const servicePromise = getInjector(fixture.child).getService<GreeterService>(
        greeterAhojSvetKey
      );
      const greeterService = await servicePromise;
      expect(greeterService).to.be.instanceOf(GreeterService);
      expect(greeterService.$props).to.eql({ salutation: 'ahoj', name: 'svet' });
      expect(greeterService.$state).to.eql({ $key: 'greeter:ahoj:svet', greeting: 'Ahoj Svet!' });
    });
  });

  describe('invoke', () => {
    it('should create an instance and invoke identity method', async () => {
      const fixture = new ElementFixture();
      const empty = await EmptyService.$hydrate(fixture.child, {}, {});
      expect(await empty.ident('ABC')).to.equal('ABC');
      expect(await getInjector(fixture.child).getService('empty:' as any as ServiceKey)).to.equal(
        empty
      );
      expect(fixture.child.getAttribute('::empty')).to.equal('service:/service.unit.EmptyService');
    });
  });

  it('should create instance greeter and persist it and delete it', async () => {
    const fixture = new ElementFixture();
    const greeterPromise = GreeterService.$hydrate(fixture.child, {
      salutation: 'hello',
      name: 'world',
    });
    const greeter = await greeterPromise;
    expect(greeter.$state.greeting).to.equal('INIT: hello world!');
    expect(await greeter.greet()).to.equal('hello world!');
    expect(greeter.$state.greeting).to.equal('hello world!');
    expect(stringifyDebug(greeter.$element)).to.equal(
      "<child : ::greeter='service:/service.unit.GreeterService' greeter:hello:world>"
    );
    expect(
      await getInjector(fixture.child).getService(
        'greeter:hello:world' as any as ServiceKey<GreeterService>
      )
    ).to.equal(greeter);

    serializeState(fixture.host);
    expect(stringifyDebug(greeter.$element)).to.equal(
      `<child : ::greeter='service:/service.unit.GreeterService' greeter:hello:world='{"greeting":"hello world!"}'>`
    );

    greeter.$release();
    expect(stringifyDebug(greeter.$element)).to.equal(
      `<child : ::greeter='service:/service.unit.GreeterService'>`
    );
  });
});

/////////////////////////////////////////////////////////////////////////////////////

interface EmptyProps {
  id?: null;
}
interface Empty {}

export class EmptyService extends Service<EmptyProps, Empty> {
  static $type: 'Empty' = 'Empty';
  static $qrl = QRL<EmptyService>`service:/service.unit.EmptyService`;
  static $keyProps = ['id'];
  async ident(value: string): Promise<string> {
    return this.$invokeQRL(QRL<(value: string) => string>`service:/service.unit.ident`, value);
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

export class GreeterService extends Service<GreeterProps, Greeter> {
  static $type: 'Greeter' = 'Greeter';
  static $qrl = QRL<GreeterService>`service:/service.unit.GreeterService`;
  static $keyProps = ['salutation', 'name'];

  async $newState($keyProps: GreeterProps): Promise<Greeter> {
    if ($keyProps.salutation == 'throw') {
      throw new Error($keyProps.name);
    }
    return { greeting: `INIT: ${$keyProps.salutation} ${$keyProps.name}!` };
  }
  async greet(): Promise<string> {
    return this.$invokeQRL(QRL<() => string>`service:/service.unit.greet`);
  }
}

export const greet = injectMethod(GreeterService, function (this: GreeterService) {
  assertDefined(this);
  assertDefined(this.$props);
  assertDefined(this.$state);
  return (this.$state.greeting = this.$props.salutation + ' ' + this.$props.name + '!');
});

/////////////////////////////////////////////////////////////////////////////////////
