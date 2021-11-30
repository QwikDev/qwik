/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { qExport, qImport, qParams } from '../import/qImport';
import { ElementFixture, isPromise } from '@builder.io/qwik/testing';
import { getBaseUri } from '../util/base_uri';

describe('qImport', () => {
  it('should import default symbol', async () => {
    const fixture = new ElementFixture();
    fixture.host.setAttribute('q:base', 'file://' + getBaseUri());
    const valuePromise = qImport(fixture.host, './qImport_default_unit');
    expect(isPromise(valuePromise)).toBe(true);
    expect(await valuePromise).toEqual('DEFAULT_VALUE');
    // second read is direct.
    expect(qImport(fixture.host, './qImport_default_unit')).toEqual('DEFAULT_VALUE');
  });

  it('should import symbol from extension', async () => {
    const fixture = new ElementFixture();
    fixture.host.setAttribute('q:base', 'file://' + getBaseUri());
    const valuePromise = qImport(fixture.host, '../import/qImport_symbol_unit#mySymbol');
    expect(isPromise(valuePromise)).toBe(true);
    expect(await valuePromise).toEqual('MY_SYMBOL_VALUE');
    // second read is direct.
    expect(qImport(fixture.host, '../import/qImport_symbol_unit#mySymbol')).toEqual(
      'MY_SYMBOL_VALUE'
    );
  });
});

describe('qExport', () => {
  it('should return "default" if there is no hash', () => {
    expect(qExport(new URL('http://localhost/path'))).toEqual('default');
  });

  it('should return "default" if there is an empty hash', () => {
    expect(qExport(new URL('http://localhost/path#'))).toEqual('default');
  });

  it('should extract the export name from the hash', () => {
    expect(qExport(new URL('http://localhost/path#abc'))).toEqual('abc');
  });

  it('should exclude QRL params from the export name', () => {
    expect(qExport(new URL('http://localhost/path#abc?foo=bar'))).toEqual('abc');
    expect(qExport(new URL('http://localhost/path?foo=bar'))).toEqual('default');
    expect(qExport(new URL('http://localhost/path#?foo=bar'))).toEqual('default');
  });
});

describe('qParams', () => {
  it('should return an empty params object if there is no export block', () => {
    expect(qParams(new URL('http://localhost/path')).toString()).toEqual('');
  });

  it('should return an empty params object if there is no `?` section', () => {
    expect(qParams(new URL('http://localhost/path#')).toString()).toEqual('');
    expect(qParams(new URL('http://localhost/path#foo')).toString()).toEqual('');
  });

  it('should extract the params from the `?` section of the export block', () => {
    let params = qParams(new URL('http://localhost/path#?a=10'));
    expect(params.toString()).toEqual('a=10');
    expect(params.get('a')).toEqual('10');
    expect(params.get('b')).toBeNull();

    params = qParams(new URL('http://localhost/path#?a=10&b=20'));
    expect(params.toString()).toEqual('a=10&b=20');
    expect(params.get('a')).toEqual('10');
    expect(params.get('b')).toEqual('20');
  });
});
