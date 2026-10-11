import type { LinkedModule, LinkedQrl } from '../schema';
import { QwikWord } from '../words';

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
  const devPath = module.source.devPath;
  if (devPath === undefined) {
    return {
      word: QwikWord.NoopQrl,
      code: `${QwikWord.NoopQrl}(${JSON.stringify(qrl.name)}${captureArg})`,
    };
  }
  const [lo, hi] = qrl.origin.range;
  const dev = JSON.stringify({ file: devPath, lo, hi });
  return {
    word: QwikWord.NoopQrlDev,
    code: `${QwikWord.NoopQrlDev}(${JSON.stringify(qrl.name)}, ${dev}${captureArg})`,
  };
}
