import { strFromU8 } from 'fflate';
import { assert, expect, test } from 'vitest';
import {
  compressFiles,
  createPlaygroundShareUrl,
  dictionary,
  filesToStr,
  parseCompressedFiles,
  parsePlaygroundShareUrl,
  strToFiles,
} from './repl-share-url';

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
  const dictionaryAsString = strFromU8(dictionary);
  // !!! THIS DICTIONARY MUST NEVER CHANGE - ONLY ALLOW PREPENDING !!!
  expect(dictionaryAsString).toMatchInlineSnapshot(`
    "8|/app.tsx|149|import { component$ } from '@qwik.dev/core';

    export default component$(() => {
      return (
        <div>
          <h1>Hello from Qwik!</h1>
        </div>
      );
    |0||1448|<div>  </div>  </button> props: class return ( story component$( store string state export const span type href={ page strong count useSignal< useStore< qwik import { } from searchInput console.log( searchResults builder useTask$( stories style={ news export default data </article> track onClick$= new nav map link debounced controller user useStyles$( useStylesScoped$( url title timeoutId time_ago second response Date.now() minute main item interface hour disabled aria any State update transform the target suggestion setTimeout selectedValue rotate render people number list label https:// header deg debouncedGetPeople debounce component comments_count comments clock background await new Promise args SuggestionsListComponent IStory IState IComment GrandChild Clock Child AutoComplete 360 yellow with view useVisibleTask$( true tmrId timer then swapi styles signal section search results resolve rel prev points parsedResponse null noreferrer name more length json job items isServer index github getPeople function fetch example domain dev delay css container com click clearTimeout async api _blank Star Wars API This The StoryPreview Stories ReturnType Qwik App Page Nav HackerNewsCSS AbortController server$( routeAction$( routeLoader$( useContent( useDocumentHead( useLocation( useNavigate( validator$( zod$( noSerialize(  </Slot> useComputed$( useOnDocument( useOnWindow( useResource$( useContext( useContextProvider( createContextId<|8|/app.tsx|114|import { component$ } from '@builder.io/qwik';

    export default component$(() => {
      return <p>Hello Qwik</p>;
    });
    |17|/entry.server.tsx|201|import { renderToString, type RenderOptions } from '@builder.io/qwik/server';
    import { Root } from './root';

    export default function (opts: RenderOptions) {
      return renderToString(<Root />, opts);
    }
    |9|/root.tsx|192|import App from './app';

    export const Root = () => {
      return (
        <>
          <head>
            <title>Hello Qwik</title>
          </head>
          <body>
            <App />
          </body>
        </>
      );
    };
    "
  `);
});

test('previous URLs still work', () => {
  expect(parsePlaygroundShareUrl('f=G000o4mG5EQDAA')).toHaveProperty(
    'files',
    // DO NOT UPDATE THIS TEST - all these URLs must work forever
    expect.arrayContaining([
      expect.objectContaining({
        path: '/app.tsx',
        code: "import { component$ } from '@builder.io/qwik';\n\nexport default component$(() => {\n  return <p>Hello Qwik</p>;\n});\n",
      }),
    ])
  );
  expect(
    parsePlaygroundShareUrl(
      'f=Q0o0xgaW2BKNDrDkqNCB15QUpyFIgKTl51uBeGA%2BKO%2BBIwaW0W1A6SI%2FDWQzyKm1wKBDVwyU0lAqUNJRqE4GFc3AqLNSCnENDlGq1QTpAGJ43a5RDa6oa0FOgBsDbxkAXQIMCqAWMIktXqqBSvRgNoNMRg7C0XQ%2FJNM9AA'
    )
  ).toHaveProperty(
    'files',
    // DO NOT UPDATE THIS TEST - all these URLs must work forever
    expect.arrayContaining([
      expect.objectContaining({
        path: '/app.tsx',
        code: `import { component$, jsx, useTask$ } from '@builder.io/qwik';

export default component$(() => {
  const foo:{
    contents: ReturnType<typeof jsx>
  } = {
    contents: jsx("p", {children:"TEST"})
  }
  useTask$(({track}) =>{
    console.log(foo);
  });
  return (
    <>
    {foo.contents}
    </>
  );
});
`,
      }),
    ])
  );
});
