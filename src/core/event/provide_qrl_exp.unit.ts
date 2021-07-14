/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { ComponentFixture } from '@builder.io/qwik/testing';
import { EventInjector } from '../event/event_injector';
import { injectFunction } from '../injector/inject';
import { provideQrlExp } from './provide_qrl_exp';

describe('provideQrlExp', () => {
  it('should inject properties from event object', async () => {
    const fixture = new ComponentFixture();
    const injector = new EventInjector(
      fixture.child,
      { foo: { bar: 'worked' } } as any,
      new URL('./provide_qrl_exp.unit.someExport#?value=.foo.bar', 'http://testing.qwik.dev')
    );
    const handler = injectFunction(provideQrlExp<string>('value'), (props) => {
      return props;
    });
    expect(await provideQrlExp<string>('value')(injector)).toEqual('worked');
    expect(await injector.invoke(handler)).toEqual('worked');
  });
});

export const someExport = '';
