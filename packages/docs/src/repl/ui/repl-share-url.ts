import { BUILD_MODE_OPTIONS, ENTRY_STRATEGY_OPTIONS } from './repl-options';
// We use deflate because it has no metadata, just raw compression
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

const dataDefaults: PlaygroundShareUrl = {
  version: '',
  buildMode: 'development',
  entryStrategy: 'segment',
  files: [],
};
export const parsePlaygroundShareUrl = (shareable: string) => {
  if (typeof shareable === 'string' && shareable.length > 0) {
    try {
      const params = new URLSearchParams(shareable);
      const data = { ...dataDefaults };

      const version = params.get('v')! || params.get('version')!;
      data.version =
        typeof version === 'string' && version.split('.').length > 2 ? version : 'bundled';

      const buildMode = params.get('buildMode')!;
      if (BUILD_MODE_OPTIONS.includes(buildMode)) {
        data.buildMode = buildMode;
      }

      const entryStrategy = params.get('entryStrategy')!;
      if (ENTRY_STRATEGY_OPTIONS.includes(entryStrategy)) {
        data.entryStrategy = entryStrategy;
      }

      if (params.has('files')) {
        // Old URLs that didn't compress
        // the files, used the `files` key
        const filesBase64 = params.get('files')!;
        if (typeof filesBase64 === 'string') {
          data.files = parseUncompressedFiles(filesBase64);
        }
      } else if (params.has('f')) {
        const filesBase64 = params.get('f');
        if (typeof filesBase64 === 'string') {
          data.files = parseCompressedFiles(filesBase64);
        }
      }
      if (data.files.length > 0) {
        return data;
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  }
};

export const filesToStr = (files: any[]) =>
  files.map((f) => `${f.path.length}|${f.path}|${f.code.length}|${f.code}`).join('|');
const readChunk = (str: string) => {
  const sepIdx = str.indexOf('|');
  if (sepIdx < 1) {
    console.error(str);
    throw new Error(`corrupt string`);
  }
  const length = Number(str.slice(0, sepIdx));
  if (isNaN(length) || str.length < sepIdx + length + 1) {
    throw new Error('string too short');
  }
  const chunk = str.slice(sepIdx + 1, sepIdx + 1 + length);
  const rest = str.slice(sepIdx + length + 2);
  return { chunk, rest };
};
export const strToFiles = (str: string) => {
  const files = [];
  while (str.length) {
    const { chunk: path, rest } = readChunk(str);
    const { chunk: code, rest: next } = readChunk(rest);
    str = next;
    files.push({ path, code });
  }
  return files;
};

// NEVER CHANGE THIS DATA or the filesToStr() output
// Do not re-order, change or remove entries
// This is a dictionary used for compression
// changes will BREAK older URLs
// You can add new entries to the beginning though.
export const dictionary = strToU8(
  filesToStr([
    {
      path: '/app.tsx',
      code: `import { component$ } from '@qwik.dev/core';\n\nexport default component$(() => {\n  return (\n    <div>\n      <h1>Hello from Qwik!</h1>\n    </div>\n  );\n`,
    },
    {
      path: '',
      // Extra words to help with compression
      // generated with
      // cat packages/docs/src/routes/examples/apps/*/*/app.tsx|sed -E 's/[^a-zA-Z0-9$_]+/\n/g'|sort|uniq -c|sort -rn|awk '$1>=2&&length($2)>2{printf $2 " "}'
      // and
      // find packages/ -name api.json | xargs cat | jq -r '.members | map(select(.kind == "Variable")) | .[].name'
      // and edited a bit
      // DO NOT CHANGE
      // you can NOT add new words to the end
      // You need to add a new section like this before this section instead
      code: `<div>  </div>  </button> props: class return ( story component$( store string state export const span type href={ page strong count useSignal< useStore< qwik import { } from searchInput console.log( searchResults builder useTask$( stories style={ news export default data </article> track onClick$= new nav map link debounced controller user useStyles$( useStylesScoped$( url title timeoutId time_ago second response Date.now() minute main item interface hour disabled aria any State update transform the target suggestion setTimeout selectedValue rotate render people number list label https:// header deg debouncedGetPeople debounce component comments_count comments clock background await new Promise args SuggestionsListComponent IStory IState IComment GrandChild Clock Child AutoComplete 360 yellow with view useVisibleTask$( true tmrId timer then swapi styles signal section search results resolve rel prev points parsedResponse null noreferrer name more length json job items isServer index github getPeople function fetch example domain dev delay css container com click clearTimeout async api _blank Star Wars API This The StoryPreview Stories ReturnType Qwik App Page Nav HackerNewsCSS AbortController server$( routeAction$( routeLoader$( useContent( useDocumentHead( useLocation( useNavigate( validator$( zod$( noSerialize(  </Slot> useComputed$( useOnDocument( useOnWindow( useResource$( useContext( useContextProvider( createContextId<`,
    },
    // The old default hello world app + supporting files
    {
      path: '/app.tsx',
      code: `import { component$ } from '@builder.io/qwik';\n\nexport default component$(() => {\n  return <p>Hello Qwik</p>;\n});\n`,
    },
    {
      path: '/entry.server.tsx',
      code: `import { renderToString, type RenderOptions } from '@builder.io/qwik/server';\nimport { Root } from './root';\n\nexport default function (opts: RenderOptions) {\n  return renderToString(<Root />, opts);\n}\n`,
    },
    {
      path: '/root.tsx',
      code: `import App from './app';\n\nexport const Root = () => {\n  return (\n    <>\n      <head>\n        <title>Hello Qwik</title>\n      </head>\n      <body>\n        <App />\n      </body>\n    </>\n  );\n};\n`,
    },
  ])
);

export const createPlaygroundShareUrl = (data: PlaygroundShareUrl, pathname = '/playground/') => {
  const params = new URLSearchParams();
  if (data.version !== 'bundled') {
    params.set('v', data.version);
  }
  if (data.buildMode !== dataDefaults.buildMode) {
    params.set('buildMode', data.buildMode);
  }
  if (data.entryStrategy !== dataDefaults.entryStrategy) {
    params.set('entryStrategy', data.entryStrategy);
  }

  params.set('f', compressFiles(data.files));

  return `${pathname}#${params.toString()}`;
};

export function compressFiles(files: any[]) {
  const filesStr = filesToStr(files);
  const filesBuf = strToU8(filesStr);
  const compressedUint8Array = deflateSync(filesBuf, { dictionary });
  const compressedString = strFromU8(compressedUint8Array, true);
  let filesBase64 = btoa(compressedString);
  // We can remove the padding
  if (filesBase64.endsWith('==')) {
    filesBase64 = filesBase64.slice(0, -2);
  } else if (filesBase64.endsWith('=')) {
    filesBase64 = filesBase64.slice(0, -1);
  }
  return filesBase64;
}

function parseUncompressedFiles(filesBase64: string) {
  const encoded = atob(filesBase64);
  const filesStr = decodeURIComponent(encoded);
  const files = JSON.parse(filesStr);

  if (Array.isArray(files)) {
    return files.filter((f) => typeof f.code === 'string' && typeof f.path === 'string');
  }

  return [];
}

export function parseCompressedFiles(filesBase64: string) {
  const encoded = atob(filesBase64);
  const compressedUint8Array = strToU8(encoded, true);

  let filesStr = '';

  try {
    const filesBuf = inflateSync(compressedUint8Array, { dictionary });
    filesStr = strFromU8(filesBuf);
  } catch (error) {
    console.error('Could not decode URL, falling back to uncompressed');
    // Treat string as not compressed
    filesStr = decodeURIComponent(encoded);
  }

  return strToFiles(filesStr);
}

interface PlaygroundShareUrl {
  version: any;
  buildMode: any;
  entryStrategy: any;
  files: any[];
}
