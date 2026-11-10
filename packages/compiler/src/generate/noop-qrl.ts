import type { LinkedModule, LinkedQrl } from '../schema';
import { QwikWord } from '../words';
import { chunkSymbolName } from './qrl-chunks';

/**
 * A server-side stand-in for a boundary whose body never runs there. In dev the browser derives the
 * segment URL from the parent module (`<parent>_<symbol>.js`), so the stand-in names that module.
 */
export function noopQrlJs(
  module: LinkedModule,
  qrl: LinkedQrl,
  captures: readonly string[] = []
): { word: QwikWord; code: string } {
  const captureArg = captures.length === 0 ? '' : `, [${captures.join(', ')}]`;
  const symbol = JSON.stringify(chunkSymbolName(qrl));
  const devPath = module.source.devPath;
  if (devPath === undefined) {
    return {
      word: QwikWord.NoopQrl,
      code: `${QwikWord.NoopQrl}(${symbol}${captureArg})`,
    };
  }
  const [lo, hi] = qrl.origin.range;
  const dev = JSON.stringify({ file: devPath, lo, hi });
  return {
    word: QwikWord.NoopQrlDev,
    code: `${QwikWord.NoopQrlDev}(${symbol}, ${dev}${captureArg})`,
  };
}
