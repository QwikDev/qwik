import { test } from 'uvu';
import * as assert from 'uvu/assert';
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
  entryStrategy: 'hook',
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
  assert.equal(strToFiles(filesToStr(data.files)), data.files);
});
test('compressFiles', () => {
  assert.equal(
    compressFiles(data.files),
    'AzOrScvP18sqBhbENcgFghJQWEnTusasJimxCJs8UBgoDwCarkNLPwAAAA'
  );
});
test('parseCompressedFiles', () => {
  assert.equal(
    parseCompressedFiles('AzOrScvP18sqBhbENcgFghJQWEnTusasJimxCJs8UBgoDwCarkNLPwAAAA'),
    data.files
  );
});
test('round trip compressed', () => {
  assert.equal(parseCompressedFiles(compressFiles(data.files)), data.files);
});
test('createPlaygroundShareUrl', () => {
  assert.equal(
    createPlaygroundShareUrl(data),
    '/playground/#v=1.2.3&f=AzOrScvP18sqBhbENcgFghJQWEnTusasJimxCJs8UBgoDwCarkNLPwAAAA'
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
    '/playground/#v=1.2.3&buildMode=production&entryStrategy=module&f=AwMAAAAAAAAAAAA'
  );
});

test('dictionary is unchanged', () => {
  assert.equal(
    strFromU8(dictionary),
    "8|/app.tsx|114|import { component$ } from '@builder.io/qwik';\n" +
      '\n' +
      'export default component$(() => {\n' +
      '  return <p>Hello Qwik</p>;\n' +
      '});\n' +
      "|17|/entry.server.tsx|201|import { renderToString, type RenderOptions } from '@builder.io/qwik/server';\n" +
      "import { Root } from './root';\n" +
      '\n' +
      'export default function (opts: RenderOptions) {\n' +
      '  return renderToString(<Root />, opts);\n' +
      '}\n' +
      "|9|/root.tsx|192|import App from './app';\n" +
      '\n' +
      'export const Root = () => {\n' +
      '  return (\n' +
      '    <>\n' +
      '      <head>\n' +
      '        <title>Hello Qwik</title>\n' +
      '      </head>\n' +
      '      <body>\n' +
      '        <App />\n' +
      '      </body>\n' +
      '    </>\n' +
      '  );\n' +
      '};\n' +
      '|0||1203|<div> </div> props: class return ( story component$( store string state export const span type href={ page strong count useSignal< useStore< qwik import { } from searchInput console.log( searchResults builder useTask$( stories style={ news export default data button article track onClick$= new nav map link debounced controller user useStyles$( useStylesScoped$( url title timeoutId time_ago second response Date.now() minute main item interface hour disabled aria any State update transform the target suggestion setTimeout selectedValue rotate render people number list label https:// header deg debouncedGetPeople debounce component comments_count comments clock background await new Promise args SuggestionsListComponent IStory IState IComment GrandChild Clock Child AutoComplete 360 yellow with view useVisibleTask$( true tmrId timer then swapi styles signal section search results resolve rel prev points parsedResponse null noreferrer name more length json job items isServer index github getPeople function fetch example domain dev delay css container com click clearTimeout async api _blank Star Wars API This The StoryPreview Stories ReturnType Qwik App Page Nav HackerNewsCSS AbortController'
  );
});

test.run();
