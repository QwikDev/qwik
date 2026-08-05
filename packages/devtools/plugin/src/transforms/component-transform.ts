import { INNER_USE_HOOK, VIRTUAL_QWIK_DEVTOOLS_KEY } from '@qwik.dev/devtools/kit';
import { parseQwikCode } from '../parse/parse';
import { injectNamedImportIfMissing } from './source-utils';

export function transformComponentFile(code: string, id: string): string {
  const codeWithCollectorImport = injectNamedImportIfMissing(
    code,
    VIRTUAL_QWIK_DEVTOOLS_KEY,
    INNER_USE_HOOK
  );

  return parseQwikCode(codeWithCollectorImport, { path: id });
}
