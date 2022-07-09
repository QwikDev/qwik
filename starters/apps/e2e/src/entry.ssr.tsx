import type { FunctionComponent } from '@builder.io/qwik';
import { renderToString, RenderOptions } from '@builder.io/qwik/server';
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
import { Toggle } from './components/toggle/toggle';
import { Styles } from './components/styles/styles';
import { BroadcastEvents } from './components/broadcast-events/broadcast-event';
import { Weather } from './components/resource/weather';
import { ResourceApp } from './components/resource/resource';

/**
 * Entry point for server-side pre-rendering.
 *
 * @returns a promise when all of the rendering is completed.
 */
export function render(opts: RenderOptions) {
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
    '/e2e/toggle': () => <Toggle />,
    '/e2e/styles': () => <Styles />,
    '/e2e/broadcast-events': () => <BroadcastEvents />,
    '/e2e/weather': () => <Weather />,
    '/e2e/resource': () => <ResourceApp />,
  };
  const Test = tests[url.pathname];

  // Render segment instead
  if (url.searchParams.has('fragment')) {
    return renderToString(
      <>
        <Test />
      </>,
      {
        debug: true,
        fragmentTagName: 'container',
        qwikLoader: {
          include: url.searchParams.get('loader') !== 'false',
          events: ['click'],
        },
        ...opts,
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
    { debug: true, qwikLoader: { include: true }, ...opts }
  );
}
