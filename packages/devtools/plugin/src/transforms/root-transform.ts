import { normalizeExcludePathnames } from '../../../kit/src/overlay-paths';
import { applySourceEdits } from '../parse/sourceEdits';
import { parseProgram, traverseProgram } from '../parse/traverse';
import { prependImportIfMissing } from './source-utils';

export interface QwikDevtoolsOptions {
  overlay?: {
    excludePathnames?: string[];
  };
}

const DEVTOOLS_IMPORT = `import { QwikDevtools } from '@qwik.dev/devtools/ui';`;
const STYLES_IMPORT = `import '@qwik.dev/devtools/ui/styles.css';`;

export function transformRootFile(code: string, opts: QwikDevtoolsOptions = {}): string {
  const excludePathnames = normalizeExcludePathnames(opts.overlay?.excludePathnames);
  const bodyClosingStart = findBodyClosingStart(code);
  if (bodyClosingStart !== null) {
    const devtoolsElement =
      excludePathnames.length > 0
        ? `<QwikDevtools excludePathnames={${JSON.stringify(excludePathnames)}} />`
        : '<QwikDevtools />';
    code = applySourceEdits(code, [
      { kind: 'insert', pos: bodyClosingStart, text: devtoolsElement },
    ]);
  }

  return prependImportIfMissing(prependImportIfMissing(code, DEVTOOLS_IMPORT), STYLES_IMPORT);
}

function findBodyClosingStart(code: string): number | null {
  let closingStart: number | null = null;

  try {
    const program = parseProgram(code);
    traverseProgram(program, {
      JSXElement(path) {
        const node = path.node as JsxElementNode;
        if (getJsxName(node.openingElement?.name) !== 'body' || !node.closingElement) {
          return;
        }

        closingStart = node.closingElement.start;
        path.stop();
      },
    });
  } catch (_) {
    return null;
  }

  return closingStart;
}

function getJsxName(name: unknown): string | undefined {
  if (!name || typeof name !== 'object') {
    return undefined;
  }
  const record = name as { type?: string; name?: string };
  return record.type === 'JSXIdentifier' ? record.name : undefined;
}

interface JsxElementNode {
  openingElement?: {
    name?: unknown;
  };
  closingElement?: {
    start: number;
  };
}
