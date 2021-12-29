/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { createGlobal } from './document';
import { pathToFileURL } from 'url';

describe('global', () => {
  it('should create document', () => {
    const global = createGlobal({
      url: pathToFileURL(__filename),
    });
    expect(global.document.baseURI).toContain('file://');
    expect(global.document.baseURI).toContain('document.unit.ts');
  });
});
