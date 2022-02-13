import { component$, h, onWatch$, onWatch, render, createStore } from '@builder.io/qwik';
import { ElementFixture, getTestPlatform } from '@builder.io/qwik/testing';
import { expectDOM } from '../../testing/expect-dom.unit';
import { stringifyQRL } from '../import/qrl';
import { $, QRL } from '../import/qrl.public';
import type { Observer } from './watch.public';

describe('watch', () => {
  let fixture: ElementFixture;
  beforeEach(() => (fixture = new ElementFixture()));

  it('should execute on initial run', async () => {
    const WatchInitialRun = component$(() => {
      const store = createStore({ count: 0 });
      onWatch$(() => store.count++);
      return $(() => <>{store.count}</>);
    });
    await render(fixture.host, <WatchInitialRun />);
    expectRendered(<div>1</div>);
  });

  it('should mark property src', async () => {
    let watchFn!: QRL;
    const WatchInitialRun = component$(() => {
      const store = createStore({ src: 'initial', dst: '' });
      onWatch((watchFn = $((obs: Observer) => (store.dst = obs(store).src))));
      return $(() => <>{store.dst}</>);
    });
    await render(fixture.host, <WatchInitialRun />);
    expectRendered(<div on:q-watch={stringifyQRL(watchFn)}>initial</div>);
  });

  it('should schedule a copy on update', async () => {
    const store = createStore({ src: 'initial', dst: '' });
    const WatchInitialRun = component$(() => {
      onWatch$((obs: Observer) => (store.dst = obs(store).src));
      return $(() => <>{store.dst}</>);
    });
    await render(fixture.host, <WatchInitialRun />);
    expectRendered(<div>initial</div>);

    store.src = 'update';
    await getTestPlatform(fixture.document).flush();
    expectRendered(<div>update</div>);

    store.dst = 'ignore';
    await getTestPlatform(fixture.document).flush();
    expectRendered(<div>ignore</div>);
  });

  function expectRendered(expected: h.JSX.Element, expectedErrors: string[] = []) {
    return expectDOM(fixture.host.firstElementChild!, expected, expectedErrors);
  }
});
