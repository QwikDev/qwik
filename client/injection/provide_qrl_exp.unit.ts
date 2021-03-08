/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { expect } from 'chai';
import { inject } from '../injection/inject.js';
import { ComponentFixture } from '../testing/component_fixture.js';
import { createEventInjector } from './element_injector.js';
import { provideQrlExp } from './provide_qrl_exp.js';

describe('provideQrlExp', () => {
  it('should inject properties from event object', async () => {
    const fixture = new ComponentFixture();
    fixture.injector = createEventInjector(
      fixture.child,
      { foo: { bar: 'worked' } } as any,
      new URL('./provide_qrl_exp.unit.someExport?value=.foo.bar', import.meta.url)
    );
    const handler = inject(null, provideQrlExp<string>('value'), (props) => props);

    expect(await fixture.injector.invoke(handler)).to.eql('worked');
  });
});

export const someExport = '';
