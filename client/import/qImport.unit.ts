/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { expect } from 'chai';
import { qImport } from '../import/qImport.js';
import { isPromise } from '../util/promises.js';
import { createGlobal } from '../testing/node_utils.js';

describe('qImport', () => {
  let document: Document;
  let host: Element;
  beforeEach(() => {
    document = createGlobal().document;
    Object.defineProperty(document, 'baseURI', { value: import.meta.url });
    host = document.createElement('host');
  });

  it('should import default symbol', async () => {
    const valuePromise = qImport(host, './qImport_default_unit');
    expect(isPromise(valuePromise)).to.be.true;
    expect(await valuePromise).to.equal('DEFAULT_VALUE');
    // second read is direct.
    expect(qImport(host, './qImport_default_unit')).to.equal('DEFAULT_VALUE');
  });

  it('should import symbol from extension', async () => {
    const valuePromise = qImport(host, './qImport_symbol_unit.mySymbol');
    expect(isPromise(valuePromise)).to.be.true;
    expect(await valuePromise).to.equal('MY_SYMBOL_VALUE');
    // second read is direct.
    expect(qImport(host, './qImport_symbol_unit.mySymbol')).to.equal('MY_SYMBOL_VALUE');
  });
});
