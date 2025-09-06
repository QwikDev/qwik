import { assert, test } from 'vitest';
import {
  filesToStr,
  strToFiles,
  createPlaygroundShareUrl,
  compressFiles,
  parseCompressedFiles,
  dictionary,
} from './repl-share-url';
import { strFromU8 } from 'fflate';

const data = {
  version: '1.2.3',
  buildMode: 'development',
  entryStrategy: 'segment',
  files: [
    {
      path: 'foo.js',
      code: 'console.log("foo");',
    },
    {
      path: 'bar.js',
      code: 'console.log("bar");',
    },
  ],
};
test('filesToStr', () => {
  assert.equal(
    filesToStr(data.files),
    '6|foo.js|19|console.log("foo");|6|bar.js|19|console.log("bar");'
  );
});
test('round trip str', () => {
  assert.deepEqual(strToFiles(filesToStr(data.files)), data.files);
});
test('compressFiles', () => {
  assert.equal(compressFiles(data.files), 'M6tJy8/XyyoGeqYGub5UAgoraVrXmNUkJRZhkwcKA+UB');
});
test('parseCompressedFiles', () => {
  assert.deepEqual(
    parseCompressedFiles('M6tJy8/XyyoGeqYGub5UAgoraVrXmNUkJRZhkwcKA+UB'),
    data.files
  );
});
test('round trip compressed', () => {
  assert.deepEqual(parseCompressedFiles(compressFiles(data.files)), data.files);
});
test('createPlaygroundShareUrl', () => {
  assert.deepEqual(
    createPlaygroundShareUrl(data),
    '/playground/#v=1.2.3&f=M6tJy8%2FXyyoGeqYGub5UAgoraVrXmNUkJRZhkwcKA%2BUB'
  );
});
test('createPlaygroundShareUrl 2', () => {
  assert.equal(
    createPlaygroundShareUrl({
      ...data,
      buildMode: 'production',
      entryStrategy: 'module',
      files: [],
    }),
    '/playground/#v=1.2.3&buildMode=production&entryStrategy=module&f=AwA'
  );
});

test('dictionary is unchanged', () => {
  assert.equal(
    strFromU8(dictionary),
    "0||1448|<div>  </div>  </button> props: class return ( story component$( store string state export const span type href={ page strong count useSignal< useStore< qwik import { } from searchInput console.log( searchResults builder useTask$( stories style={ news export default data </article> track onClick$= new nav map link debounced controller user useStyles$( useStylesScoped$( url title timeoutId time_ago second response Date.now() minute main item interface hour disabled aria any State update transform the target suggestion setTimeout selectedValue rotate render people number list label https:// header deg debouncedGetPeople debounce component comments_count comments clock background await new Promise args SuggestionsListComponent IStory IState IComment GrandChild Clock Child AutoComplete 360 yellow with view useVisibleTask$( true tmrId timer then swapi styles signal section search results resolve rel prev points parsedResponse null noreferrer name more length json job items isServer index github getPeople function fetch example domain dev delay css container com click clearTimeout async api _blank Star Wars API This The StoryPreview Stories ReturnType Qwik App Page Nav HackerNewsCSS AbortController server$( routeAction$( routeLoader$( useContent( useDocumentHead( useLocation( useNavigate( validator$( zod$( noSerialize(  </Slot> useComputed$( useOnDocument( useOnWindow( useResource$( useContext( useContextProvider( createContextId<|8|/app.tsx|114|import { component$ } from '@builder.io/qwik';\n\nexport default component$(() => {\n  return <p>Hello Qwik</p>;\n});\n|17|/entry.server.tsx|201|import { renderToString, type RenderOptions } from '@builder.io/qwik/server';\nimport { Root } from './root';\n\nexport default function (opts: RenderOptions) {\n  return renderToString(<Root />, opts);\n}\n|9|/root.tsx|192|import App from './app';\n\nexport const Root = () => {\n  return (\n    <>\n      <head>\n        <title>Hello Qwik</title>\n      </head>\n      <body>\n        <App />\n      </body>\n    </>\n  );\n};\n"
  );
});
