/**
 * This file is here to make testing of QRLs without Optimizer possible. The content of this file should
 * not ever make it to production.
 */

import { qGlobal, qTest } from '../util/qdev';
import { parseQRL, QRL, stringifyQRL } from './qrl';

let qrlMap: Map<any, any>;
let qrlNextId: number;

const MOCK_IMPORT = '/qMockModule';

/**
 * This function is here to make testing easier. It is expected
 * that the method is tree shaken by the bundlers.
 *
 * The purpose of this function is to generate a unique QRL
 * for a symbol. This allows for writing and executing the tests
 * without optimizer being present.
 */
export function toDevModeQRL(symbol: any, stackFrames: Error): QRL<any> {
  if (!qTest) throw new Error('This should run in tests only!!!');
  if (!qrlMap) {
    qrlMap = new Map();
    qrlNextId = 0;
  }
  // TODO(misko): Make this nicer. This relies on qrl=>toQrl for it to work.
  const frames = stackFrames.stack!.split('\n');
  const key = frames[2];
  let qrl = qrlMap.get(key);
  if (!qrl) {
    const symbolName = 'symbol_' + qrlNextId++;
    qrl = MOCK_IMPORT + '#' + symbolName;
    qrlMap.set(qrl, symbol);
    qrlMap.set(key, qrl);
    const qrlMockExport = qGlobal[MOCK_IMPORT + '.js'] || (qGlobal[MOCK_IMPORT + '.js'] = {});
    qrlMockExport[symbolName] = symbol;
  }
  qrl = new String(qrl);
  qrl.with = withArgs;
  return qrl;
}

function withArgs(this: String, args: Record<string, any>): QRL<any> {
  return stringifyQRL(parseQRL(String(this)).with(args)) as any;
}

/**
 * This function is here to make testing easier. It is expected
 * that the method is tree shaken by the bundlers.
 *
 * The purpose of this function is to generate a unique QRL
 * for a symbol. This allows for writing and executing the tests
 * without optimizer being present.
 */
export function fromQRL(qrl: QRL<any>): any {
  if (!qTest) throw new Error('This should run in tests only!!!');
  if (typeof qrl === 'string' || qrl instanceof String) {
    const key = qrl.split('?')[0];
    if (qrlMap) {
      const symbol = qrlMap.get(key);
      if (symbol) return symbol;
    }
  }
  return undefined;
}
