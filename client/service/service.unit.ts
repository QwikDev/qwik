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
import { inject } from '../injection/inject.js';
import { retrieveInjector } from '../injection/storage.js';
import { serializeState } from '../render/serialize_state.js';
import { ServiceFixture } from '../testing/service_fixture.js';
import { retrieveService } from './retrieve_service.js';
import { retrieveState } from './retrieve_state.js';
import { Service } from './service.js';
import { IService, ServiceType } from './types.js';

export const __verify_Service_subtype_of_ServiceType__: ServiceType<Service<any, any>> = Service;
const service: Service<any, any> = null!;
export const __verify_Service_subtype_of_IService__: IService<any, any> = service;

describe('service', () => {
  const MissingNameService: ServiceType<any> = class MissingNameService {} as any;
  const EmptyNameService: ServiceType<any> = class EmptyNameService {
    static $name = '';
  } as any;
  const MissingKeyPropsService: ServiceType<any> = class MissingKeyPropsService {
    static $name = 'missingService';
  } as any;

  describe('$attachService', () => {
    it('should attach', () => {
      const fixture = new ServiceFixture();
      GreeterService.$attachService(fixture.host);
      expect(stringifyDebug(fixture.host)).to.eql(
        `<host ::greeter='service:/service.unit.GreeterService'>`
      );
    });

    it('should allow second attach', () => {
      const fixture = new ServiceFixture();
      GreeterService.$attachService(fixture.host);
      GreeterService.$attachService(fixture.host);
      expect(stringifyDebug(fixture.host)).to.eql(
        `<host ::greeter='service:/service.unit.GreeterService'>`
      );
    });

    it('should error', () => {
      expect(() => Service.$attachService.apply(MissingNameService as any, null!)).to.throw(
        `SERVICE-ERROR(Q-310): Service 'MissingNameService' must have static '$name' property defining the name of the service.`
      );
      expect(() => Service.$attachService.apply(EmptyNameService as any, null!)).to.throw(
        `SERVICE-ERROR(Q-310): Service 'EmptyNameService' must have static '$name' property defining the name of the service.`
      );
      expect(() => Service.$attachService.apply(MissingKeyPropsService as any, null!)).to.throw(
        `SERVICE-ERROR(Q-312): Service 'MissingKeyPropsService' must have static '$qrl' property defining the import location of the service.`
      );
    });
    it('should error on QRL collision', () => {
      const fixture = new ServiceFixture();
      fixture.host.setAttribute('::greeter', 'some_other_qrl');
      expect(() => GreeterService.$attachService(fixture.host)).to.throw(
        `SERVICE-ERROR(Q-313): Name collision. Already have service named 'Greeter' with QRL 'some_other_qrl' but expected QRL 'service:/service.unit.GreeterService'.`
      );
    });
  });

  describe('$attachServiceState', () => {
    it('should attach', () => {
      const fixture = new ServiceFixture();
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
      const fixture = new ServiceFixture();
      const greeterPromise = GreeterService.$hydrate(
        fixture.host,
        { salutation: 'Hello', name: 'World' },
        { greeting: 'existing state' }
      );
      expect(greeterPromise.$key).to.eql('greeter:-hello:-world');
      const greeter = await greeterPromise;
      expect(greeter.$state).to.eql({ greeting: 'existing state' });
      expect(stringifyDebug(fixture.host)).to.eql(
        `<host : ::greeter='service:/service.unit.GreeterService' greeter:-hello:-world>`
      );
    });
    it('should hydrate without state', async () => {
      const fixture = new ServiceFixture();
      const greeterPromise = GreeterService.$hydrate(fixture.host, {
        salutation: 'Hello',
        name: 'World',
      });
      expect(greeterPromise.$key).to.eql('greeter:-hello:-world');
      const greeter = await greeterPromise;
      expect(greeter.$state).to.eql({ greeting: 'INIT: Hello World!' });
      expect(stringifyDebug(fixture.host)).to.eql(
        `<host : ::greeter='service:/service.unit.GreeterService' greeter:-hello:-world>`
      );
    });
    it('should hydrate into the same instance', async () => {
      const fixture = new ServiceFixture();
      const greeterPromise = GreeterService.$hydrate(fixture.host, {
        salutation: 'Hello',
        name: 'World',
      });
      expect(greeterPromise).to.equal(
        GreeterService.$hydrate(fixture.host, 'greeter:-hello:-world')
      );
      expect(await greeterPromise).to.equal(
        await GreeterService.$hydrate(fixture.host, 'greeter:-hello:-world')
      );
    });
    it('should hydrate without state using key', async () => {
      const fixture = new ServiceFixture();
      const greeterPromise = GreeterService.$hydrate(fixture.host, 'greeter:-hello:-world');
      expect(greeterPromise.$key).to.eql('greeter:-hello:-world');
      const greeter = await greeterPromise;
      expect(greeter.$state).to.eql({ greeting: 'INIT: Hello World!' });
      expect(stringifyDebug(fixture.host)).to.eql(
        `<host : ::greeter='service:/service.unit.GreeterService' greeter:-hello:-world>`
      );
    });
    it('should hydrate with error', async () => {
      const fixture = new ServiceFixture();
      const greeterPromise = GreeterService.$hydrate(fixture.host, {
        salutation: 'throw',
        name: 'World',
      });
      expect(greeterPromise.$key).to.eql('greeter:throw:-world');
      try {
        await greeterPromise;
        expect('not to get here').to.be.false;
      } catch (e) {
        expect(String(e)).to.contain('World');
      }
    });
    it('should deserialize service from DOM', async () => {
      const fixture = new ServiceFixture();
      GreeterService.$attachService(fixture.host);
      GreeterService.$attachServiceState(
        fixture.host,
        { salutation: 'ahoj', name: 'svet' },
        { greeting: 'Ahoj Svet!' }
      );

      const greeterPromise = retrieveState<GreeterService>(fixture.child, 'greeter:ahoj:svet');
      const greeter: Greeter = await greeterPromise;
      expect(greeter).to.eql({ greeting: 'Ahoj Svet!' });

      const servicePromise = retrieveService<GreeterService>(fixture.child, 'greeter:ahoj:svet');
      const greeterService = await servicePromise;
      expect(greeterService).to.be.instanceOf(GreeterService);
      expect(greeterService.$injector.props).to.eql({ salutation: 'ahoj', name: 'svet' });
      expect(greeterService.$state).to.eql({ greeting: 'Ahoj Svet!' });
    });
  });

  describe('invoke', () => {
    it('should create an instance and invoke identity method', async () => {
      const fixture = new ServiceFixture();
      const empty = await EmptyService.$hydrate(fixture.child, {}, {});
      expect(await empty.ident('ABC')).to.equal('ABC');
      expect(retrieveInjector(fixture.child, 'empty:')!.instance).to.equal(empty);
      expect(fixture.child.getAttribute('::empty')).to.equal('service:/service.unit.EmptyService');
    });
  });

  it('should create instance greeter and persist it and delete it', async () => {
    const fixture = new ServiceFixture();
    const greeterPromise = GreeterService.$hydrate(fixture.child, {
      salutation: 'hello',
      name: 'world',
    });
    const greeter = await greeterPromise;
    expect(greeter.$state.greeting).to.equal('INIT: hello world!');
    expect(await greeter.greet()).to.equal('hello world!');
    expect(greeter.$state.greeting).to.equal('hello world!');
    expect(stringifyDebug(greeter.$injector.element)).to.equal(
      "<child : ::greeter='service:/service.unit.GreeterService' greeter:hello:world>"
    );
    expect(retrieveInjector(fixture.child, 'greeter:hello:world')!.instance).to.equal(greeter);

    serializeState(fixture.host);
    expect(stringifyDebug(greeter.$injector.element)).to.equal(
      `<child : ::greeter='service:/service.unit.GreeterService' greeter:hello:world='{"greeting":"hello world!"}'>`
    );

    greeter.$release();
    expect(stringifyDebug(greeter.$injector.element)).to.equal(
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
  static $name: 'Empty' = 'Empty';
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
  static $name: 'Greeter' = 'Greeter';
  static $qrl = QRL<GreeterService>`service:/service.unit.GreeterService`;
  static $keyProps = ['salutation', 'name'];

  async $materializeState($keyProps: GreeterProps): Promise<Greeter> {
    if ($keyProps.salutation == 'throw') {
      throw new Error($keyProps.name);
    }
    return { greeting: `INIT: ${$keyProps.salutation} ${$keyProps.name}!` };
  }
  async greet(): Promise<string> {
    return this.$invokeQRL(QRL<() => string>`service:/service.unit.greet`);
  }
}

export const greet = inject(GreeterService, function (this: GreeterService) {
  assertDefined(this);
  assertDefined(this.$injector.props);
  assertDefined(this.$state);
  return (this.$state.greeting =
    this.$injector.props.salutation + ' ' + this.$injector.props.name + '!');
});

/////////////////////////////////////////////////////////////////////////////////////
