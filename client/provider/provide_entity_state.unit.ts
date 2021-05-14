/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { injectFunction } from '../injector/inject.js';
import '../CONFIG.js';
import { QRL } from '../import/qrl.js';
import { getInjector } from '../injector/element_injector.js';
import { ElementFixture } from '../testing/element_fixture.js';
import { provideEntityState } from './provide_entity_state.js';
import { Entity } from '../entity/entity.js';
import { expect } from 'chai';
import { Injector } from '../injector/index.js';
import { Provider } from '../injector/types';
import { EntityKey } from '../entity/entity_key.js';

describe('provideEntity', () => {
  let fixture: ElementFixture;
  let hostInjector: Injector; // eslint-disable-line @typescript-eslint/no-unused-vars
  beforeEach(() => {
    fixture = new ElementFixture();
    hostInjector = getInjector(fixture.host); // eslint-disable-line @typescript-eslint/no-unused-vars
  });

  it('should return entity', async () => {
    RegardsEntity.$attachEntity(fixture.parent);
    const fn = injectFunction(
      provideEntityState<RegardsEntity>((() =>
        Promise.resolve('regards:Hello:World')) as any as Provider<EntityKey<RegardsEntity>>),
      (entity: Regards) => entity
    );

    expect(await hostInjector.invoke(fn)).to.eql({
      $key: 'regards:Hello:World',
      greeting: 'Hello World!',
    });
  });
});

interface RegardsProps {
  salutation: string;
  name: string;
}
interface Regards {
  greeting: string;
}

export class RegardsEntity extends Entity<RegardsProps, Regards> {
  static $type = 'regards';
  static $qrl = QRL`test:/provider/provide_entity_state.unit#RegardsEntity`;
  static $keyProps = ['salutation', 'name'];

  greeting: string = null!;

  async $init() {
    this.greeting = this.$state.greeting;
  }

  async $newState(state: RegardsProps) {
    return { greeting: state.salutation + ' ' + state.name + '!' };
  }
}
