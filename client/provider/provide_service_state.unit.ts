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
import { provideServiceState } from './provide_service_state.js';
import { Service } from '../service/service.js';
import { expect } from 'chai';
import { Injector } from '../injector/index.js';
import { Provider } from '../injector/types';
import { ServiceKey } from '../service/service_key.js';

describe('provideService', () => {
  let fixture: ElementFixture;
  let hostInjector: Injector; // eslint-disable-line @typescript-eslint/no-unused-vars
  beforeEach(() => {
    fixture = new ElementFixture();
    hostInjector = getInjector(fixture.host); // eslint-disable-line @typescript-eslint/no-unused-vars
  });

  it('should return service', async () => {
    RegardsService.$attachService(fixture.parent);
    const fn = injectFunction(
      provideServiceState<RegardsService>(((() =>
        Promise.resolve('regards:Hello:World')) as any) as Provider<ServiceKey<RegardsService>>),
      (service: Regards) => service
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

export class RegardsService extends Service<RegardsProps, Regards> {
  static $type = 'regards';
  static $qrl = QRL`test:/provider/provide_service_state.unit.RegardsService`;
  static $keyProps = ['salutation', 'name'];

  greeting: string = null!;

  async $init() {
    this.greeting = this.$state.greeting;
  }

  async $newState(state: RegardsProps) {
    return { greeting: state.salutation + ' ' + state.name + '!' };
  }
}
