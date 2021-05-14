/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { expect } from 'chai';
import { ComponentFixture } from '../testing/component_fixture.js';
import { EventInjector } from '../event/event_injector.js';
import { injectFunction } from '../injector/inject.js';
import { provideQrlExp } from './provide_qrl_exp.js';

describe('provideQrlExp', () => {
  it('should inject properties from event object', async () => {
    const fixture = new ComponentFixture();
    const injector = new EventInjector(
      fixture.child,
      { foo: { bar: 'worked' } } as any,
      new URL('./provide_qrl_exp.unit.someExport#?value=.foo.bar', import.meta.url)
    );
    const handler = injectFunction(provideQrlExp<string>('value'), (props) => {
      return props;
    });
    expect(await provideQrlExp<string>('value')(injector)).to.eql('worked');
    expect(await injector.invoke(handler)).to.eql('worked');
  });
});

export const someExport = '';
