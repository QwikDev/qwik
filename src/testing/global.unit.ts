/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { createGlobal } from './global';
import { pathToFileURL } from 'url';

describe('global', () => {
  it('should create document', () => {
    const global = createGlobal({
      baseURI: pathToFileURL(__filename).href,
    });
    expect(global.document.baseURI).toContain('file://');
    expect(global.document.baseURI).toContain('global.unit');
  });
});
