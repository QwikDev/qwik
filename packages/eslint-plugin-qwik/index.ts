import { jsxAtag } from './src/jsxAtag';
import { jsxImg } from './src/jsxImg';
import { jsxKey } from './src/jsxKey';
import { jsxNoScriptUrl } from './src/jsxNoScriptUrl';
import { loaderLocation } from './src/loaderLocation';
import { noReactProps } from './src/noReactProps';
import { noUseVisibleTask } from './src/noUseVisibleTask';
import { preferClasslist } from './src/preferClasslist';
import { unusedServer } from './src/unusedServer';
import { useMethodUsage } from './src/useMethodUsage';
import { validLexicalScope } from './src/validLexicalScope';
import { serializerSignalUsage } from './src/serializerSignalUsage';
import pkg from './package.json';

const rules = {
  'use-method-usage': useMethodUsage,
  'valid-lexical-scope': validLexicalScope,
  'loader-location': loaderLocation,
  'no-react-props': noReactProps,
  'prefer-classlist': preferClasslist,
  'jsx-no-script-url': jsxNoScriptUrl,
  'jsx-key': jsxKey,
  'unused-server': unusedServer,
  'jsx-img': jsxImg,
  'jsx-a': jsxAtag,
  'no-use-visible-task': noUseVisibleTask,
  'serializer-signal-usage': serializerSignalUsage,
};

const recommendedRules = {
  'qwik/use-method-usage': 'error',
  'qwik/valid-lexical-scope': 'error',
  'qwik/no-react-props': 'error',
  'qwik/prefer-classlist': 'warn',
  'qwik/jsx-no-script-url': 'warn',
  'qwik/loader-location': 'warn',
  'qwik/jsx-key': 'warn',
  'qwik/unused-server': 'error',
  'qwik/jsx-img': 'warn',
  'qwik/jsx-a': 'warn',
  'qwik/no-use-visible-task': 'warn',
  'qwik/serializer-signal-usage': 'error',
};
const strictRules = {
  'qwik/valid-lexical-scope': 'error',
  'qwik/use-method-usage': 'error',
  'qwik/loader-location': 'error',
  'qwik/no-react-props': 'error',
  'qwik/prefer-classlist': 'error',
  'qwik/jsx-no-script-url': 'error',
  'qwik/jsx-key': 'error',
  'qwik/unused-server': 'error',
  'qwik/jsx-img': 'error',
  'qwik/jsx-a': 'error',
  'qwik/no-use-visible-task': 'warn',
  'qwik/serializer-signal-usage': 'error',
};

const configs = {
  recommended: {
    plugins: ['qwik'],
    rules: recommendedRules,
  },
  strict: {
    plugins: ['qwik'],
    rules: strictRules,
  },
};

const qwikEslint9Plugin = {
  configs: {
    recommended: [
      {
        plugins: {
          qwik: this,
        },
        rules: recommendedRules,
      },
    ],
    strict: [
      {
        plugins: {
          qwik: this,
        },
        rules: strictRules,
      },
    ],
  },
  meta: {
    name: pkg.name,
    version: pkg.version,
  },
  rules,
};

export { configs, qwikEslint9Plugin, rules };
