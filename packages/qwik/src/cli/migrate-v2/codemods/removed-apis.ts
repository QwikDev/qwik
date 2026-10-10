import type { SourceFile } from 'ts-morph';
import { warn } from '../report';

const ERROR_BOUNDARY =
  'was removed in v2. `<ErrorBoundary fallback$={(error, reset) => ...}>` from "@qwik.dev/core" (with `qwikVite({ experimental: ["errorBoundary"] })`) replaces it with a different API.';

const REMOVED: Record<string, Record<string, string>> = {
  '@builder.io/qwik': {
    useErrorBoundary: ERROR_BOUNDARY,
    ErrorBoundaryStore: ERROR_BOUNDARY,
    HTMLFragment: 'was removed in v2 without replacement.',
    SSRHint: 'was removed in v2 without replacement.',
    PropFunctionProps: 'was removed in v2, use `PropsOf` or `QRL` types instead.',
    PropFnInterface: 'was removed in v2, use the `QRL` type instead.',
    EagernessOptions: 'was removed in v2, tasks have no eagerness option.',
    UseTaskOptions: 'was removed in v2, tasks have no eagerness option.',
    AriaAttributes: 'was removed in v2, use `PropsOf<tag>` instead.',
    HTMLInputAutocompleteAttribute: "was removed in v2, use `PropsOf<'input'>['autoComplete']`.",
    WebViewHTMLAttributes: 'was removed in v2 without replacement.',
  },
  '@builder.io/qwik-city': {
    ErrorBoundary: ERROR_BOUNDARY,
    MenuData: 'was removed in v2, use the `ContentMenu` type.',
    routeLoaderQrl: 'is internal in v2, use `routeLoader$`.',
    globalActionQrl: 'is internal in v2, use `globalAction$`.',
    serverQrl: 'is internal in v2, use `server$`.',
    zodQrl: 'is internal in v2, use `zod$`.',
    valibotQrl: 'is internal in v2, use `valibot$`.',
    validatorQrl: 'is internal in v2, use `validator$`.',
  },
};

/** Reports imports of APIs that were removed in v2 and can't be migrated automatically. */
export const warnRemovedApis = (file: SourceFile) => {
  for (const decl of file.getImportDeclarations()) {
    const removed = REMOVED[decl.getModuleSpecifierValue()];
    for (const named of removed ? decl.getNamedImports() : []) {
      const message = removed[named.getName()];
      if (message) {
        warn(file.getFilePath(), `\`${named.getName()}\` ${message}`);
      }
    }
  }
  return false;
};
