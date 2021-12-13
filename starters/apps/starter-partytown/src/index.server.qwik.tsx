/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { h } from '@builder.io/qwik';
import { renderToString, RenderToStringOptions, QwikLoader } from '@builder.io/qwik/server';
import { MyApp } from './my-app.qwik';

/**
 * Entry point for server-side pre-rendering.
 *
 * @returns a promise when all of the rendering is completed.
 */
export default function serverRender(opts: RenderToStringOptions) {
  return renderToString(
    <html>
      <head>
        <title>Qwik + Partytown Blank App</title>
        <script defer async src="~partytown/debug/partytown.js"></script>
      </head>
      <body>
        <MyApp />
        <script type="text/partytown">
          ({partyTownExampleWhichBlocksMainThreadForOneSecond.toString()})()
        </script>
        <QwikLoader debug={opts.debug} events={['click', 'keyup', 'expensive-computation-done']} />
      </body>
    </html>,
    opts
  );
}

function partyTownExampleWhichBlocksMainThreadForOneSecond() {
  // Block execution for 1 second.
  const start = new Date().getTime();
  // eslint-disable-next-line no-console
  console.log('Expensive computation started at:', start);
  let end = 0;
  while (end < start + 2500) {
    end = new Date().getTime();
  }
  // eslint-disable-next-line no-console
  console.log('Expensive computation ended at:', end);
  document.dispatchEvent(new Event('expensive-computation-done', { bubbles: true }));
}
