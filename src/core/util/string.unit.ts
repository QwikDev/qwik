/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { caseInsensitiveCompare } from './string';

describe('string', () => {
  it('should caseInsensitiveCompare', () => {
    expect(caseInsensitiveCompare(null, null)).toEqual(false);
    expect(caseInsensitiveCompare('a', null)).toEqual(false);
    expect(caseInsensitiveCompare(null, 'b')).toEqual(false);
    expect(caseInsensitiveCompare('a', 'bb')).toEqual(false);

    expect(caseInsensitiveCompare('a', 'a')).toEqual(true);
    expect(caseInsensitiveCompare('aBc', 'AbC')).toEqual(true);
  });
});
