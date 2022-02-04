import {
  Fragment,
  h,
  Host,
  $,
  component$,
  Slot,
  component,
  PropsOf,
  getProps,
  useEvent,
  onRender$,
  useStore,
} from '@builder.io/qwik';
/* eslint no-console: ["off"] */

export interface Cmp {
  class?: string;
  isLazy?: boolean;
  isHydrated?: boolean;
  children?: Cmp[];
  related?: Cmp;
}

type ArchMode = 'monolith' | 'island' | 'uIslet';

export const ArchApp = component$((props: { monolith: Cmp; islands: Cmp; uIslets: Cmp }) => {
  return onRender$(() => (
    <>
      <h1>Monolith</h1>
      <b>Examples:</b> Angular, React, Solid, Svelte, Vue, WebComponents
      <MonolithScrubber cmp={props.monolith} />
      <Browser class="monolith">
        <Component
          cmp={props.monolith}
          arch="monolith"
          class={getCmpClass(props.monolith, 'app')}
        />
      </Browser>
      <h1>Island</h1>
      <b>Examples:</b> Astro
      <Browser class="island">
        <Component cmp={props.islands} arch="island" class={getCmpClass(props.islands, 'app')} />
      </Browser>
      <b>Issue:</b> Bootstrapping independent applications
      <ul>
        <li>No standard way of doing inter-island communication.</li>
        <li>Creating islands is a heavy weight operation.</li>
      </ul>
      <h1>
        µIslet &nbsp;
        <img
          width={100}
          src="https://camo.githubusercontent.com/3518364b161ab1351455c0f3774d01973e25602a4b63a3e9129c21deddb2f223/68747470733a2f2f63646e2e6275696c6465722e696f2f6170692f76312f696d6167652f617373657473253246594a494762346930316a7677305352644c3542742532463636376162366332323833643463346438373866623930383361616363313066"
        />
      </h1>
      <Browser class="uIselt">
        <Component cmp={props.uIslets} arch="uIslet" class={getCmpClass(props.uIslets, 'app')} />
      </Browser>
    </>
  ));
});

export const Browser = component(
  'browser',
  $(() => {
    return onRender$(() => (
      <div class="browser">
        <div class="browser-url">
          <span>⇦ ⇨ ⟳</span>
          <input value="http://localhost/" />
        </div>
        <div class="browser-body">
          <Slot sdfdf="df" />
        </div>
      </div>
    ));
  })
);

export const Component = component(
  'component',
  $((props: { cmp: Cmp; arch: ArchMode }) => {
    return onRender$(() => (
      <Host class={getCmpClass(props.cmp)} on:click={Component_click}>
        {props.cmp.children &&
          props.cmp.children.map((cmp) => <Component cmp={cmp} arch={props.arch} />)}
        {props.cmp.children ? null : '...'}
      </Host>
    ));
  })
);

export const Component_click = async () => {
  // TODO(misko): Workaround for the fact that the click listener is sitting on `<Host>` and hence
  // has parent visibility. Correct solution is to have HOST mode when writing to getProps which would
  // take these issues into account.
  const element = useEvent().target as Element;
  const event = useEvent();
  const props = getProps<PropsOf<typeof Component>>(element);
  switch (props.arch) {
    case 'island':
      if (props.cmp.isLazy) {
        hydrateComponents(props.cmp, 200, 2);
      }
      break;
    case 'uIslet':
      if (event.target == element) {
        props.cmp.isHydrated = true;
        if (props.cmp.related) {
          await delay(200);
          props.cmp.related.isHydrated = true;
        }
      }
      break;
  }
};

function getCmpClass(cmp: Cmp, ...additionalClasses: string[]) {
  const classes: string[] = [];
  classes.push(...additionalClasses);
  cmp.class && classes.push(cmp.class);
  cmp.isHydrated && classes.push('hydrated');
  return classes.join(' ');
}

export const MonolithScrubber = component$((props: { cmp: Cmp }) => {
  const state = useStore({ step: 1 });
  return onRender$(() => (
    <>
      <ol>
        <li class={state.step >= 1 ? 'active' : ''}>
          SSR HTML sent from the server and rendered by browser.
        </li>
        <li class={state.step >= 2 ? 'active' : ''}>Browser downloads application Javascript.</li>
        <li class={state.step >= 3 ? 'active' : ''}>
          Browser executes application Javascript and starts the reconciliation process.
        </li>
        <li class={state.step >= 4 ? 'active' : ''}>
          Framework requests the lazy loaded components because they are visible.
        </li>
        <li class={state.step >= 5 ? 'active' : ''}>
          Framework completes the rehydration of the application.
        </li>
      </ol>
      <button on$:click={() => monolithUpdate(props.cmp, ++state.step)}>&gt;&gt;&gt;</button>
    </>
  ));
});

function monolithUpdate(cmp: Cmp, step: number) {
  switch (step) {
    case 3:
      hydrateComponents(cmp, 300, 1);
      break;
    case 5:
      hydrateComponents(cmp, 300, 2);
      break;
  }
}

async function hydrateComponents(cmp: Cmp | undefined, delay_ms: number, lazyDepth: number) {
  if (!cmp) return;
  if (cmp.isLazy) {
    lazyDepth--;
    if (lazyDepth == 0) return;
  }
  if (!cmp.isHydrated) {
    cmp.isHydrated = true;
    await delay(delay_ms);
  }
  cmp.children && cmp.children.forEach((c) => hydrateComponents(c, delay_ms, lazyDepth));
}

function delay(delay_ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, delay_ms));
}
