import { normalizeExcludePathnames } from '../../../kit/src/overlay-paths';
import { applySourceEdits } from '../parse/sourceEdits';
import { parseProgram, traverseProgram } from '../parse/traverse';
import { prependImportIfMissing } from './source-utils';

export interface QwikDevtoolsOptions {
  mode?: 'auto' | 'dock' | 'overlay';
  overlay?: {
    excludePathnames?: string[];
  };
}

const DEVTOOLS_IMPORT = `import { QwikDevtools } from '@qwik.dev/devtools/ui';`;
const STYLES_IMPORT = `import '@qwik.dev/devtools/ui/styles.css';`;

export function transformRootFile(
  code: string,
  opts: QwikDevtoolsOptions = {},
  shouldInjectOverlay = true,
  appBase?: string
): string {
  const excludePathnames = normalizeExcludePathnames(opts.overlay?.excludePathnames);
  const bodyClosingStart = findBodyClosingStart(code);
  const component = shouldInjectOverlay ? 'QwikDevtools' : 'QwikDevtoolsCollector';
  if (bodyClosingStart !== null) {
    const excludeProp =
      excludePathnames.length > 0 ? ` excludePathnames={${JSON.stringify(excludePathnames)}}` : '';
    const baseProp = shouldInjectOverlay && appBase ? ` appBase={${JSON.stringify(appBase)}}` : '';
    const devtoolsElement = `<${component}${excludeProp}${baseProp} />`;
    code = applySourceEdits(code, [
      { kind: 'insert', pos: bodyClosingStart, text: devtoolsElement },
    ]);
  }

  const componentImport = shouldInjectOverlay
    ? DEVTOOLS_IMPORT
    : `import { QwikDevtoolsCollector } from '@qwik.dev/devtools/ui';`;
  code = prependImportIfMissing(code, componentImport);
  return shouldInjectOverlay ? prependImportIfMissing(code, STYLES_IMPORT) : code;
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
