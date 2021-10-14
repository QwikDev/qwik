/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { getQObjectId } from '../object/q-object';
import { qObject } from '../object/q-object.public';
import { dirname } from '../util/dirname';
import { parseQRL, QRL, QRL_STATE, stringifyQRL } from './qrl';

describe('QRL', () => {
  it('should build QRL from string', () => {
    expect(parseQRL(QRL`./somePath`)).toEqual({
      _serialized: './somePath',
      url: './somePath',
      symbol: '',
      args: {},
    });
    expect(parseQRL(QRL`./somePath#symbol?a=b`)).toEqual({
      _serialized: './somePath#symbol?a=b',
      url: './somePath',
      symbol: 'symbol',
      args: { a: 'b' },
    });
    expect(parseQRL(QRL`./somePath#symbol?a=b&c=1`)).toEqual({
      _serialized: './somePath#symbol?a=b&c=1',
      url: './somePath',
      symbol: 'symbol',
      args: { a: 'b', c: 1 },
    });
  });

  it('should encode state', () => {
    const state = qObject({ mark: 'state' });
    expect(parseQRL(QRL`./path`).with({ [QRL_STATE]: state })).toEqual({
      _serialized: null,
      url: './path',
      symbol: '',
      args: {
        [QRL_STATE]: state,
      },
    });
  });

  it('should encode args', () => {
    const obj = qObject({ mark: 'obj' });
    expect(parseQRL(QRL`./path`).with({ data: obj })).toEqual({
      _serialized: null,
      url: './path',
      symbol: '',
      args: {
        data: obj,
      },
    });
  });

  it('should stringify', () => {
    const map = new Map<string, any>();
    const obj = qObject({ mark: 'obj' });
    const qrl = parseQRL(QRL`./path`)
      .with({ data: obj })
      .with({ [QRL_STATE]: 'foo' });
    expect(stringifyQRL(qrl, map)).toEqual(`./path#?data=*${getQObjectId(obj)}&.=foo`);
  });

  it('should strip filename and keep ending slash', () => {
    expect(dirname('dir/path/file.ext')).toEqual('dir/path/');
  });
});
