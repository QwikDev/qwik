/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { expect } from 'chai';
import { qExport, qImport, qParams } from '../import/qImport.js';
import { isPromise } from '../util/promises.js';
import { ComponentFixture } from '../testing/component_fixture.js';

describe('qImport', () => {
  it('should import default symbol', async () => {
    const fixture = new ComponentFixture();
    const valuePromise = qImport(fixture.host, 'import:qImport_default_unit');
    expect(isPromise(valuePromise)).to.be.true;
    expect(await valuePromise).to.equal('DEFAULT_VALUE');
    // second read is direct.
    expect(qImport(fixture.host, 'import:qImport_default_unit')).to.equal('DEFAULT_VALUE');
  });

  it('should import symbol from extension', async () => {
    const fixture = new ComponentFixture();
    const valuePromise = qImport(fixture.host, './import/qImport_symbol_unit#mySymbol');
    expect(isPromise(valuePromise)).to.be.true;
    expect(await valuePromise).to.equal('MY_SYMBOL_VALUE');
    // second read is direct.
    expect(qImport(fixture.host, './import/qImport_symbol_unit#mySymbol')).to.equal(
      'MY_SYMBOL_VALUE'
    );
  });
});

describe('qExport', () => {
  it('should return "default" if there is no hash', () => {
    expect(qExport(new URL('http://localhost/path'))).to.equal('default');
  });

  it('should return "default" if there is an empty hash', () => {
    expect(qExport(new URL('http://localhost/path#'))).to.equal('default');
  });

  it('should extract the export name from the hash', () => {
    expect(qExport(new URL('http://localhost/path#abc'))).to.equal('abc');
  });

  it('should exclude QRL params from the export name', () => {
    expect(qExport(new URL('http://localhost/path#abc?foo=bar'))).to.equal('abc');
    expect(qExport(new URL('http://localhost/path?foo=bar'))).to.equal('default');
    expect(qExport(new URL('http://localhost/path#?foo=bar'))).to.equal('default');
  });
});

describe('qParams', () => {
  it('should return an empty params object if there is no export block', () => {
    expect(qParams(new URL('http://localhost/path')).toString()).to.equal('');
  });

  it('should return an empty params object if there is no `?` section', () => {
    expect(qParams(new URL('http://localhost/path#')).toString()).to.equal('');
    expect(qParams(new URL('http://localhost/path#foo')).toString()).to.equal('');
  });

  it('should extract the params from the `?` section of the export block', () => {
    let params = qParams(new URL('http://localhost/path#?a=10'));
    expect(params.toString()).to.equal('a=10');
    expect(params.get('a')).to.equal('10');
    expect(params.get('b')).to.be.null;

    params = qParams(new URL('http://localhost/path#?a=10&b=20'));
    expect(params.toString()).to.equal('a=10&b=20');
    expect(params.get('a')).to.equal('10');
    expect(params.get('b')).to.equal('20');
  });
});
