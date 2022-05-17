import type { FunctionComponent } from '@builder.io/qwik';
import { renderToString, RenderToStringOptions } from '@builder.io/qwik/server';
import { Root } from './root';
import { LexicalScope } from './components/lexical-scope/lexicalScope';
import { SlotParent } from './components/slot/slot';
import { TwoListeners } from './components/two-listeners/twolisteners';
import { Render } from './components/render/render';
import { Events } from './components/events/events';
import { Async } from './components/async/async';
import { Containers } from './components/containers/container';
import { Factory } from './components/factory/factory';
import { Watch } from './components/watch/watch';
import { EffectClient } from './components/effect-client/effect-client';
import { ContextRoot } from './components/context/context';

/**
 * Entry point for server-side pre-rendering.
 *
 * @returns a promise when all of the rendering is completed.
 */
export function render(opts: RenderToStringOptions) {
  const url = typeof opts.url === 'string' ? new URL(opts.url) : opts.url!;

  const tests: Record<string, FunctionComponent> = {
    '/e2e/': () => <Root />,
    '/e2e/two-listeners': () => <TwoListeners />,
    '/e2e/slot': () => <SlotParent />,
    '/e2e/lexical-scope': () => <LexicalScope />,
    '/e2e/render': () => <Render />,
    '/e2e/events': () => <Events />,
    '/e2e/async': () => <Async />,
    '/e2e/container': () => <Containers />,
    '/e2e/factory': () => <Factory />,
    '/e2e/watch': () => <Watch />,
    '/e2e/effect-client': () => <EffectClient />,
    '/e2e/context': () => <ContextRoot />,
  };
  const Test = tests[url.pathname];

  // Render segment instead
  if (url.searchParams.has('fragment')) {
    return renderToString(
      <>
        <Test />
      </>,
      {
        ...opts,
        debug: true,
        fragmentTagName: 'div',
        qwikLoader: {
          include: url.searchParams.get('loader') !== 'false',
          events: ['click'],
        },
      }
    );
  }

  return renderToString(
    <html>
      <head>
        <meta charSet="utf-8" />
        <title>Qwik Blank App</title>
      </head>
      <body>
        <Test />
      </body>
    </html>,
    { ...opts, debug: true, qwikLoader: { include: true, events: ['click'] } }
  );
}
